import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TrackingState } from "@oneapp/shared";
import { api } from "../lib/api";

const STATUS_LABELS: Record<string, string> = {
  assigned: "Finding you a driver…",
  heading_to_pickup: "Driver is heading to pickup",
  arrived_pickup: "Driver has arrived at pickup",
  in_progress: "On the way",
  completed: "Completed",
};

function vehicleEmoji(vehicleLabel: string) {
  const l = vehicleLabel.toLowerCase();
  if (l.includes("bike") || l.includes("auto")) return "🏍️";
  if (l.includes("service")) return "🧰";
  return "🚗";
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([lat, lng], { animate: true });
  }, [lat, lng, map]);
  return null;
}

export function Tracking() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<TrackingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const s = await api.getTracking(orderId);
        if (cancelled) return;
        setState(s);
        setError(null);
        if (s.status !== "completed") {
          timerRef.current = setTimeout(poll, 2000);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Tracking unavailable");
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [orderId]);

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-8 text-center space-y-3">
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={() => navigate("/orders")} className="text-brand-600 underline text-sm">
          Back to orders
        </button>
      </div>
    );
  }
  if (!state) return <p className="text-slate-500 text-center mt-8">Loading tracking…</p>;

  const emoji = vehicleEmoji(state.driver.vehicleLabel);
  const icon = L.divIcon({
    html: `<div style="font-size:28px;transform:translate(-50%,-50%)">${emoji}</div>`,
    className: "",
    iconSize: [28, 28],
  });

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Live tracking</h1>
        <p className="text-xs text-slate-400 mt-0.5">Simulated for this demo — not a real driver/delivery GPS feed.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="h-72">
          <MapContainer
            center={[state.position.lat, state.position.lng]}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <Polyline positions={state.route.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#2a5cf5", weight: 3, dashArray: "6 6" }} />
            <Marker position={[state.position.lat, state.position.lng]} icon={icon} />
            <Recenter lat={state.position.lat} lng={state.position.lng} />
          </MapContainer>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">{STATUS_LABELS[state.status] ?? state.status}</div>
              <div className="text-xs text-slate-500">
                {state.status === "completed" ? "Arrived" : `ETA ${state.etaMinutes} min`}
              </div>
            </div>
            <div className="w-28 bg-slate-100 rounded-full h-2 overflow-hidden shrink-0">
              <div
                className="bg-brand-600 h-full transition-all duration-1000"
                style={{ width: `${Math.round(state.progress * 100)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
            <div className="text-3xl">{emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{state.driver.name}</div>
              <div className="text-xs text-slate-500 truncate">
                {state.driver.vehicleLabel} · {state.driver.vehicleNumber}
              </div>
            </div>
            <div className="text-xs text-slate-500 text-right shrink-0">
              <div>⭐ {state.driver.rating}</div>
              <a href={`tel:${state.driver.phone}`} className="text-brand-600 underline">
                Call
              </a>
            </div>
          </div>
        </div>
      </div>

      {state.status === "completed" && (
        <div className="text-center space-y-2">
          <p className="text-emerald-700 font-medium">✅ This order is complete.</p>
          <button onClick={() => navigate("/orders")} className="text-brand-600 underline text-sm">
            Back to orders
          </button>
        </div>
      )}
    </div>
  );
}
