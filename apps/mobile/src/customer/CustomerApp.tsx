import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { PublicUser } from "@zarva/core";
import { api, loadTokens } from "../api";
import { LaunchScreen, type LaunchView } from "../LaunchScreen";
import { navTheme, stackOptions, tabListeners, tabOptions } from "../nav";
import type { Theme } from "../theme";
import { Loading } from "../ui";
import { CustomerStore } from "./store";
import { HomeScreen } from "./HomeScreen";
import { CategoryScreen } from "./CategoryScreen";
import { AddAddressScreen, CheckoutScreen } from "./CheckoutScreen";
import { BookingScreen, BookingsScreen } from "./BookingsScreens";
import { AccountScreen } from "./AccountScreen";
import { FeedbackScreen, HelpScreen, NewTicketScreen, TicketScreen } from "./HelpScreens";

/**
 * ZARVA (customer app). Tabs: Home, Bookings, Account. Booking flow screens push on top with
 * native headers and swipe-back. Nothing from the partner app appears here.
 */
export type CustomerStackParams = {
  Tabs: undefined;
  Category: { categoryId: string; title: string };
  Checkout: undefined;
  AddAddress: undefined;
  Booking: { id: string; justBooked?: boolean };
  Help: undefined;
  NewTicket: { bookingId?: string; label?: string };
  Ticket: { id: string; justCreated?: boolean };
  Feedback: undefined;
};
export type CustomerTabParams = { Home: undefined; Bookings: undefined; Account: undefined };

const Stack = createNativeStackNavigator<CustomerStackParams>();
const Tabs = createBottomTabNavigator<CustomerTabParams>();

interface Session { t: Theme; user: PublicUser | null; setUser: (u: PublicUser) => void; signOut: () => Promise<void>; onSwitchApp?: () => void }
const SessionCtx = createContext<Session | null>(null);
export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error("useSession outside CustomerApp");
  return s;
}

export function CustomerApp({ t, onSwitchApp, onOtherApp, initialView }: {
  t: Theme;
  /** Development only: the "open ZARVA Partner" row on the Account tab. */
  onSwitchApp?: () => void;
  /** Development only: the sign-in screen's "Partner sign up" opens the partner app in place. */
  onOtherApp?: (view: LaunchView) => void;
  initialView?: LaunchView;
}) {
  const [state, setState] = useState<"loading" | "login" | "in">("loading");
  const [user, setUser] = useState<PublicUser | null>(null);
  useEffect(() => { void loadTokens("customer").then((ok) => setState(ok ? "in" : "login")); }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setState("login");
  }, []);
  useEffect(() => {
    if (state === "in") api.me().then((r) => setUser(r.user)).catch(() => void signOut());
  }, [state, signOut]);

  if (state === "loading") return <View style={{ flex: 1, backgroundColor: t.bg }}><Loading /></View>;
  if (state === "login") {
    return <LaunchScreen t={t} app="customer" client={api} initialView={initialView} onSignedIn={() => setState("in")} onOtherApp={onOtherApp} />;
  }

  return (
    <SessionCtx.Provider value={{ t, user, setUser, signOut, onSwitchApp }}>
      <CustomerStore>
        <NavigationContainer theme={navTheme(t)}>
          <Stack.Navigator screenOptions={stackOptions(t)}>
            <Stack.Screen name="Tabs" component={CustomerTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Category" component={CategoryScreen} options={({ route }) => ({ title: route.params.title })} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: "Checkout" }} />
            <Stack.Screen name="AddAddress" component={AddAddressScreen} options={{ title: "Add address", presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="Booking" component={BookingScreen} options={{ title: "Booking" }} />
            <Stack.Screen name="Help" component={HelpScreen} options={{ title: "Help & support" }} />
            <Stack.Screen name="NewTicket" component={NewTicketScreen} options={{ title: "Raise a ticket", presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="Ticket" component={TicketScreen} options={{ title: "Ticket" }} />
            <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: "Send feedback", presentation: "modal", animation: "slide_from_bottom" }} />
          </Stack.Navigator>
        </NavigationContainer>
      </CustomerStore>
    </SessionCtx.Provider>
  );
}

function CustomerTabs() {
  const { t } = useSession();
  return (
    <Tabs.Navigator
      screenOptions={tabOptions(t, { Home: ["home", "home-outline"], Bookings: ["calendar", "calendar-outline"], Account: ["person-circle", "person-circle-outline"] })}
      screenListeners={tabListeners}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tabs.Screen name="Bookings" component={BookingsScreen} options={{ title: "Your bookings", tabBarLabel: "Bookings" }} />
      <Tabs.Screen name="Account" component={AccountScreen} />
    </Tabs.Navigator>
  );
}
