import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GERAYO FAST — Real-Time Audio Command" },
      { name: "description", content: "Real-time audio communication and priority override system for police, drivers and passengers." },
      { property: "og:title", content: "GERAYO FAST — Real-Time Audio Command" },
      { property: "og:description", content: "Real-time audio communication and priority override system for police, drivers and passengers." },
    ],
  }),
  component: GerayoApp,
});

type Role = "Police Officer" | "Driver" | "Passenger";

interface Peer {
  id: string;
  role: Role;
  pc: RTCPeerConnection;
  stream?: MediaStream;
  gain?: GainNode;
  audioEl?: HTMLAudioElement;
  level: number;
  overriding: boolean;
}

interface SignalMsg {
  type: "hello" | "offer" | "answer" | "ice" | "bye" | "override" | "restore" | "level";
  from: string;
  to?: string;
  role?: Role;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  level?: number;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const SPEEDING_CARS = [
  { plate: "RAG 001 A", driver: "J. Mugisha", speed: 92 },
  { plate: "RAB 442 C", driver: "A. Uwase", speed: 78 },
  { plate: "RAD 119 B", driver: "P. Habimana", speed: 65 },
  { plate: "RAC 808 K", driver: "S. Niyonzima", speed: 104 },
  { plate: "RAE 333 D", driver: "M. Ingabire", speed: 58 },
  { plate: "RAF 777 G", driver: "T. Kayitare", speed: 81 },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function GerayoApp() {
  const [plate, setPlate] = useState("");
  const [role, setRole] = useState<Role>("Driver");
  const [joined, setJoined] = useState(false);
  const [myId] = useState(() => uid());

  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const peersRef = useRef<Record<string, Peer>>({});
  const channelRef = useRef<BroadcastChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [myLevel, setMyLevel] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [othersOverriding, setOthersOverriding] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");

  const roomKey = useMemo(() => plate.trim().toUpperCase().replace(/\s+/g, "_"), [plate]);

  const send = useCallback((msg: SignalMsg) => {
    channelRef.current?.postMessage(msg);
  }, []);

  const updatePeer = (id: string, patch: Partial<Peer>) => {
    const cur = peersRef.current[id];
    if (!cur) return;
    const next = { ...cur, ...patch };
    peersRef.current[id] = next;
    setPeers({ ...peersRef.current });
  };

  const removePeer = useCallback((id: string) => {
    const p = peersRef.current[id];
    if (!p) return;
    try { p.pc.close(); } catch {}
    try { p.audioEl?.remove(); } catch {}
    delete peersRef.current[id];
    setPeers({ ...peersRef.current });
  }, []);

  const createPeer = useCallback((id: string, peerRole: Role, initiator: boolean) => {
    if (peersRef.current[id]) return peersRef.current[id];
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer: Peer = { id, role: peerRole, pc, level: 0, overriding: false };
    peersRef.current[id] = peer;
    setPeers({ ...peersRef.current });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice", from: myId, to: id, candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      const ctx = audioCtxRef.current!;
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      // Route to destination via gain
      src.connect(gain).connect(ctx.destination);

      // Also play through audio element to ensure autoplay in some browsers
      const audioEl = document.createElement("audio");
      audioEl.srcObject = stream;
      audioEl.autoplay = true;
      audioEl.muted = true; // avoid double playback (we use WebAudio path)
      document.body.appendChild(audioEl);

      // Level meter
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!peersRef.current[id]) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        updatePeer(id, { level: Math.min(1, rms * 3) });
        requestAnimationFrame(tick);
      };
      tick();

      updatePeer(id, { stream, gain, audioEl });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removePeer(id);
      }
    };

