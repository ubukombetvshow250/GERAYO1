import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/driver/$plate")({
  head: () => ({
    meta: [
      { title: "Driver Profile — GERAYO FAST" },
      { name: "description", content: "Driver history, violations, and reputation score." },
    ],
  }),
  component: DriverProfilePage,
});

interface SpeedCar {
  plate: string;
  driver: string;
  speed: number;
}

interface EvidenceMeta {
  id: string;
  timestamp: number;
  plate: string;
  durationMs: number;
}

interface Violation {
  id: string;
  timestamp: number;
  speed: number;
  limit: number;
  location: string;
  fine: number;
  status: "Unpaid" | "Paid" | "Disputed";
}

const SPEED_LIMIT = 70;
const LOCATIONS = ["KN 5 Ave", "Kicukiro Centre", "Nyabugogo Hwy", "Kimironko Rd", "Remera Junction", "Sonatube"];

function seedViolations(plate: string, currentSpeed: number): Violation[] {
  // Deterministic-ish demo history based on plate
  const seed = plate.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const count = 3 + (seed % 5);
  const out: Violation[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = ((seed * (i + 1)) % 60) + 1;
    const sp = SPEED_LIMIT + ((seed + i * 7) % 35) + 3;
    out.push({
      id: `${plate}-${i}`,
      timestamp: Date.now() - daysAgo * 24 * 3600 * 1000,
      speed: sp,
      limit: SPEED_LIMIT,
      location: LOCATIONS[(seed + i) % LOCATIONS.length],
      fine: 25000 + ((sp - SPEED_LIMIT) * 1500),
      status: i === 0 && currentSpeed > SPEED_LIMIT ? "Unpaid" : (i % 3 === 0 ? "Paid" : (i % 3 === 1 ? "Unpaid" : "Disputed")),
    });
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

function DriverProfilePage() {
  const { plate } = Route.useParams();
  const decodedPlate = decodeURIComponent(plate).toUpperCase();

  const [cars, setCars] = useState<SpeedCar[]>([]);
  const [evidence, setEvidence] = useState<EvidenceMeta[]>([]);

  useEffect(() => {
    const load = () => {
      try {
        setCars(JSON.parse(localStorage.getItem("gerayo_cars") || "[]"));
        setEvidence(JSON.parse(localStorage.getItem("gerayo_evidence") || "[]"));
      } catch { /* noop */ }
    };
    load();
    const id = setInterval(load, 1500);
    return () => clearInterval(id);
  }, []);

  const car = useMemo(
    () => cars.find((c) => c.plate.toUpperCase() === decodedPlate),
    [cars, decodedPlate]
  );

  const driverName = car?.driver || "Unknown Driver";
  const currentSpeed = car?.speed ?? 0;
  const isSpeeding = currentSpeed > SPEED_LIMIT;

  const violations = useMemo(() => seedViolations(decodedPlate, currentSpeed), [decodedPlate, currentSpeed]);
  const myEvidence = useMemo(
    () => evidence.filter((e) => e.plate.toUpperCase() === decodedPlate),
    [evidence, decodedPlate]
  );

  const totalFines = violations.reduce((a, v) => a + v.fine, 0);
  const unpaidFines = violations.filter((v) => v.status === "Unpaid").reduce((a, v) => a + v.fine, 0);

  // Reputation score: starts at 100, each violation -8, unpaid -extra 5
  const score = Math.max(
    0,
    100 - violations.length * 8 - violations.filter((v) => v.status === "Unpaid").length * 5
  );
  const scoreColor =
    score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-300" : "text-red-400";
  const scoreLabel =
    score >= 75 ? "GOOD" : score >= 50 ? "WARNING" : "HIGH RISK";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-600 flex items-center justify-center font-black text-sm">GF</div>
            <div>
              <h1 className="text-lg font-black tracking-tight">Driver Profile</h1>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">GERAYO FAST · Records</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/" className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-semibold">← Room</Link>
            <Link to="/map" className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-semibold">🗺️ Map</Link>
            <Link to="/admin" className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-semibold">Admin</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Identity card */}
        <section className="bg-gradient-to-br from-zinc-900 to-zinc-900/60 border border-zinc-800 rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-start md:items-center">
          <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-red-600 to-amber-500 flex items-center justify-center text-3xl font-black shrink-0">
            {driverName.split(" ").map((s) => s[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-zinc-500">Driver</div>
            <h2 className="text-3xl font-black">{driverName}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg bg-zinc-800 border border-zinc-700 px-3 py-1 rounded-lg tracking-widest">
                {decodedPlate}
              </span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${isSpeeding ? "bg-red-600 text-white animate-pulse" : car ? "bg-emerald-900/60 text-emerald-300 border border-emerald-800" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>
                {car ? (isSpeeding ? `🚨 SPEEDING ${currentSpeed} km/h` : `✓ NORMAL ${currentSpeed} km/h`) : "OFFLINE"}
              </span>
            </div>
          </div>
          <div className="text-center md:text-right">
            <div className="text-xs uppercase tracking-widest text-zinc-500">Reputation</div>
            <div className={`text-5xl font-black ${scoreColor}`}>{score}</div>
            <div className={`text-xs font-bold ${scoreColor}`}>{scoreLabel}</div>
          </div>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Violations" value={violations.length.toString()} accent="text-amber-300" />
          <StatCard label="Unpaid" value={violations.filter((v) => v.status === "Unpaid").length.toString()} accent="text-red-400" />
          <StatCard label="Total Fines" value={`${totalFines.toLocaleString()} RWF`} accent="text-zinc-200" />
          <StatCard label="Outstanding" value={`${unpaidFines.toLocaleString()} RWF`} accent={unpaidFines > 0 ? "text-red-400" : "text-emerald-400"} />
        </section>

        {/* Violations history */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg">Violation History</h3>
              <p className="text-xs text-zinc-400">Speeding incidents in the last 60 days.</p>
            </div>
            <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded">{violations.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Location</th>
                  <th className="py-2 pr-4 text-right">Speed</th>
                  <th className="py-2 pr-4 text-right">Over</th>
                  <th className="py-2 pr-4 text-right">Fine</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => (
                  <tr key={v.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-3 pr-4 font-mono text-xs text-zinc-300">
                      {new Date(v.timestamp).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">{v.location}</td>
                    <td className="py-3 pr-4 text-right font-bold text-red-300">{v.speed} km/h</td>
                    <td className="py-3 pr-4 text-right text-amber-300">+{v.speed - v.limit}</td>
                    <td className="py-3 pr-4 text-right font-mono">{v.fine.toLocaleString()}</td>
                    <td className="py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${
                        v.status === "Paid" ? "bg-emerald-900/60 text-emerald-300" :
                        v.status === "Unpaid" ? "bg-red-900/60 text-red-300" :
                        "bg-amber-900/60 text-amber-300"
                      }`}>{v.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Evidence audio */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-1">Audio Evidence Logs</h3>
          <p className="text-xs text-zinc-400 mb-4">Officer broadcasts recorded for this vehicle.</p>
          {myEvidence.length === 0 ? (
            <div className="text-sm text-zinc-500 italic px-4 py-8 text-center border border-dashed border-zinc-800 rounded-xl">
              No audio evidence on file for {decodedPlate}.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {myEvidence.map((e) => (
                <li key={e.id} className="py-3 flex items-center gap-4 text-sm">
                  <span className="font-mono text-xs text-zinc-400">{new Date(e.timestamp).toLocaleString()}</span>
                  <span className="text-zinc-300">Duration: {(e.durationMs / 1000).toFixed(1)}s</span>
                  <span className="text-xs text-zinc-500 ml-auto">Audio file in active session</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="text-center text-xs text-zinc-600 py-6">
        GERAYO FAST · Driver Records · Demo data combined with live telemetry
      </footer>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-2xl font-black mt-1 ${accent}`}>{value}</div>
    </div>
  );
}
