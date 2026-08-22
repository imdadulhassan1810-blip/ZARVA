/**
 * Sends push notifications via Expo's push service (https://exp.host). This needs no
 * API key or account setup — any Expo/React Native app can register a push token and
 * receive notifications sent through this endpoint. Web has no push token registered,
 * so this only ever reaches the mobile app.
 */
export async function sendPushNotification(
  pushToken: string | null | undefined,
  message: { title: string; body: string; data?: Record<string, unknown> },
) {
  if (!pushToken) return;

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: pushToken,
        sound: "default",
        title: message.title,
        body: message.body,
        data: message.data ?? {},
      }),
    });

    if (!res.ok) {
      console.error("Push notification failed:", res.status, await res.text());
    }
  } catch (err) {
    // Never let a notification failure break the order flow that triggered it.
    console.error("Push notification error:", err);
  }
}
