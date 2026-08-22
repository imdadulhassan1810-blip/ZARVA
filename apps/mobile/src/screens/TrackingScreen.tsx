import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { TrackingState } from "@oneapp/shared";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import { colors } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Tracking">;

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

// Same free Leaflet + OpenStreetMap stack as CabMapPicker, this time read-only:
// initial load draws the route once, then each poll posts a fresh position that
// the page moves the marker to and re-centers on, without reloading the map.
const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>html,body,#map{height:100%;margin:0;padding:0;}</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    let map = null;
    let marker = null;
    let line = null;

    function handleUpdate(msg) {
      const { position, route, emoji } = msg;
      if (!map) {
        map = L.map('map').setView([position.lat, position.lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        line = L.polyline(route.map(p => [p.lat, p.lng]), { color: '#2a5cf5', weight: 3, dashArray: '6 6' }).addTo(map);
        const icon = L.divIcon({ html: '<div style="font-size:28px">' + emoji + '</div>', className: '', iconSize: [28,28], iconAnchor: [14,14] });
        marker = L.marker([position.lat, position.lng], { icon }).addTo(map);
      } else {
        marker.setLatLng([position.lat, position.lng]);
        map.panTo([position.lat, position.lng], { animate: true });
      }
    }

    document.addEventListener('message', (e) => handleUpdate(JSON.parse(e.data)));
    window.addEventListener('message', (e) => handleUpdate(JSON.parse(e.data)));
  </script>
</body>
</html>
`;

export function TrackingScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const webviewRef = useRef<WebView>(null);
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
        webviewRef.current?.postMessage(
          JSON.stringify({ position: s.position, route: s.route, emoji: vehicleEmoji(s.driver.vehicleLabel) }),
        );
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
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={() => navigation.navigate("Orders")}>
          <Text style={styles.link}>Back to orders</Text>
        </Pressable>
      </View>
    );
  }
  if (!state) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading tracking…</Text>
      </View>
    );
  }

  const emoji = vehicleEmoji(state.driver.vehicleLabel);

  return (
    <View style={styles.screen}>
      <Text style={styles.disclaimer}>Simulated for this demo — not a real driver/delivery GPS feed.</Text>
      <View style={styles.mapBox}>
        <WebView ref={webviewRef} originWhitelist={["*"]} source={{ html: MAP_HTML }} style={{ flex: 1 }} />
      </View>

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View>
            <Text style={styles.statusText}>{STATUS_LABELS[state.status] ?? state.status}</Text>
            <Text style={styles.muted}>{state.status === "completed" ? "Arrived" : `ETA ${state.etaMinutes} min`}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(state.progress * 100)}%` }]} />
          </View>
        </View>

        <View style={styles.driverRow}>
          <Text style={styles.driverEmoji}>{emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>{state.driver.name}</Text>
            <Text style={styles.muted}>
              {state.driver.vehicleLabel} · {state.driver.vehicleNumber}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.muted}>⭐ {state.driver.rating}</Text>
            <Pressable onPress={() => Linking.openURL(`tel:${state.driver.phone}`)}>
              <Text style={styles.link}>Call</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {state.status === "completed" && (
        <View style={styles.center}>
          <Text style={styles.completedText}>✅ This order is complete.</Text>
          <Pressable onPress={() => navigation.navigate("Orders")}>
            <Text style={styles.link}>Back to orders</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 },
  mapBox: { height: 260, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusText: { fontWeight: "700", fontSize: 14, color: colors.text },
  muted: { fontSize: 11, color: colors.muted },
  disclaimer: { fontSize: 10, color: colors.muted, marginTop: -4 },
  progressTrack: { width: 100, height: 6, borderRadius: 3, backgroundColor: colors.chip, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brand },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  driverEmoji: { fontSize: 30 },
  driverName: { fontWeight: "600", fontSize: 13, color: colors.text },
  link: { color: colors.brand, fontWeight: "700", fontSize: 12, textDecorationLine: "underline", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  error: { color: colors.danger, fontSize: 13 },
  completedText: { color: colors.success, fontWeight: "700" },
});
