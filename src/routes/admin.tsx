import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "GERAYO FAST — Admin Panel" },
      { name: "description", content: "Administrative control center for GERAYO FAST: vehicles, sessions, evidence and system configuration." },
    ],
  }),
  component: AdminPanel,
});

const ADMIN_PASSWORD = "gerayofast2026";

interface Vehicle { plate: string; driver: string; phone: string; addedAt: number; }
interface Session { id: string; plate: string; role: string; joinedAt: number; }
interface Car { plate: string; driver: string; speed: number; }
interface EvidenceMeta { id: string; timestamp: number; plate: string; durationMs: number; }

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function save<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}
function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

function AdminPanel() {
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState("");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [evidence, setEvidence] = useState<EvidenceMeta[]>([]);
  const [speedLimit, setSpeedLimit] = useState(70);

  const [newPlate, setNewPlate] = useState("");
  const [newDriver, setNewDriver] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("gerayo_admin_authed") === "1") setAuthed(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const refresh = () => {
      setVehicles(load<Vehicle[]>("gerayo_vehicles", []));
      setSessions(load<Session[]>("gerayo_sessions", []));
      setCars(load<Car[]>("gerayo_cars", []));
      setEvidence(load<EvidenceMeta[]>("gerayo_evidence", []));
      setSpeedLimit(load<number>("gerayo_speed_limit", 70));
    };
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [authed]);

  const stats = useMemo(() => {
    const speeding = cars.filter((c) => c.speed > speedLimit).length;
    const avg = cars.length ? Math.round(cars.reduce((a, c) => a + c.speed, 0) / cars.length) : 0;
    const last24h = evidence.filter((e) => Date.now() - e.timestamp < 24 * 3600 * 1000).length;
    return { speeding, avg, last24h };
  }, [cars, evidence, speedLimit]);

  const submitPwd = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd === ADMIN_PASSWORD) {
      sessionStorage.setItem("gerayo_admin_authed", "1");
      setAuthed(true);
      setPwdError("");
    } else {
      setPwdError("Incorrect password. Default: gerayofast2026");
    }
  };

  const logout = () => {
    sessionStorage.removeItem("gerayo_admin_authed");
    setAuthed(false);
    setPwd("");
  };

  const addVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    const plate = newPlate.trim().toUpperCase();
    if (!plate || !newDriver.trim()) return;
    if (vehicles.some((v) => v.plate === plate)) { return; }
    const next = [{ plate, driver: newDriver.trim(), phone: newPhone.trim(), addedAt: Date.now() }, ...vehicles];
    setVehicles(next);
    save("gerayo_vehicles", next);
    setNewPlate(""); setNewDriver(""); setNewPhone("");
  };
  const removeVehicle = (plate: string) => {
    const next = vehicles.filter((v) => v.plate !== plate);
    setVehicles(next);
    save("gerayo_vehicles", next);
  };

  const clearSessions = () => { setSessions([]); save("gerayo_sessions", []); };
  const clearEvidence = () => { setEvidence([]); save("gerayo_evidence", []); };

  const updateLimit = (n: number) => {
    setSpeedLimit(n);
    save("gerayo_speed_limit", n);
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
        <form onSubmit={submitPwd} className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-600 flex items-center justify-center font-black">GF</div>
            <div>
              <h1 className="text-lg font-black">GERAYO FAST</h1>
              <p className="text-xs text-zinc-400">Admin Panel</p>
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-zinc-400 mb-2">Administrator password</label>
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono outline-none focus:border-red-500"
              placeholder="••••••••"
            />
            {pwdError && <p className="mt-2 text-xs text-red-400">{pwdError}</p>}
          </div>
          <button type="submit" className="w-full bg-red-600 hover:bg-red-500 rounded-lg py-2.5 font-bold">Unlock</button>
          <Link to="/" className="block text-center text-xs text-zinc-400 hover:text-zinc-200">← Back to dispatch</Link>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-600 flex items-center justify-center font-black text-sm">GF</div>
            <div>
              <h1 className="text-lg font-black tracking-tight">GERAYO FAST — Admin</h1>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">System control center</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-semibold">Dispatch</Link>
            <button onClick={logout} className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-semibold">Lock</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Stat cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Registered vehicles" value={vehicles.length} accent="text-zinc-100" />
          <StatCard label="Active speeding" value={stats.speeding} accent={stats.speeding > 0 ? "text-red-400" : "text-emerald-400"} />
          <StatCard label="Avg fleet speed" value={`${stats.avg} km/h`} accent="text-amber-300" />
          <StatCard label="Evidence (24h)" value={stats.last24h} accent="text-sky-300" />
        </section>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Vehicles */}
          <section className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-lg">Registered Vehicles</h2>
                <p className="text-xs text-zinc-400">Pre-approve plate numbers and assign drivers.</p>
              </div>
              <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded">{vehicles.length}</span>
            </div>

            <form onSubmit={addVehicle} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
              <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} placeholder="RAG 001 A"
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono uppercase outline-none focus:border-red-500" />
              <input value={newDriver} onChange={(e) => setNewDriver(e.target.value)} placeholder="Driver name"
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 outline-none focus:border-red-500" />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+250…"
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 outline-none focus:border-red-500" />
              <button type="submit" className="bg-red-600 hover:bg-red-500 rounded-lg py-2 font-bold">Add vehicle</button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="text-left py-2">Plate</th>
                    <th className="text-left py-2">Driver</th>
                    <th className="text-left py-2">Phone</th>
                    <th className="text-left py-2">Added</th>
                    <th className="text-right py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-zinc-500 italic">No vehicles registered yet.</td></tr>
                  )}
                  {vehicles.map((v) => (
                    <tr key={v.plate} className="border-b border-zinc-800/60">
                      <td className="py-2 font-mono font-bold">{v.plate}</td>
                      <td className="py-2">{v.driver}</td>
                      <td className="py-2 text-zinc-400">{v.phone || "—"}</td>
                      <td className="py-2 text-zinc-500 text-xs">{fmt(v.addedAt)}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => removeVehicle(v.plate)} className="text-red-400 hover:text-red-300 text-xs font-semibold">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Config */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="font-bold text-lg">System Config</h2>
              <p className="text-xs text-zinc-400">Adjust enforcement parameters.</p>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-zinc-400 mb-2">Speed limit (km/h)</label>
              <div className="flex items-center gap-3">
                <input type="range" min={30} max={120} step={5} value={speedLimit}
                  onChange={(e) => updateLimit(Number(e.target.value))} className="flex-1 accent-red-500" />
                <span className="font-mono font-bold text-lg w-16 text-right">{speedLimit}</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Vehicles above this trigger red alerts &amp; sirens on the dispatch dashboard.</p>
            </div>
            <div className="border-t border-zinc-800 pt-4 space-y-2">
              <h3 className="text-sm font-semibold">Maintenance</h3>
              <button onClick={clearSessions} className="w-full text-left bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-2 text-sm">Clear session log</button>
              <button onClick={clearEvidence} className="w-full text-left bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-2 text-sm">Clear evidence index</button>
            </div>
          </section>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Live fleet */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-lg">Live Fleet</h2>
                <p className="text-xs text-zinc-400">Real-time speed feed from dispatch.</p>
              </div>
              <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded">{cars.length} units</span>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {cars.length === 0 && <p className="text-sm text-zinc-500 italic">Open the dispatch dashboard in another tab to start the feed.</p>}
              {cars.map((c) => {
                const over = c.speed > speedLimit;
                return (
                  <div key={c.plate} className={`flex items-center justify-between rounded-lg px-3 py-2 border ${over ? "border-red-500/60 bg-red-950/30" : "border-zinc-800 bg-zinc-950"}`}>
                    <div>
                      <div className="font-mono font-bold">{c.plate}</div>
                      <div className="text-xs text-zinc-400">{c.driver}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono text-lg font-bold ${over ? "text-red-400" : "text-emerald-400"}`}>{c.speed}</div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500">km/h</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Sessions */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-lg">Session Log</h2>
                <p className="text-xs text-zinc-400">Recent connections to dispatch rooms.</p>
              </div>
              <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded">{sessions.length}</span>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {sessions.length === 0 && <p className="text-sm text-zinc-500 italic">No sessions logged yet.</p>}
              {sessions.map((s) => (
                <div key={s.id + s.joinedAt} className="flex items-center justify-between border border-zinc-800 bg-zinc-950 rounded-lg px-3 py-2">
                  <div>
                    <div className="font-mono font-bold">{s.plate}</div>
                    <div className="text-xs text-zinc-400">{s.role}</div>
                  </div>
                  <div className="text-right text-xs text-zinc-500">{fmt(s.joinedAt)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Evidence */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-lg">Evidence Index</h2>
              <p className="text-xs text-zinc-400">Recorded broadcasts metadata. Playback lives on the dispatch console.</p>
            </div>
            <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded">{evidence.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="text-left py-2">Time</th>
                  <th className="text-left py-2">Target Plate</th>
                  <th className="text-right py-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {evidence.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-zinc-500 italic">No recordings indexed yet.</td></tr>
                )}
                {evidence.map((e) => (
                  <tr key={e.id} className="border-b border-zinc-800/60">
                    <td className="py-2 text-zinc-300">{fmt(e.timestamp)}</td>
                    <td className="py-2 font-mono font-bold">{e.plate}</td>
                    <td className="py-2 text-right font-mono">{(e.durationMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-center text-xs text-zinc-600 py-6">
          GERAYO FAST Admin · Data syncs live from the dispatch console in this browser.
        </p>
      </main>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-2 text-3xl font-black ${accent}`}>{value}</div>
    </div>
  );
}
