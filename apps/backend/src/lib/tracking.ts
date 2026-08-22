import crypto from "node:crypto";
import type { GeoPoint, TrackingDriver, TrackingState, TrackingStatus } from "@oneapp/shared";
import { haversineDistanceKm } from "./pricing";

/**
 * Simulated live tracking, since there's no real driver/delivery fleet behind this demo.
 * Rather than a running timer/interval (which wouldn't survive a server restart or work
 * across multiple server instances), the entire journey is a pure function of wall-clock
 * time: a "spec" (route + leg durations) is computed once at order-creation time and stored
 * in the order, and the current position/status is *recomputed from scratch* on every poll
 * from `spec.startedAt` + elapsed real seconds. Stateless, restart-safe, horizontally scalable.
 */
export interface TrackingSpec {
  startedAt: string;
  assignedSec: number;
  /** 2 points (origin -> destination) for food/home-services, or 3 (driver spawn -> pickup -> drop) for cabs. */
  route: GeoPoint[];
  /** One duration per leg between consecutive route points. */
  legDurationsSec: number[];
  /** Pause at the pickup point, cabs only (route.length === 3). */
  pauseSec: number;
  categorySlug: string;
  /** Deterministic seed for the simulated driver identity — generated at spec-build time, since the
   *  real order id doesn't exist yet (the spec is embedded in the order at creation). */
  seed: string;
  /** e.g. the actual cab type booked ("OneApp SUV") — falls back to a generic label per category if omitted. */
  vehicleLabel?: string;
}

const DRIVER_NAMES = [
  "Ravi Kumar", "Suresh Yadav", "Amit Singh", "Vijay Patel",
  "Manoj Sharma", "Deepak Verma", "Sanjay Gupta", "Anil Joshi",
  "Rahul Mehta", "Karan Malhotra",
];
const VEHICLE_STATE_PREFIXES = ["DL", "MH", "KA", "TN", "GJ", "UP", "WB", "RJ"];

