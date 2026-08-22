import { useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "@oneapp/shared";
import { api } from "../lib/api";

// Emoji-based markers avoid Leaflet's default marker image assets, which don't
// resolve correctly under Vite's bundling without extra config.
const pickupIcon = L.divIcon({
  html: '<div style="font-size:28px;line-height:1;transform:translateY(-6px)">🟢</div>',
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});
const dropIcon = L.divIcon({
  html: '<div style="font-size:28px;line-height:1;transform:translateY(-6px)">🔴</div>',
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

// Central India as a reasonable default view — OneApp's seeded data is India-focused.
const DEFAULT_CENTER: [number, number] = [22.9734, 78.6569];
const DEFAULT_ZOOM = 5;

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface Props {
  pickup: GeoPoint | null;
  drop: GeoPoint | null;
  onChange: (next: { pickup: GeoPoint | null; drop: GeoPoint | null }) => void;
}

export function CabMapPicker({ pickup, drop, onChange }: Props) {
  const [resolving, setResolving] = useState<"pickup" | "drop" | null>(null);

  async function handleMapClick(lat: number, lng: number) {
    // First click sets pickup, second sets drop, further clicks move drop (the more
    // commonly re-adjusted point) — reset with the button to redo pickup.
    const target: "pickup" | "drop" = pickup ? "drop" : "pickup";
    setResolving(target);
    const point: GeoPoint = { lat, lng };
    onChange(target === "pickup" ? { pickup: point, drop } : { pickup, drop: point });

    try {
      const resolved = await api.reverseGeocode(lat, lng);
      onChange(
        target === "pickup" ? { pickup: resolved, drop } : { pickup, drop: resolved },
      );
    } catch {
      // Keep the coordinate-only point — address lookup is a nice-to-have.
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border border-slate-200 h-64">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <ClickHandler onClick={handleMapClick} />
          {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />}
          {drop && <Marker position={[drop.lat, drop.lng]} icon={dropIcon} />}
        </MapContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-50 rounded-md px-3 py-2">
          <div className="font-semibold text-slate-700">🟢 Pickup</div>
          <div className="text-slate-500 truncate">
            {resolving === "pickup" ? "Finding address…" : pickup?.address ?? "Tap the map to set"}
          </div>
        </div>
        <div className="bg-slate-50 rounded-md px-3 py-2">
          <div className="font-semibold text-slate-700">🔴 Drop</div>
          <div className="text-slate-500 truncate">
            {resolving === "drop" ? "Finding address…" : drop?.address ?? "Tap the map to set"}
          </div>
        </div>
      </div>

      {(pickup || drop) && (
        <button
          type="button"
          onClick={() => onChange({ pickup: null, drop: null })}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Reset pins
        </button>
      )}
    </div>
  );
}
