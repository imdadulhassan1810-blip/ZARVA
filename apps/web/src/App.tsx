import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Category } from "./pages/Category";
import { ListingDetail } from "./pages/ListingDetail";
import { Cart } from "./pages/Cart";
import { Bills } from "./pages/Bills";
import { Orders } from "./pages/Orders";
import { Profile } from "./pages/Profile";
import { Tracking } from "./pages/Tracking";
import { AdminDashboard } from "./pages/AdminDashboard";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="category/:slug" element={<Category />} />
        <Route path="listing/:id" element={<ListingDetail />} />

        <Route element={<ProtectedRoute />}>
          <Route path="cart" element={<Cart />} />
          <Route path="bills" element={<Bills />} />
          <Route path="orders" element={<Orders />} />
          <Route path="tracking/:orderId" element={<Tracking />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route element={<AdminRoute />}>
          <Route path="admin" element={<AdminDashboard />} />
        </Route>

        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
