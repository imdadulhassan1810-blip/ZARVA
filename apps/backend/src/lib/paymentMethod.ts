import { z } from "zod";
import { COD_ELIGIBLE_CATEGORY_SLUGS } from "@oneapp/shared";

/** The two ways a "mock" (non-Razorpay) checkout/booking can be paid: an honest Cash on
 *  Delivery for eligible categories, or the plain demo fallback everywhere else. */
export const mockMethodSchema = z.enum(["mock", "cod"]);

/** Which Razorpay Checkout method tab to restrict the widget to. */
export const onlineMethodSchema = z.enum(["card", "netbanking", "razorpay"]);

/** COD is only a real option for categories where being handed something / visited in
 *  person makes sense — see COD_ELIGIBLE_CATEGORY_SLUGS. Returns an error object if not. */
export function checkCodEligibility(categorySlug: string, paymentMethod: string | undefined) {
  if (paymentMethod === "cod" && !COD_ELIGIBLE_CATEGORY_SLUGS.includes(categorySlug)) {
    return {
      error: "cod_not_available" as const,
      message: "Cash on Delivery isn't available for this category — pay online instead.",
    };
  }
  return null;
}
