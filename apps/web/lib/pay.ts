"use client";
import type { HomeBooking, HomePaymentStart, PaymentConfirmation } from "@zarva/core";
import { api } from "./api";

type RazorpayCtor = new (opts: Record<string, unknown>) => { open(): void; on(ev: string, fn: () => void): void };

function loadRazorpay(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Payment window failed to load")));
    s.onerror = () => reject(new Error("Payment window failed to load. Check your internet."));
    document.body.appendChild(s);
  });
}

/**
 * Opens the payment sheet and confirms the booking.
 * Dev (mock provider): pays instantly. Live: opens Razorpay Checkout with UPI first.
 */
export async function payForBooking(bookingId: string, payment: HomePaymentStart): Promise<HomeBooking> {
  const orderId = String(payment.clientPayload.order_id ?? "");
  let confirmation: PaymentConfirmation;
  if (orderId.startsWith("mock_order_")) {
    confirmation = (await api.mockPaymentSuccess(orderId)).confirmation;
  } else {
    const Razorpay = await loadRazorpay();
    confirmation = await new Promise<PaymentConfirmation>((resolve, reject) => {
      const rzp = new Razorpay({
        ...payment.clientPayload,
        description: "Home service booking",
        handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
          resolve({ providerOrderId: r.razorpay_order_id, providerPaymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
        modal: { ondismiss: () => reject(new Error("Payment cancelled. Your slot is held for 15 minutes.")) },
      });
      rzp.on("payment.failed", () => reject(new Error("Payment failed. Please try again.")));
      rzp.open();
    });
  }
  return (await api.home.confirmPayment(bookingId, confirmation)).booking;
}
