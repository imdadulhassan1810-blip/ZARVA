import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import { logoRules } from "@zarva/brand";
import { formatPhone, type Address } from "@zarva/core";
import { api } from "../api";
import { CodeForm } from "../CodeForm";
import { Card, ConfirmSheet, Group, Ionicons, ListRow, Sheet } from "../ui";
import { useSession } from "./CustomerApp";
import type { Nav } from "./HomeScreen";

export function AccountScreen() {
  const { t, user, setUser, signOut, onSwitchApp } = useSession();
  const nav = useNavigation<Nav>();
  const [phoneSheet, setPhoneSheet] = useState(false);
  const [addrSheet, setAddrSheet] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  useFocusEffect(useCallback(() => { api.listAddresses().then((r) => setAddresses(r.addresses)).catch(() => {}); }, []));
  const display = user?.name || "Your account";
  const contact = [user?.phone ? formatPhone(user.phone) : null, user?.email].filter(Boolean).join(" · ");

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
      <Card t={t} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.primary, alignItems: "center", justifyContent: "center" }}>
          {user?.name ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 22 }}>{user.name[0]!.toUpperCase()}</Text> : <Ionicons name="person" size={26} color="#fff" />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 18 }} numberOfLines={1}>{display}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{contact}</Text>
        </View>
      </Card>

      {user && !user.phone && (
        <Card t={t} onPress={() => setPhoneSheet(true)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: t.warning }}>
          <Ionicons name="call" size={22} color={t.warning} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "700" }}>Add your mobile number</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>Needed before you book. Professionals call before they arrive.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.muted} />
        </Card>
      )}

      <Group t={t}>
        <ListRow t={t} icon="calendar-outline" title="Your bookings" onPress={() => nav.navigate("Bookings")} />
        <ListRow t={t} icon="location-outline" title="Saved addresses" value={addresses.length ? String(addresses.length) : undefined} onPress={() => setAddrSheet(true)} />
        <ListRow t={t} icon="call-outline" title="Mobile number" value={user?.phone ? formatPhone(user.phone) : "Not added"} onPress={user?.phone ? undefined : () => setPhoneSheet(true)} last />
      </Group>

      <Group t={t}>
        <ListRow t={t} icon="help-buoy-outline" title="Help & support" subtitle="Questions, tickets and refunds" onPress={() => nav.navigate("Help")} />
        <ListRow t={t} icon="chatbox-ellipses-outline" title="Send feedback" onPress={() => nav.navigate("Feedback")} last />
      </Group>

      <Group t={t}>
        <ListRow t={t} icon="shield-checkmark-outline" title="Safety" subtitle="Share your start code only with the professional at your door." />
        <ListRow t={t} icon="information-circle-outline" title="About ZARVA" subtitle={logoRules.tagline} value={`v${Constants.expoConfig?.version ?? ""}`} last />
      </Group>

      <Group t={t}>
        {onSwitchApp && <ListRow t={t} icon="swap-horizontal" title="Development: open ZARVA Partner" onPress={onSwitchApp} />}
        <ListRow t={t} icon="log-out-outline" title="Sign out" danger onPress={() => setConfirmOut(true)} last />
      </Group>

      <Sheet t={t} visible={phoneSheet} onClose={() => setPhoneSheet(false)} title="Add mobile number">
        <View style={{ padding: 20, gap: 12 }}>
          <CodeForm t={t} kind="phone" submitLabel="Add number" onSend={(p) => api.requestPhoneLink(p)}
            onVerify={async (p, c) => { setUser((await api.verifyPhoneLink(p, c)).user); setPhoneSheet(false); }} />
        </View>
      </Sheet>
      <Sheet t={t} visible={addrSheet} onClose={() => setAddrSheet(false)} title="Saved addresses">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 8, gap: 10 }}>
          {addresses.length === 0 && <Text style={{ color: t.muted }}>No saved addresses yet. You can add one at checkout.</Text>}
          {addresses.map((a) => (
            <Card key={a.id} t={t} style={{ flexDirection: "row", gap: 12 }}>
              <Ionicons name={a.label === "work" ? "briefcase-outline" : a.label === "home" ? "home-outline" : "location-outline"} size={20} color={t.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700", textTransform: "capitalize" }}>{a.label} · {a.name}{a.isDefault ? " · default" : ""}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{[a.line1, a.line2, `${a.city} ${a.pincode}`].filter(Boolean).join(", ")}</Text>
              </View>
            </Card>
          ))}
        </ScrollView>
      </Sheet>
      <ConfirmSheet t={t} visible={confirmOut} onClose={() => setConfirmOut(false)} destructive title="Sign out of ZARVA?" confirm="Sign out" cancel="Stay signed in" onConfirm={() => void signOut()} />
    </ScrollView>
  );
}
