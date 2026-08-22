import type { FareQuote, GeoPoint } from "@oneapp/shared";

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Simulated live demand, since there's no real fleet/booking volume to measure. Combines a
 * fixed time-of-day peak schedule (rush hours cost more, same as every real ride-hailing app)
 * with a slow sinusoidal "market is moving" wiggle so the multiplier visibly drifts over
 * minutes rather than only jumping between fixed hourly bands.
 */
export function getSurgeMultiplier(now = new Date()): { multiplier: number; reason: string } {
  const hour = now.getHours();
  let base = 1;
  let reason = "Normal demand";

  if (hour >= 8 && hour < 10) {
    base = 1.5;
    reason = "Morning rush-hour demand";
  } else if (hour >= 17 && hour < 20) {
    base = 1.6;
    reason = "Evening rush-hour demand";
  } else if (hour >= 22 || hour < 5) {
    base = 1.25;
    reason = "Late-night demand";
  }

  const minuteOfDay = hour * 60 + now.getMinutes();
  const wiggle = Math.sin((minuteOfDay / 9) * Math.PI) * 0.12;
  const multiplier = Math.max(1, Math.round((base + wiggle) * 100) / 100);
  return { multiplier, reason };
}

export interface CabVehicleRates {
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  avgSpeedKmh: number;
}

/** Real distance from actual pickup/drop coordinates, real per-km/per-min rates, live surge. This is what's charged — never trust a client-supplied total. */
export function computeCabFare(vehicle: CabVehicleRates, pickup: GeoPoint, drop: GeoPoint, now = new Date()): FareQuote {
  const straightLineKm = haversineDistanceKm(pickup, drop);
  // Roads are never a straight line — a standard routing fudge factor.
  const distanceKm = Math.round(straightLineKm * 1.3 * 10) / 10;
  const durationMin = Math.max(3, Math.round((distanceKm / vehicle.avgSpeedKmh) * 60));

  const distanceFare = Math.round(distanceKm * vehicle.perKmRate);
  const timeFare = Math.round(durationMin * vehicle.perMinRate);
  const subtotal = vehicle.baseFare + distanceFare + timeFare;

  const { multiplier, reason } = getSurgeMultiplier(now);
  const total = Math.max(vehicle.baseFare, Math.round(subtotal * multiplier));

  return {
    distanceKm,
    durationMin,
    baseFare: vehicle.baseFare,
    distanceFare,
    timeFare,
    subtotal,
    surgeMultiplier: multiplier,
    total,
    currency: "INR",
    surgeReason: reason,
  };
}

/**
 * Airline/OTA-style revenue-management curve: prices rise as a date approaches (last-minute
 * premium) and drop the further out you book (advance-purchase discount), plus a small bump
 * for highly-rated listings and weekend hotel nights, plus the same live demand wiggle used
 * for cab surge so prices are never perfectly static even without picking a date.
 */
export function computeDynamicTravelPrice(
  basePrice: number,
  category: "hotel" | "flight",
  dateISO: string | undefined,
  rating: number | null | undefined,
  now = new Date(),
): { price: number; multiplier: number } {
  let multiplier = 1;

  if (dateISO) {
    const target = new Date(dateISO);
    if (!Number.isNaN(target.getTime())) {
      const daysUntil = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);

      if (category === "hotel") {
        if (daysUntil <= 1) multiplier = 1.6;
        else if (daysUntil <= 3) multiplier = 1.3;
        else if (daysUntil <= 14) multiplier = 1.0;
        else if (daysUntil <= 30) multiplier = 0.9;
        else multiplier = 0.8;

        const dow = target.getDay();
        if (dow === 5 || dow === 6) multiplier *= 1.15; // Friday/Saturday night premium
      } else {
        if (daysUntil <= 1) multiplier = 2.2;
        else if (daysUntil <= 3) multiplier = 1.6;
        else if (daysUntil <= 7) multiplier = 1.25;
        else if (daysUntil <= 21) multiplier = 1.0;
        else if (daysUntil <= 45) multiplier = 0.85;
        else multiplier = 0.75;
      }
    }
  }

  if (rating && rating >= 4.5) multiplier *= 1.08;

  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const wiggle = 1 + Math.sin((minuteOfDay / 17) * Math.PI) * 0.05;
  multiplier *= wiggle;

  return { price: Math.round(basePrice * multiplier), multiplier: Math.round(multiplier * 100) / 100 };
}
