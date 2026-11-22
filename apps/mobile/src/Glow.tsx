import { View } from "react-native";
import type { Theme } from "./theme";

/** Two soft colour blobs standing in for the web hero's radial gradients. */
export function Glow({ t }: { t: Theme }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <View style={{ position: "absolute", right: -120, bottom: -160, width: 340, height: 340, borderRadius: 170, backgroundColor: t.homeFrom, opacity: 0.13 }} />
      <View style={{ position: "absolute", right: -60, bottom: -90, width: 200, height: 200, borderRadius: 100, backgroundColor: t.homeTo, opacity: 0.12 }} />
      <View style={{ position: "absolute", left: -100, top: -120, width: 280, height: 280, borderRadius: 140, backgroundColor: t.primaryFrom, opacity: 0.14 }} />
    </View>
  );
}
