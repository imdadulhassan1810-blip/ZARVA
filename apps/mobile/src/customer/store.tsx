import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_HOME_POLICY, HOME_RULES, homeTotals, type HomeCategory, type HomePolicy, type HomeService } from "@zarva/core";
import { api } from "../api";

export const CITY = "durgapur";

type Cart = { categoryId: string | null; items: Record<string, number> };
type Line = { s: HomeService; qty: number; unitPricePaise: number };

interface Store {
  categories: HomeCategory[] | null;
  services: HomeService[];
  onlinePayment: boolean;
  /** Cancellation and reschedule rules (edited by the ZARVA team in admin). */
  policy: HomePolicy;
  catalogError: string | null;
  reloadCatalog: () => Promise<void>;
  cart: Cart;
  lines: Line[];
  count: number;
  totals: ReturnType<typeof homeTotals>;
  /** Returns false when the change needs a "start a new cart?" confirmation first. */
  setQty: (s: HomeService, qty: number, force?: boolean) => boolean;
  clearCart: () => void;
}

const Ctx = createContext<Store | null>(null);

/** Catalogue and cart for the customer app, shared by every screen. One category per cart. */
export function CustomerStore({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<HomeCategory[] | null>(null);
  const [services, setServices] = useState<HomeService[]>([]);
  const [onlinePayment, setOnline] = useState(false);
  const [policy, setPolicy] = useState<HomePolicy>(DEFAULT_HOME_POLICY);
  const [catalogError, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({ categoryId: null, items: {} });

  const reloadCatalog = useCallback(async () => {
    setError(null);
    try {
      const r = await api.home.catalog(CITY);
      setCategories(r.categories);
      setServices(r.services);
      // Off while the server's Razorpay keys are test keys (no real money would move).
      setOnline(r.onlinePayment !== false);
      if (r.policy) setPolicy(r.policy);
    } catch (e) {
      setError((e as Error).message);
      setCategories((c) => c ?? []);
    }
  }, []);
  useEffect(() => { void reloadCatalog(); }, [reloadCatalog]);

  const value = useMemo<Store>(() => {
    const byId = new Map(services.map((s) => [s.id, s]));
    const lines = Object.entries(cart.items).flatMap(([id, qty]) => {
      const s = byId.get(id);
      return s ? [{ s, qty, unitPricePaise: s.pricePaise }] : [];
    });
    const count = lines.reduce((n, l) => n + l.qty, 0);
    return {
      categories, services, onlinePayment, policy, catalogError, reloadCatalog, cart, lines, count, totals: homeTotals(lines),
      setQty(s, qty, force) {
        const same = cart.categoryId === s.categoryId;
        if (!same && count > 0 && qty > 0 && !force) return false;
        const items = same ? { ...cart.items } : {};
        if (qty <= 0) delete items[s.id];
        else items[s.id] = Math.min(qty, HOME_RULES.maxQtyPerItem);
        setCart({ categoryId: Object.keys(items).length ? s.categoryId : null, items });
        return true;
      },
      clearCart: () => setCart({ categoryId: null, items: {} }),
    };
  }, [categories, services, onlinePayment, policy, catalogError, reloadCatalog, cart]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside CustomerStore");
  return s;
}
