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
  return {
    ...config,
    name: partner ? "ZARVA Partner" : config.name,
    slug: config.slug,
    scheme: partner ? "zarvapartner" : config.scheme,
    ios: { ...config.ios, bundleIdentifier: partner ? "in.zarva.partner" : config.ios.bundleIdentifier },
    android: { ...config.android, package: partner ? "in.zarva.partner" : config.android.package },
    extra: { ...config.extra, appMode: variant === "partner" || variant === "customer" ? variant : "ask" },
  };
};
