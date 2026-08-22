import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export function ProfileScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Field label="Name" value={user.name} />
        <Field label="Email" value={user.email} />
        {user.phone ? <Field label="Phone" value={user.phone} /> : null}
        <Field label="Member since" value={new Date(user.createdAt).toLocaleDateString()} />
      </View>
      <Pressable
        style={styles.logoutButton}
        onPress={async () => {
          await logout();
          navigation.replace("Home");
        }}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 16 },
  card: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  field: { gap: 2 },
  fieldLabel: { fontSize: 11, color: colors.muted },
  fieldValue: { fontSize: 14, fontWeight: "600", color: colors.text },
  logoutButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  logoutText: { color: colors.danger, fontWeight: "700" },
});
