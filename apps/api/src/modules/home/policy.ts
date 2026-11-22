import { eq } from "drizzle-orm";
import { DEFAULT_HOME_POLICY, homePolicySchema, type HomePolicy, type HomePolicyInput } from "@zarva/core";
import type { Db } from "../../db/client";
import { badRequest } from "../../lib/errors";
import { homeSettings } from "./schema";

const KEY = "cancellation_policy";
const TTL_MS = 30_000;

/**
 * Cancellation, reschedule and partner-penalty rules. Defaults live in @zarva/core; the ZARVA team
 * changes them in admin and the change applies to every cancellation from then on (a cancelled
 * booking keeps the refund worked out at the time, see home_bookings.cancellation).
 */
export class PolicyService {
  private cached: { at: number; value: HomePolicy } | null = null;

  constructor(private db: Db) {}

  async get(): Promise<HomePolicy> {
    if (this.cached && Date.now() - this.cached.at < TTL_MS) return this.cached.value;
    const row = await this.db.query.homeSettings.findFirst({ where: eq(homeSettings.key, KEY) });
    // A stored value that no longer validates (older shape) falls back to the defaults rather than breaking bookings.
    const parsed = row ? homePolicySchema.safeParse({ ...DEFAULT_HOME_POLICY, ...(row.value as object) }) : null;
    const value = parsed?.success ? parsed.data : DEFAULT_HOME_POLICY;
    this.cached = { at: Date.now(), value };
    return value;
  }

  async set(adminId: string, input: HomePolicyInput): Promise<HomePolicy> {
    const parsed = homePolicySchema.safeParse(input);
    if (!parsed.success) throw badRequest("invalid_policy", parsed.error.issues[0]?.message ?? "Check the rules");
    const value = parsed.data;
    await this.db
      .insert(homeSettings)
      .values({ key: KEY, value, updatedBy: adminId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: homeSettings.key, set: { value, updatedBy: adminId, updatedAt: new Date() } });
    this.cached = { at: Date.now(), value };
    return value;
  }
}
