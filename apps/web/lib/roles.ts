"use client";
import { adminApi, api, partnerApi, type App } from "./api";

/**
 * Three separate apps on one website, like Uber's rider and driver apps:
 *  - customer: /, /home-services, /account          sign in at /login
 *  - partner:  /pro (jobs, earnings, profile)        sign in at /partner/login
 *  - admin:    /admin                                sign in at /admin/login (ZARVA-issued username)
 * Each keeps its own sign-in, and the API refuses the other apps' screens.
 */
export type Area = App;

export const areaHome: Record<Area, string> = { customer: "/", partner: "/pro", admin: "/admin" };
export const areaLogin: Record<Area, string> = { customer: "/login", partner: "/partner/login", admin: "/admin/login" };
export const clientFor = { customer: api, partner: partnerApi, admin: adminApi } as const;

export function areaOf(pathname: string): Area {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/pro") || pathname.startsWith("/partner")) return "partner";
  return "customer";
}

export function loginUrl(area: Area, next?: string): string {
  return next && next !== areaHome[area] ? `${areaLogin[area]}?next=${encodeURIComponent(next)}` : areaLogin[area];
}

/** ?next= from the address bar, only if it is a path inside the same app (so it can't bounce people elsewhere). */
export function safeNext(area: Area = "customer"): string | null {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return areaOf(next) === area ? next : null;
}

export async function signOut(area: Area) {
  await clientFor[area].logout();
}
