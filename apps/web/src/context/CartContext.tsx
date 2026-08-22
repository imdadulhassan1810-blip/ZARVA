import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { CartItem } from "@oneapp/shared";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

interface CartContextValue {
  items: CartItem[];
  count: number;
  refresh: () => Promise<void>;
  addToCart: (listingId: string, quantity?: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setItems(await api.getCart());
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addToCart = useCallback(async (listingId: string, quantity = 1) => {
    setItems(await api.addToCart(listingId, quantity));
  }, []);

  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    setItems(await api.updateCartItem(itemId, quantity));
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    setItems(await api.removeCartItem(itemId));
  }, []);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, count, refresh, addToCart, updateQuantity, removeItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
