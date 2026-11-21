"use client";
import type { HomeProStatus } from "@zarva/core";
import { api, isSignedIn } from "./api";

/**
 * One ZARVA account per person, three areas of the website. The same phone number can be a
 * customer, a partner and an admin; each area has its own sign-in page and its own home, and
 * the API checks the role on every request (the website only decides where to send people).
 */
export type Area = "customer" | "partner" | "admin";

export const areaHome: Record<Area, string> = { customer: "/", partner: "/pro", admin: "/admin" };
export const areaLogin: Record<Area, string> = { customer: "/login", partner: "/partner/login", admin: "/admin/login" };

export function areaOf(pathname: string): Area {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/pro") || pathname.startsWith("/partner")) return "partner";
  return "customer";
}

export function loginUrl(area: Area, next?: string): string {
  return next && next !== areaHome[area] ? `${areaLogin[area]}?next=${encodeURIComponent(next)}` : areaLogin[area];
}

/** ?next= from the address bar, only if it is a path on this site (so it can't bounce people elsewhere). */
export function safeNext(): string | null {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export type Roles = { admin: boolean; pro: HomeProStatus | null };
const KEY = "zarva.roles";
const none: Roles = { admin: false, pro: null };

function read(): Roles | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Roles) : null;
  } catch {
    return null;
  }
}

function write(r: Roles | null) {
  try {
    if (r) sessionStorage.setItem(KEY, JSON.stringify(r));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

/** Which areas this account can use, for the header links. Cached for the browser tab. */
export async function loadRoles(force = false): Promise<Roles> {
  if (!isSignedIn()) return none;
  const cached = force ? null : read();
  if (cached) return cached;
  const [admin, pro] = await Promise.all([
    api.adminStatus().then((s) => s.admin).catch(() => false),
    api.home.proMe().then((r) => r.pro?.status ?? null).catch(() => null),
  ]);
  const roles = { admin, pro };
  write(roles);
  return roles;
}

/** Call when the partner profile changes (sign-up started, approved) so the header catches up. */
export function setProRole(status: HomeProStatus | null) {
  const r = read();
  if (r && r.pro !== status) write({ ...r, pro: status });
}

export function clearRoles() {
  write(null);
}

export async function signOut() {
  await api.logout();
  clearRoles();
}