    if (initiator) {
      (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "offer", from: myId, to: id, sdp: offer, role });
      })();
    }

    return peer;
  }, [myId, role, send, removePeer]);

  const handleSignal = useCallback(async (msg: SignalMsg) => {
    if (msg.from === myId) return;
    if (msg.to && msg.to !== myId) return;

    switch (msg.type) {
      case "hello": {
        // someone joined the room; we initiate to them if our id < theirs (deterministic)
        if (!peersRef.current[msg.from]) {
          const initiator = myId < msg.from;
          createPeer(msg.from, msg.role!, initiator);
          // Reply hello so the new peer learns about us if they missed it
          send({ type: "hello", from: myId, to: msg.from, role });
        }
        break;
      }
      case "offer": {
        const peer = createPeer(msg.from, msg.role || "Driver", false);
        await peer.pc.setRemoteDescription(msg.sdp!);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        send({ type: "answer", from: myId, to: msg.from, sdp: answer, role });
        break;
      }
      case "answer": {
        const peer = peersRef.current[msg.from];
        if (peer) await peer.pc.setRemoteDescription(msg.sdp!);
        break;
      }
      case "ice": {
        const peer = peersRef.current[msg.from];
        if (peer && msg.candidate) {
          try { await peer.pc.addIceCandidate(msg.candidate); } catch (e) { console.warn(e); }
        }
        break;
      }
      case "bye": {
        removePeer(msg.from);
        break;
      }
      case "override": {
        // Police officer is broadcasting — duck their audio? No: duck OTHERS for us.
        // Rule: when officer presses, driver+passenger volumes drop to 0.6 globally.
        // For each local listener: if the speaker (msg.from) is the officer, lower gain on
        // peers that are Driver/Passenger (so officer's voice dominates).
        Object.values(peersRef.current).forEach((p) => {
          if (p.role !== "Police Officer" && p.gain) {
            p.gain.gain.setTargetAtTime(0.6, audioCtxRef.current!.currentTime, 0.02);
          }
          if (p.id === msg.from) updatePeer(p.id, { overriding: true });
        });
        if (role !== "Police Officer") setOthersOverriding(true);
        break;
      }
      case "restore": {
        Object.values(peersRef.current).forEach((p) => {
          if (p.gain) p.gain.gain.setTargetAtTime(1.0, audioCtxRef.current!.currentTime, 0.02);
          if (p.id === msg.from) updatePeer(p.id, { overriding: false });
        });
        setOthersOverriding(false);
        break;
      }
      case "level": {
        if (peersRef.current[msg.from]) {
          updatePeer(msg.from, { level: msg.level || 0 });
        }
        break;
      }
    }
  }, [myId, role, createPeer, send, removePeer]);

  const join = async () => {
    if (!plate.trim()) return;
    setStatus("Requesting microphone…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;

      // Local level meter
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setMyLevel(Math.min(1, rms * 3));
        requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      setMicError((err as Error).message);
      setStatus("Microphone blocked");
      return;
    }

    const ch = new BroadcastChannel(`gerayo-room-${roomKey}`);
    channelRef.current = ch;
    ch.onmessage = (e) => handleSignal(e.data as SignalMsg);

    setJoined(true);
    setStatus(`Connected to room ${plate.toUpperCase()}`);
    // Announce
    setTimeout(() => send({ type: "hello", from: myId, role }), 100);
  };

  const leave = useCallback(() => {
    send({ type: "bye", from: myId });
    Object.keys(peersRef.current).forEach(removePeer);
    channelRef.current?.close();
    channelRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setJoined(false);
    setStatus("Disconnected");
  }, [myId, removePeer, send]);

  useEffect(() => {
    const handler = () => {
      if (channelRef.current) send({ type: "bye", from: myId });
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [myId, send]);

  const startBroadcast = () => {
    if (role !== "Police Officer") return;
    setIsBroadcasting(true);
    send({ type: "override", from: myId });
  };
  const stopBroadcast = () => {
    if (role !== "Police Officer") return;
    setIsBroadcasting(false);
    send({ type: "restore", from: myId });
  };

  // Effective volume display for self
  const myEffectiveVolume = role === "Police Officer"
    ? 1.0
    : othersOverriding ? 0.6 : 1.0;

  if (!joined) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-red-600 flex items-center justify-center font-black">GF</div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">GERAYO FAST</h1>
              <p className="text-xs text-zinc-400">Real-Time Tactical Audio Command</p>
            </div>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Vehicle Plate Number</label>
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="RAG 001 A"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 mb-4 font-mono text-lg tracking-widest uppercase focus:outline-none focus:border-red-500"
          />

          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Connect as</label>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {(["Police Officer", "Driver", "Passenger"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-2 py-3 rounded-lg text-xs font-semibold border transition ${
                  role === r
                    ? "bg-red-600 border-red-500 text-white"
                    : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={join}
            disabled={!plate.trim()}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-white font-bold py-3 rounded-lg transition"
          >
            CONNECT TO ROOM
          </button>

          {micError && <p className="mt-4 text-sm text-red-400">Mic error: {micError}</p>}
          <p className="mt-6 text-xs text-zinc-500 leading-relaxed">
            Open this page in multiple tabs with the same plate number to join the same voice room. Allow microphone access in each tab.
          </p>
        </div>
      </div>
    );
  }

  const peerList = Object.values(peers);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-600 flex items-center justify-center font-black text-sm">GF</div>
            <div>
              <h1 className="text-lg font-black tracking-tight">GERAYO FAST</h1>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">{status}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-zinc-400">Room</div>
              <div className="font-mono font-bold">{plate.toUpperCase()}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-400">Role</div>
              <div className={`font-bold ${role === "Police Officer" ? "text-red-400" : "text-zinc-200"}`}>{role}</div>
            </div>
            <button onClick={leave} className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-semibold">Disconnect</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-3 gap-6">
        {/* Left: voice room */}
        <section className="lg:col-span-2 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">Voice Room</h2>
              <span className="text-xs text-zinc-400">{peerList.length + 1} connected</span>
            </div>

            {/* Self card */}
            <UserCard
              name="You"
              role={role}
              level={myLevel}
              volume={myEffectiveVolume}
              self
              broadcasting={isBroadcasting}
            />

            <div className="mt-4 space-y-3">
              {peerList.length === 0 && (
                <div className="text-sm text-zinc-500 italic px-4 py-8 text-center border border-dashed border-zinc-800 rounded-xl">
                  Waiting for other users to join room <span className="font-mono">{plate.toUpperCase()}</span>… Open another tab and join with the same plate.
                </div>
              )}
              {peerList.map((p) => {
                const peerVolume = p.role === "Police Officer"
                  ? 1.0
                  : isBroadcasting || p.overriding || othersOverriding ? 0.6 : 1.0;
                // For peers: volume shown is what WE play them at locally
                const localPlaybackVol = p.role === "Police Officer"
                  ? 1.0
                  : isBroadcasting ? 0.6 : 1.0;
                return (
                  <UserCard
                    key={p.id}
                    name={`User ${p.id.slice(0, 4)}`}
                    role={p.role}
                    level={p.level}
                    volume={localPlaybackVol}
                    broadcasting={p.overriding}
                  />
                );
              })}
            </div>
          </div>

          {/* Police PTT */}
          {role === "Police Officer" && (
            <div className="bg-gradient-to-br from-red-950 to-zinc-900 border border-red-900 rounded-2xl p-6">
              <h2 className="font-bold text-lg mb-1">Priority Broadcast</h2>
              <p className="text-xs text-zinc-400 mb-4">
                Press and hold to override. All Driver/Passenger streams duck to 60% while you speak.
              </p>
              <button
                onMouseDown={startBroadcast}
                onMouseUp={stopBroadcast}
                onMouseLeave={() => isBroadcasting && stopBroadcast()}
                onTouchStart={(e) => { e.preventDefault(); startBroadcast(); }}
                onTouchEnd={(e) => { e.preventDefault(); stopBroadcast(); }}
                className={`w-full select-none py-10 rounded-2xl font-black text-2xl tracking-wider transition-all duration-150 ${
                  isBroadcasting
                    ? "bg-red-500 shadow-[0_0_60px_rgba(239,68,68,0.8)] scale-[0.98] ring-4 ring-red-300"
                    : "bg-red-600 hover:bg-red-500 shadow-lg"
                }`}
              >
                {isBroadcasting ? "🔴 BROADCASTING…" : "PRESS TO TALK / BROADCAST"}
              </button>
            </div>
          )}

          {role !== "Police Officer" && othersOverriding && (
            <div className="bg-red-950/40 border border-red-900 rounded-xl p-4 text-sm text-red-200 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
              Officer override active — your stream is ducked to 60%.
            </div>
          )}
        </section>

        {/* Right: speeding cars */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">Speed Watch</h2>
            <span className="text-xs text-zinc-400">Limit 70 km/h</span>
          </div>
          <div className="space-y-2">
            {SPEEDING_CARS.map((c) => {
              const over = c.speed > 70;
              return (
                <div
                  key={c.plate}
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    over ? "bg-red-950/40 border-red-900" : "bg-zinc-800/50 border-zinc-800"
                  }`}
                >
                  <div>
                    <div className="font-mono font-bold text-sm">{c.plate}</div>
                    <div className="text-xs text-zinc-400">{c.driver}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-black ${over ? "text-red-400" : "text-zinc-300"}`}>{c.speed}</div>
                    <div className="text-[10px] uppercase text-zinc-500">km/h</div>
                  </div>
                  {role === "Police Officer" && (
                    <button
                      onClick={() => {
                        setPlate(c.plate);
                        leave();
                      }}
                      className="ml-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-lg"
                    >
                      Call
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-500 mt-4 leading-relaxed">
            Officer: tap "Call" to set the plate and reconnect to that vehicle's voice room.
          </p>
        </section>
      </main>

      <footer className="text-center text-xs text-zinc-600 py-6">
        GERAYO FAST · WebRTC + Audio Ducking Demo · STUN: stun.l.google.com
      </footer>
    </div>
  );
}

function UserCard({
  name, role, level, volume, self, broadcasting,
}: {
  name: string; role: Role; level: number; volume: number; self?: boolean; broadcasting?: boolean;
}) {
  const roleColor =
    role === "Police Officer" ? "text-red-400 border-red-900 bg-red-950/30"
    : role === "Driver" ? "text-amber-300 border-amber-900 bg-amber-950/20"
    : "text-emerald-300 border-emerald-900 bg-emerald-950/20";

  const volPct = Math.round(volume * 100);
  const lvlPct = Math.round(level * 100);
  const ducked = volume < 1.0;

  return (
    <div className={`rounded-xl border p-4 ${roleColor}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-bold text-sm flex items-center gap-2">
            {name}{self && <span className="text-[10px] uppercase bg-zinc-800 px-2 py-0.5 rounded">you</span>}
            {broadcasting && <span className="text-[10px] uppercase bg-red-600 text-white px-2 py-0.5 rounded animate-pulse">LIVE</span>}
          </div>
          <div className="text-[10px] uppercase tracking-wider opacity-70">{role}</div>
        </div>
        <div className={`text-right font-mono font-bold text-lg ${ducked ? "text-red-300" : ""}`}>
          {volPct}%
          <div className="text-[10px] uppercase opacity-70 font-sans">volume</div>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider opacity-70 mb-1">
            <span>Mic Level</span><span>{lvlPct}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-75"
              style={{ width: `${lvlPct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider opacity-70 mb-1">
            <span>Output Volume</span>
            <span className={ducked ? "text-red-300 font-bold" : ""}>{ducked ? "DUCKED" : "NORMAL"}</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${ducked ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${volPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
