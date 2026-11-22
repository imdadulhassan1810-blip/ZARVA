/**
 * One codebase, two phone apps, like Uber's rider and driver apps:
 *   ZARVA          (customers)  default
 *   ZARVA Partner  (service professionals)  APP_VARIANT=partner
 * Each has its own name, store listing, app id and sign-in. In development (Expo Go) the app
 * opens the customer app, and its "Partner sign up" button switches to the partner app in place.
 */
module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT; // "customer" | "partner" | undefined (dev: ask)
  const partner = variant === "partner";
  // The live API address, e.g. https://api.zarva.in. A store build (APP_VARIANT set) has no computer
  // to fall back to, so it must be given one; without it the app would call "localhost" and fail.
  const apiUrl = process.env.API_URL || config.extra?.apiUrl;
  if (variant && process.env.EAS_BUILD && !apiUrl) {
    throw new Error("Set API_URL (e.g. https://api.zarva.in) for this build: in eas.json or as an EAS environment variable.");
  }
  if (apiUrl && variant && process.env.EAS_BUILD && !apiUrl.startsWith("https://")) {
    throw new Error("API_URL must start with https:// for a store build.");
  }
  return {
    ...config,
    name: partner ? "ZARVA Partner" : config.name,
    slug: config.slug,
    scheme: partner ? "zarvapartner" : config.scheme,
    // Sign in with Apple is offered in the customer app only (partners sign in with their mobile number).
    ios: { ...config.ios, bundleIdentifier: partner ? "in.zarva.partner" : config.ios.bundleIdentifier, usesAppleSignIn: !partner },
    android: { ...config.android, package: partner ? "in.zarva.partner" : config.android.package },
    plugins: [...(config.plugins ?? []), ...(partner ? [] : ["expo-apple-authentication"])],
    extra: {
      ...config.extra,
      ...(apiUrl ? { apiUrl } : {}),
      appMode: variant === "partner" || variant === "customer" ? variant : "ask",
      // Google sign-in for the customer app. Create these in Google Cloud (see docs/sign-in-setup.md)
      // and add every one of them to the API's GOOGLE_CLIENT_ID list too. Empty = Google is hidden in store builds.
      googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID || "",
      googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || "",
      googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || "",
      // Where "Partner sign up" in the customer app, and "Customer sign up" in the partner app, send people.
      // Point these at the store listings once both apps are published.
      partnerSignupUrl: process.env.PARTNER_SIGNUP_URL || "https://zarva.in/partner/login",
      customerAppUrl: process.env.CUSTOMER_APP_URL || "https://zarva.in/login",
    },
  };
};
