import { OAuth2Client } from "google-auth-library";

// Three optional client ids: one "Web application" client (used by the web app and by
// mobile when running in Expo Go / the web target), plus native iOS/Android clients a
// real mobile build needs — Google mints tokens with a different `aud` per client type,
// so all three (whichever are configured) are accepted as valid audiences below.
const clientId = process.env.GOOGLE_CLIENT_ID;
const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID;
const androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;

const audiences = [clientId, iosClientId, androidClientId].filter((id): id is string => Boolean(id));

export const googleAuthEnabled = audiences.length > 0;

const client = googleAuthEnabled ? new OAuth2Client() : null;

export function getGoogleClientConfig() {
  return { clientId, iosClientId, androidClientId };
}

/**
 * Verifies a "Sign in with Google" ID token (a signed JWT from Google, never trust it
 * unverified) and pulls out the bits we need to find-or-create the local account.
 * Returns null if Google isn't configured or the token doesn't check out.
 */
export async function verifyGoogleIdToken(idToken: string) {
  if (!client || audiences.length === 0) return null;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) return null;
    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email.split("@")[0],
    };
  } catch {
    return null;
  }
}
