import { NextResponse, type NextRequest } from "next/server";

/**
 * The website's sign-in desk. The long-lived refresh token never reaches page scripts: this server
 * route receives it from the API, keeps it in an httpOnly cookie on the website's own address, and
 * uses it to get fresh short-lived access tokens. A script injected into a page can't steal it.
 *
 *   POST /session/<customer|partner|admin>/login    { path, body }  sign in through the API
 *   POST /session/<portal>/refresh                                   new access token
 *   POST /session/<portal>/logout                                    end the session
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const REFRESH_DAYS = 60;
const PORTALS = ["customer", "partner", "admin"] as const;
type Portal = (typeof PORTALS)[number];

/** The only API sign-in endpoints each app may call through here. */
const LOGIN_PATHS: Record<Portal, string[]> = {
  customer: ["/v1/auth/otp/verify", "/v1/auth/email/verify", "/v1/auth/google", "/v1/auth/apple"],
  partner: ["/v1/auth/otp/verify"],
  admin: ["/v1/admin/auth/login"],
};
const authBase = (p: Portal) => (p === "admin" ? "/v1/admin/auth" : "/v1/auth");
const cookieName = (p: Portal) => `zarva_rt_${p}`;

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function setRefreshCookie(res: NextResponse, p: Portal, token: string) {
  res.cookies.set(cookieName(p), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: `/session/${p}`,
    maxAge: REFRESH_DAYS * 24 * 3600,
  });
}

async function callApi(path: string, body: unknown, req: NextRequest) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const ua = req.headers.get("user-agent");
  if (ua) headers["user-agent"] = ua;
  const r = await fetch(`${API}${path}`, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
  const json = r.status === 204 ? null : await r.json().catch(() => null);
  return { status: r.status, json: json as Record<string, unknown> | null };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ portal: string; action: string }> }) {
  const { portal, action } = await ctx.params;
  if (!PORTALS.includes(portal as Portal)) return error(404, "not_found", "Not found");
  const p = portal as Portal;

  // Only pages of this website may use it (the cookie is SameSite=Strict too).
  const origin = req.headers.get("origin");
  if (origin) {
    // Behind Render's proxy the server may see an internal address, so also accept the public host.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* malformed */ }
    if (originHost !== host && origin !== req.nextUrl.origin) return error(403, "bad_origin", "Not allowed");
  }

  if (action === "login") {
    const { path, body } = ((await req.json().catch(() => ({}))) ?? {}) as { path?: string; body?: unknown };
    if (!path || !LOGIN_PATHS[p].includes(path)) return error(400, "bad_login_path", "Not a sign-in for this app");
    const r = await callApi(path, body, req);
    if (r.status !== 200 || !r.json) return NextResponse.json(r.json ?? {}, { status: r.status });
    const { refreshToken, ...rest } = r.json as { refreshToken?: string };
    const res = NextResponse.json(rest);
    if (typeof refreshToken === "string") setRefreshCookie(res, p, refreshToken);
    return res;
  }

  const token = req.cookies.get(cookieName(p))?.value;

  if (action === "refresh") {
    if (!token) return error(401, "unauthorized", "Please sign in again");
    const r = await callApi(`${authBase(p)}/refresh`, { refreshToken: token }, req);
    if (r.status !== 200 || !r.json) {
      const res = NextResponse.json(r.json ?? {}, { status: r.status === 200 ? 502 : r.status });
      if (r.status === 401) res.cookies.delete({ name: cookieName(p), path: `/session/${p}` });
      return res;
    }
    const { refreshToken, accessToken, expiresIn } = r.json as { refreshToken?: string; accessToken: string; expiresIn: number };
    const res = NextResponse.json({ accessToken, expiresIn });
    if (typeof refreshToken === "string") setRefreshCookie(res, p, refreshToken);
    return res;
  }

  if (action === "logout") {
    if (token) await callApi(`${authBase(p)}/logout`, { refreshToken: token }, req).catch(() => undefined);
    const res = new NextResponse(null, { status: 204 });
    res.cookies.delete({ name: cookieName(p), path: `/session/${p}` });
    return res;
  }

  return error(404, "not_found", "Not found");
}
