import { useCallback } from "react";
import { Text, TextInput } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider } from "./src/context/AuthContext";
import { CartProvider } from "./src/context/CartContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Same font pairing as the web app (Inter for body, Plus Jakarta Sans for headings/titles)
// — see src/theme.ts. React Native has no global stylesheet, so the body font is applied
// as a default via Text/TextInput.defaultProps rather than per-component, matching the
// web app's `body { font-family: ... }` rule with the least code churn across 11 screens.
// RN's type definitions don't declare defaultProps on these (it's a runtime-only escape
// hatch), hence the casts.
const TextAny = Text as unknown as { defaultProps: { style?: unknown } };
const TextInputAny = TextInput as unknown as { defaultProps: { style?: unknown } };
TextAny.defaultProps = TextAny.defaultProps ?? {};
TextAny.defaultProps.style = [{ fontFamily: "Inter_400Regular" }, TextAny.defaultProps.style];
TextInputAny.defaultProps = TextInputAny.defaultProps ?? {};
TextInputAny.defaultProps.style = [{ fontFamily: "Inter_400Regular" }, TextInputAny.defaultProps.style];

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider onLayout={onLayout}>
      <AuthProvider>
        <CartProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
