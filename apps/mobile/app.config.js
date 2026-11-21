/**
 * One codebase, two phone apps, like Uber's rider and driver apps:
 *   ZARVA          (customers)  default
 *   ZARVA Partner  (service professionals)  APP_VARIANT=partner
 * Each has its own name, store listing, app id and sign-in. In development (Expo Go) the app
 * asks which one to open, so you can try both from one phone.
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
    ios: { ...config.ios, bundleIdentifier: partner ? "in.zarva.partner" : config.ios.bundleIdentifier },
    android: { ...config.android, package: partner ? "in.zarva.partner" : config.android.package },
    extra: { ...config.extra, ...(apiUrl ? { apiUrl } : {}), appMode: variant === "partner" || variant === "customer" ? variant : "ask" },
  };
};
