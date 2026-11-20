"use client";

/** Home-services cart: one category at a time, kept in localStorage so a refresh doesn't lose it. */
export interface Cart { cityId: string; categoryId: string | null; items: Record<string, number> }
const KEY = "zarva.home.cart";
const empty = (): Cart => ({ cityId: "durgapur", categoryId: null, items: {} });

export function loadCart(): Cart {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cart) : empty();
  } catch {
    return empty();
  }
}

export function saveCart(c: Cart): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage blocked */
  }
}

export function clearCart(): void {
  saveCart(empty());
}