function hashString(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function lerp(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  const c = clamp(t, 0, 1);
  return { lat: a.lat + (b.lat - a.lat) * c, lng: a.lng + (b.lng - a.lng) * c };
}

/** Moves a point `km` kilometres along `bearingDeg` (0 = north, 90 = east). */
function offsetPoint(p: GeoPoint, km: number, bearingDeg: number): GeoPoint {
  const R = 6371;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (p.lat * Math.PI) / 180;
  const lng1 = (p.lng * Math.PI) / 180;
  const dByR = km / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(bearing));
  const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(dByR) * Math.cos(lat1), Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

function deriveDriver(seed: string, categorySlug: string, vehicleLabelOverride?: string): TrackingDriver {
  const h = hashString(seed);
  const name = DRIVER_NAMES[h % DRIVER_NAMES.length];
  const prefix = VEHICLE_STATE_PREFIXES[(h >>> 3) % VEHICLE_STATE_PREFIXES.length];
  const letters = `${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >>> 4) % 26))}`;
  const vehicleNumber = `${prefix} ${10 + (h % 90)} ${letters} ${1000 + (h % 9000)}`;
  const rating = Math.round((4 + ((h >>> 2) % 10) / 10) * 10) / 10;
  const phoneSeed = String(h).padStart(10, "7").slice(0, 10);
  const vehicleLabel =
    vehicleLabelOverride ??
    (categorySlug === "cab" ? "Cab" : categorySlug === "food" ? "Delivery bike" : "Service vehicle");

  return { name, phone: `+91 ${phoneSeed}`, vehicleNumber, rating, vehicleLabel };
}

/** Synthesizes a plausible "customer location" near a fixed origin (restaurant/service base), for
 *  categories where this demo doesn't collect a real delivery address from the customer. */
export function synthesizeNearbyPoint(origin: GeoPoint, seed: string): GeoPoint {
  const h = hashString(seed);
  const km = 1 + (h % 30) / 10; // 1.0 - 4.0 km
  return offsetPoint(origin, km, h % 360);
}

export function buildCabTrackingSpec(pickup: GeoPoint, drop: GeoPoint, vehicleLabel?: string): TrackingSpec {
  const seed = crypto.randomUUID();
  const h = hashString(seed);
  const spawn = offsetPoint(pickup, 1.2 + (h % 20) / 10, h % 360);
  const leg1Km = haversineDistanceKm(spawn, pickup);
  const leg2Km = haversineDistanceKm(pickup, drop);

  return {
    startedAt: new Date().toISOString(),
    assignedSec: 3,
    route: [spawn, pickup, drop],
    legDurationsSec: [clamp(leg1Km * 6, 8, 35), clamp(leg2Km * 6, 15, 90)],
    pauseSec: 4,
    categorySlug: "cab",
    seed,
    vehicleLabel,
  };
}

export function buildDeliveryTrackingSpec(
  categorySlug: "food" | "homeservices",
  origin: GeoPoint,
  destination: GeoPoint,
): TrackingSpec {
  const legKm = haversineDistanceKm(origin, destination);
  return {
    startedAt: new Date().toISOString(),
    assignedSec: 4,
    route: [origin, destination],
    legDurationsSec: [clamp(legKm * 8, 20, 120)],
    pauseSec: 0,
    categorySlug,
    seed: crypto.randomUUID(),
  };
}

/**
 * Resolves the (fixed) origin/destination geometry for a trackable non-cab order at the
 * moment it's created — before we know whether payment will confirm immediately (mock) or
 * only later (Razorpay). Kept separate from the time-anchored spec so the *route* is locked
 * in early (deterministic) while the *clock* (`startedAt`) only starts once the order is
 * actually confirmed, via `finalizeTrackingSpec`.
 */
export function resolveTrackingRoute(
  categorySlug: string,
  listingMeta: Record<string, unknown> | undefined,
): { origin: GeoPoint; destination: GeoPoint } | null {
  if (categorySlug === "food") {
    const restaurant = listingMeta?.restaurantLocation as GeoPoint | undefined;
    if (!restaurant) return null;
    return { origin: restaurant, destination: synthesizeNearbyPoint(restaurant, crypto.randomUUID()) };
  }
  if (categorySlug === "homeservices") {
    const base = listingMeta?.baseLocation as GeoPoint | undefined;
    if (!base) return null;
    return { origin: base, destination: synthesizeNearbyPoint(base, crypto.randomUUID()) };
  }
  return null;
}

/** Builds the time-anchored tracking spec once an order is actually confirmed (immediately for the mock payment path, or at Razorpay-verify time). */
export function finalizeTrackingSpec(categorySlug: string, details: Record<string, unknown>): TrackingSpec | null {
  if (categorySlug === "cab") {
    const pickup = details.pickup as GeoPoint | undefined;
    const drop = details.drop as GeoPoint | undefined;
    if (pickup && drop && typeof pickup.lat === "number" && typeof drop.lat === "number") {
      return buildCabTrackingSpec(pickup, drop, typeof details.vehicleLabel === "string" ? details.vehicleLabel : undefined);
    }
    return null;
  }
  if (categorySlug === "food" || categorySlug === "homeservices") {
    const route = details.trackingRoute as { origin: GeoPoint; destination: GeoPoint } | undefined;
    if (route) return buildDeliveryTrackingSpec(categorySlug, route.origin, route.destination);
    return null;
  }
  return null;
}

export function computeTrackingState(orderId: string, spec: TrackingSpec): TrackingState {
  const startedAtMs = new Date(spec.startedAt).getTime();
  const elapsedSec = Math.max(0, (Date.now() - startedAtMs) / 1000);

  const totalSec = spec.assignedSec + spec.legDurationsSec.reduce((a, b) => a + b, 0) + spec.pauseSec;
  const clampedElapsed = Math.min(elapsedSec, totalSec);

  let status: TrackingStatus;
  let position: GeoPoint;
  let remaining = clampedElapsed;

  if (remaining < spec.assignedSec) {
    status = "assigned";
    position = spec.route[0];
  } else {
    remaining -= spec.assignedSec;

    if (spec.route.length === 3) {
      const [spawn, pickup, drop] = spec.route;
      const [leg1, leg2] = spec.legDurationsSec;

      if (remaining < leg1) {
        status = "heading_to_pickup";
        position = lerp(spawn, pickup, leg1 > 0 ? remaining / leg1 : 1);
      } else {
        remaining -= leg1;
        if (remaining < spec.pauseSec) {
          status = "arrived_pickup";
          position = pickup;
        } else {
          remaining -= spec.pauseSec;
          if (remaining < leg2) {
            status = "in_progress";
            position = lerp(pickup, drop, leg2 > 0 ? remaining / leg2 : 1);
          } else {
            status = "completed";
            position = drop;
          }
        }
      }
    } else {
      const [origin, destination] = spec.route;
      const [leg1] = spec.legDurationsSec;
      if (remaining < leg1) {
        status = "in_progress";
        position = lerp(origin, destination, leg1 > 0 ? remaining / leg1 : 1);
      } else {
        status = "completed";
        position = destination;
      }
    }
  }

  return {
    orderId,
    status,
    progress: totalSec > 0 ? clampedElapsed / totalSec : 1,
    position,
    etaMinutes: Math.ceil(Math.max(0, totalSec - clampedElapsed) / 60),
    route: spec.route,
    driver: deriveDriver(spec.seed, spec.categorySlug, spec.vehicleLabel),
    startedAt: spec.startedAt,
  };
}
