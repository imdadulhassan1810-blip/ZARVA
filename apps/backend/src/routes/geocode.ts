import { Router } from "express";

export const geocodeRouter = Router();

// Reverse-geocodes a lat/lng into a human-readable address via OpenStreetMap's free
// Nominatim service (https://nominatim.org) — no API key required. Proxied through our
// own backend (rather than called from the client) so we control the required
// User-Agent header and respect Nominatim's usage policy from one place.
geocodeRouter.get("/reverse", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "invalid_input", message: "lat and lng query params are required" });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");

    const upstream = await fetch(url, {
      headers: { "User-Agent": "OneApp-DailyChoresSystem/0.1 (demo cab pickup/drop picker)" },
    });
    if (!upstream.ok) throw new Error(`Nominatim request failed: ${upstream.status}`);

    const data = (await upstream.json()) as { display_name?: string };
    res.json({ lat, lng, address: data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
  } catch (err) {
    console.error("Reverse geocode failed:", err);
    // Never block picking a location just because the address lookup failed.
    res.json({ lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
  }
});
