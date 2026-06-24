import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "GERAYO FAST — Live Map" },
      { name: "description", content: "Real-time live map showing all monitored vehicles, their speed, and location across Kigali." },
      { property: "og:title", content: "GERAYO FAST — Live Map" },
      { property: "og:description", content: "Real-time live map of monitored vehicles and speed alerts." },
    ],
  }),
  component: LiveMapPage,
});

interface SpeedCar {
  plate: string;
  driver: string;
  speed: number;
}

interface CarPos {
  plate: string;
  driver: string;
  speed: number;
  lat: number;
  lng: number;
  heading: number; // radians
}

const KIGALI_CENTER: [number, number] = [-1.9536, 30.0606];
const SPEED_LIMIT = 70;

function loadCars(): SpeedCar[] {
  try {
    const raw = localStorage.getItem("gerayo_cars");
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return [
    { plate: "RAG 001 A", driver: "J. Mugisha", speed: 62 },
    { plate: "RAB 442 C", driver: "A. Uwase", speed: 55 },
    { plate: "RAD 119 B", driver: "P. Habimana", speed: 48 },
    { plate: "RAC 808 K", driver: "S. Niyonzima", speed: 73 },
    { plate: "RAE 333 D", driver: "M. Ingabire", speed: 41 },
    { plate: "RAF 777 G", driver: "T. Kayitare", speed: 67 },
  ];
}

function seedPositions(cars: SpeedCar[]): CarPos[] {
  return cars.map((c, i) => {
    const angle = (i / Math.max(1, cars.length)) * Math.PI * 2;
    const r = 0.012 + (i % 3) * 0.004;
    return {
      plate: c.plate,
      driver: c.driver,
      speed: c.speed,
      lat: KIGALI_CENTER[0] + Math.sin(angle) * r,
      lng: KIGALI_CENTER[1] + Math.cos(angle) * r,
      heading: Math.random() * Math.PI * 2,
    };
  });
}

function LiveMapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const LRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [positions, setPositions] = useState<CarPos[]>(() =>
    typeof window === "undefined" ? [] : seedPositions(loadCars())
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);

  // Init Leaflet on the client only
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, {
        center: KIGALI_CENTER,
        zoom: 14,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
    };
  }, []);

  // Live position simulator
  useEffect(() => {
    const id = window.setInterval(() => {
      const live = loadCars();
      setPositions((prev) => {
        const byPlate = new Map(prev.map((p) => [p.plate, p]));
        const next: CarPos[] = live.map((c) => {
          const existing = byPlate.get(c.plate);
          if (!existing) {
            const angle = Math.random() * Math.PI * 2;
            const r = 0.01 + Math.random() * 0.01;
            return {
              plate: c.plate,
              driver: c.driver,
              speed: c.speed,
              lat: KIGALI_CENTER[0] + Math.sin(angle) * r,
              lng: KIGALI_CENTER[1] + Math.cos(angle) * r,
              heading: Math.random() * Math.PI * 2,
            };
          }
          // step proportional to speed (km/h -> deg per tick)
          const stepDeg = (c.speed / 3600) * 0.012; // ~per second
          let heading = existing.heading + (Math.random() - 0.5) * 0.4;
          let lat = existing.lat + Math.sin(heading) * stepDeg;
          let lng = existing.lng + Math.cos(heading) * stepDeg;
          // Keep within ~3km of center
          const dLat = lat - KIGALI_CENTER[0];
          const dLng = lng - KIGALI_CENTER[1];
          if (Math.hypot(dLat, dLng) > 0.03) {
            heading = Math.atan2(KIGALI_CENTER[0] - existing.lat, KIGALI_CENTER[1] - existing.lng);
            lat = existing.lat + Math.sin(heading) * stepDeg;
            lng = existing.lng + Math.cos(heading) * stepDeg;
          }
          return {
            plate: c.plate,
            driver: c.driver,
            speed: c.speed,
            lat,
            lng,
            heading,
          };
        });
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Render markers
  useEffect(() => {
    if (!ready || !LRef.current || !mapRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    const seen = new Set<string>();

    positions.forEach((p) => {
      seen.add(p.plate);
      const over = p.speed > SPEED_LIMIT;
      const color = over ? "#ef4444" : "#22c55e";
      const html = `
        <div style="
          width:28px;height:28px;border-radius:50%;
          background:${color};border:3px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,.45);
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-weight:700;font-size:11px;font-family:system-ui;
          ${over ? "animation: gerayo-pulse 1s infinite;" : ""}
        ">${Math.round(p.speed)}</div>`;
      const icon = L.divIcon({
        html,
        className: "gerayo-marker",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      let m = markersRef.current.get(p.plate);
      if (!m) {
        m = L.marker([p.lat, p.lng], { icon }).addTo(map);
        m.on("click", () => setSelected(p.plate));
        markersRef.current.set(p.plate, m);
      } else {
        m.setLatLng([p.lat, p.lng]);
        m.setIcon(icon);
      }
      m.bindTooltip(
        `<b>${p.plate}</b><br/>${p.driver}<br/>${Math.round(p.speed)} km/h ${over ? "⚠️" : "✓"}`,
        { direction: "top", offset: [0, -10] }
      );
    });

    // Remove stale
    markersRef.current.forEach((m, plate) => {
      if (!seen.has(plate)) {
        map.removeLayer(m);
        markersRef.current.delete(plate);
      }
    });

    if (follow && selected) {
      const p = positions.find((x) => x.plate === selected);
      if (p) map.panTo([p.lat, p.lng], { animate: true });
    }
  }, [positions, ready, follow, selected]);

  const stats = useMemo(() => {
    const total = positions.length;
    const speeding = positions.filter((p) => p.speed > SPEED_LIMIT).length;
    const avg = total ? Math.round(positions.reduce((a, p) => a + p.speed, 0) / total) : 0;
    return { total, speeding, avg };
  }, [positions]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <style>{`@keyframes gerayo-pulse {0%{box-shadow:0 0 0 0 rgba(239,68,68,.7)}70%{box-shadow:0 0 0 14px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}`}</style>
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🗺️ GERAYO FAST — Live Map</h1>
          <p className="text-xs text-zinc-400">Real-time vehicle positions across Kigali</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <a href="/" className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg">← Dashboard</a>
          <a href="/admin" className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg">Admin</a>
        </nav>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-0 h-[calc(100vh-73px)]">
        <div className="relative">
          <div ref={containerRef} className="absolute inset-0 bg-zinc-800" />
          <div className="absolute top-4 left-4 z-[400] flex gap-2">
            <div className="bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-lg px-3 py-2 text-xs">
              <span className="text-zinc-400">Fleet</span>
              <div className="text-lg font-bold">{stats.total}</div>
            </div>
            <div className="bg-zinc-900/90 backdrop-blur border border-red-700 rounded-lg px-3 py-2 text-xs">
              <span className="text-red-400">Speeding</span>
              <div className="text-lg font-bold text-red-400">{stats.speeding}</div>
            </div>
            <div className="bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-lg px-3 py-2 text-xs">
              <span className="text-zinc-400">Avg km/h</span>
              <div className="text-lg font-bold">{stats.avg}</div>
            </div>
          </div>
        </div>

        <aside className="bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="font-semibold">Vehicles</h2>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => setFollow(e.target.checked)}
              />
              Follow selected
            </label>
          </div>
          <ul className="divide-y divide-zinc-800">
            {positions.map((p) => {
              const over = p.speed > SPEED_LIMIT;
              const isSel = selected === p.plate;
              return (
                <li
                  key={p.plate}
                  onClick={() => {
                    setSelected(p.plate);
                    if (mapRef.current) mapRef.current.panTo([p.lat, p.lng], { animate: true });
                  }}
                  className={`p-3 cursor-pointer hover:bg-zinc-800 transition ${isSel ? "bg-zinc-800" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono font-bold text-sm">{p.plate}</div>
                      <div className="text-xs text-zinc-400">{p.driver}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${over ? "text-red-400" : "text-green-400"}`}>
                        {Math.round(p.speed)}
                      </div>
                      <div className="text-[10px] text-zinc-500">km/h</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${over ? "bg-red-500 animate-pulse" : "bg-green-500"}`} />
                    <span className={`text-[11px] ${over ? "text-red-400" : "text-green-400"}`}>
                      {over ? "OVER LIMIT" : "Safe"}
                    </span>
                    <span className="text-[10px] text-zinc-500 ml-auto">
                      {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </span>
                  </div>
                </li>
              );
            })}
            {positions.length === 0 && (
              <li className="p-6 text-center text-sm text-zinc-500">No vehicles tracked yet.</li>
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}
