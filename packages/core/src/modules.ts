import type { VerticalId } from "@zarva/brand";

/**
 * A vertical (food, shopping, events, travel, home) is a ZarvaModule.
 * The core platform owns users, addresses, auth, payments and notifications.
 * A module owns only its own catalogue, bookings/orders and routes, and talks to core
 * through the ModuleContext. Modules never import each other.
 *
 * TApp is the HTTP framework instance (Fastify on the API), kept generic so this
 * package stays framework-free and usable by web and mobile.
 */
export interface ModuleManifest {
  id: VerticalId;
  name: string;
  /** Semver of the module's API surface. */
  version: string;
  /** Short line shown on the home screen tile. */
  tagline: string;
}

export interface ModuleContext<TApp = unknown> {
  app: TApp;
  /** URL prefix the module must mount under, e.g. /v1/m/home */
  prefix: string;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface ZarvaModule<TApp = unknown> {
  manifest: ModuleManifest;
  register(ctx: ModuleContext<TApp>): Promise<void> | void;
}

/** Public description of what the client should show, returned by GET /v1/modules. */
export interface ModuleStatus extends ModuleManifest {
  enabled: boolean;
}

export function parseEnabledModules(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export class ModuleRegistry<TApp = unknown> {
  private modules = new Map<string, ZarvaModule<TApp>>();

  add(mod: ZarvaModule<TApp>): this {
    if (this.modules.has(mod.manifest.id)) throw new Error(`Module ${mod.manifest.id} registered twice`);
    this.modules.set(mod.manifest.id, mod);
    return this;
  }

  list(): ZarvaModule<TApp>[] {
    return [...this.modules.values()];
  }

  async mount(app: TApp, enabled: Set<string>, log: ModuleContext["log"]): Promise<ModuleStatus[]> {
    const statuses: ModuleStatus[] = [];
    for (const mod of this.modules.values()) {
      const on = enabled.has(mod.manifest.id);
      if (on) await mod.register({ app, prefix: `/v1/m/${mod.manifest.id}`, log });
      statuses.push({ ...mod.manifest, enabled: on });
    }
    return statuses;
  }
}
