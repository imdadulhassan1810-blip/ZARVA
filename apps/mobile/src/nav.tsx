/** Shared navigation look for both apps: native stack headers and a bottom tab bar with icons. */
import { DarkTheme, DefaultTheme, type Theme as NavTheme } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import type { Theme } from "./theme";
import { haptic, Ionicons, type IconName } from "./ui";

export function navTheme(t: Theme): NavTheme {
  const base = t.dark ? DarkTheme : DefaultTheme;
  return { ...base, colors: { ...base.colors, primary: t.primary, background: t.bg, card: t.surface, text: t.text, border: t.border, notification: t.danger } };
}

export function stackOptions(t: Theme): NativeStackNavigationOptions {
  return {
    headerStyle: { backgroundColor: t.bg },
    headerShadowVisible: false,
    headerTintColor: t.text,
    headerTitleStyle: { fontWeight: "700" },
    headerBackButtonDisplayMode: "minimal",
    contentStyle: { backgroundColor: t.bg },
    animation: "slide_from_right",
  };
}

export function tabOptions(t: Theme, icons: Record<string, [IconName, IconName]>): (p: { route: { name: string } }) => BottomTabNavigationOptions {
  return ({ route }) => ({
    headerStyle: { backgroundColor: t.bg },
    headerShadowVisible: false,
    headerTintColor: t.text,
    headerTitleStyle: { fontWeight: "800", fontSize: 20 },
    headerTitleAlign: "left",
    tabBarActiveTintColor: t.primary,
    tabBarInactiveTintColor: t.muted,
    tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border, minHeight: 60 },
    tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
    tabBarItemStyle: { paddingTop: 4 },
    sceneStyle: { backgroundColor: t.bg },
    tabBarIcon: ({ focused, color, size }) => {
      const pair = icons[route.name] ?? ["ellipse", "ellipse-outline"];
      return <Ionicons name={focused ? pair[0] : pair[1]} size={size} color={color} />;
    },
  });
}

/** Light tick when switching tabs, like native apps. */
export const tabListeners = { tabPress: () => haptic.tap() };
