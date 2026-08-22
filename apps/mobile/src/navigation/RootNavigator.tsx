import { Pressable, Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { colors } from "../theme";

import { HomeScreen } from "../screens/HomeScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { CategoryScreen } from "../screens/CategoryScreen";
import { ListingDetailScreen } from "../screens/ListingDetailScreen";
import { CartScreen } from "../screens/CartScreen";
import { BillsScreen } from "../screens/BillsScreen";
import { OrdersScreen } from "../screens/OrdersScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { TrackingScreen } from "../screens/TrackingScreen";
import { AdminScreen } from "../screens/AdminScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function HeaderRight({ navigation }: { navigation: NavProp }) {
  const { user } = useAuth();
  const { count } = useCart();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Pressable onPress={() => navigation.navigate("Cart")} style={{ flexDirection: "row", gap: 2 }}>
        <Text style={{ color: "#fff", fontSize: 13 }}>🛒{count > 0 ? ` ${count}` : ""}</Text>
      </Pressable>
      {!user && (
        <Pressable onPress={() => navigation.navigate("Register")}>
          <Text style={{ color: "#fff", fontSize: 13 }}>Sign up</Text>
        </Pressable>
      )}
      <Pressable onPress={() => navigation.navigate(user ? "Profile" : "Login")}>
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
          {user ? user.name.split(" ")[0] : "Log in"}
        </Text>
      </Pressable>
    </View>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={({ navigation }) => ({
          headerStyle: { backgroundColor: colors.brand },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" as const },
          headerRight: () => <HeaderRight navigation={navigation} />,
        })}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: "🧩 OneApp" }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Log in", headerRight: undefined }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: "Create account", headerRight: undefined }} />
        <Stack.Screen name="Category" component={CategoryScreen} options={{ title: "Category" }} />
        <Stack.Screen name="ListingDetail" component={ListingDetailScreen} options={{ title: "Details" }} />
        <Stack.Screen name="Cart" component={CartScreen} options={{ title: "Your cart" }} />
        <Stack.Screen name="Bills" component={BillsScreen} options={{ title: "Bill Payments" }} />
        <Stack.Screen name="Orders" component={OrdersScreen} options={{ title: "Your orders" }} />
        <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: "Live tracking" }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "My profile" }} />
        <Stack.Screen name="Admin" component={AdminScreen} options={{ title: "🛠️ Admin console" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
