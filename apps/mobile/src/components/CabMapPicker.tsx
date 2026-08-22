import { useRef } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { WebView } from "react-native-webview";
import type { GeoPoint } from "@oneapp/shared";
import { api } from "../lib/api";
import { colors } from "../theme";

// Loads Leaflet + OpenStreetMap tiles inside a WebView — same free, no-API-key map
// stack as the web app, since react-native-maps would require a Google Maps API key
// on Android that this project doesn't have. The page posts tapped coordinates back
// to React Native via postMessage.
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
    const map = L.map('map').setView([22.9734, 78.6569], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const pickupIcon = L.divIcon({ html: '<div style="font-size:28px">🟢</div>', className: '', iconSize: [28,28], iconAnchor: [14,28] });
    const dropIcon = L.divIcon({ html: '<div style="font-size:28px">🔴</div>', className: '', iconSize: [28,28], iconAnchor: [14,28] });
    let pickupMarker = null;
    let dropMarker = null;

    map.on('click', (e) => {
      window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng }));
    });

    document.addEventListener('message', handleNative);
    window.addEventListener('message', handleNative);
    function handleNative(event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.pickup) {
          if (pickupMarker) pickupMarker.setLatLng([msg.pickup.lat, msg.pickup.lng]);
          else pickupMarker = L.marker([msg.pickup.lat, msg.pickup.lng], { icon: pickupIcon }).addTo(map);
        }
        if (msg.drop) {
          if (dropMarker) dropMarker.setLatLng([msg.drop.lat, msg.drop.lng]);
          else dropMarker = L.marker([msg.drop.lat, msg.drop.lng], { icon: dropIcon }).addTo(map);
        }
      } catch (e) {}
    }
  </script>
</body>
</html>
`;

interface Props {
  pickup: GeoPoint | null;
  drop: GeoPoint | null;
  onChange: (next: { pickup: GeoPoint | null; drop: GeoPoint | null }) => void;
}

export function CabMapPicker({ pickup, drop, onChange }: Props) {
  const webviewRef = useRef<WebView>(null);

  function postToMap(next: { pickup: GeoPoint | null; drop: GeoPoint | null }) {
    webviewRef.current?.postMessage(JSON.stringify(next));
  }

  async function handleMapMessage(event: { nativeEvent: { data: string } }) {
    try {
      const { lat, lng } = JSON.parse(event.nativeEvent.data) as { lat: number; lng: number };
      const target: "pickup" | "drop" = pickup ? "drop" : "pickup";
      const point: GeoPoint = { lat, lng };
      const next = target === "pickup" ? { pickup: point, drop } : { pickup, drop: point };
      onChange(next);
      postToMap(next);

      const resolved = await api.reverseGeocode(lat, lng).catch(() => point);
      const resolvedNext = target === "pickup" ? { pickup: resolved, drop } : { pickup, drop: resolved };
      onChange(resolvedNext);
    } catch {
      // ignore malformed messages
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapBox}>
        <WebView
          ref={webviewRef}
          originWhitelist={["*"]}
          source={{ html: MAP_HTML }}
          onMessage={handleMapMessage}
          style={styles.webview}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.chip}>
          <Text style={styles.chipLabel}>🟢 Pickup</Text>
          <Text style={styles.chipValue} numberOfLines={1}>
            {pickup?.address ?? "Tap the map to set"}
          </Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel}>🔴 Drop</Text>
          <Text style={styles.chipValue} numberOfLines={1}>
            {drop?.address ?? "Tap the map to set"}
          </Text>
        </View>
      </View>

      {(pickup || drop) && (
        <Pressable onPress={() => { onChange({ pickup: null, drop: null }); postToMap({ pickup: null, drop: null }); }}>
          <Text style={styles.reset}>Reset pins</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  mapBox: { height: 220, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  webview: { flex: 1 },
  row: { flexDirection: "row", gap: 8 },
  chip: { flex: 1, backgroundColor: colors.chip, borderRadius: 8, padding: 8 },
  chipLabel: { fontSize: 11, fontWeight: "700", color: colors.text },
  chipValue: { fontSize: 10, color: colors.muted, marginTop: 2 },
  reset: { fontSize: 11, color: colors.muted, textDecorationLine: "underline" },
});
