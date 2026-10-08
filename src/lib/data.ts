import { localDateString } from "../../shared/subscriptions.mjs";
import type { Provider } from "../../shared/metrics.mjs";
import { supabase } from "./supabase";

export const HISTORY_DAYS = 90;

export type PlanRow = {
  id: string;
  provider: Provider;
  label: string;
  amount_cents: number;
  cadence: "monthly" | "annual";
  starts_on: string;
  ends_on: string | null;
};

export type Snapshot = {
  /** Raw usage_buckets rows, parsed lazily so the cache stays compact. */
  buckets: unknown[];
  latest: string | null;
  plans: PlanRow[];
  fetchedAt: number;
  today: string;
};

export class MissingMigrationError extends Error {
  constructor() {
    super("The usage_buckets function is not in the database yet.");
    this.name = "MissingMigrationError";
  }
}

const cacheKey = (userId: string) => `lots:snapshot:v1:${userId}`;

export function readCachedSnapshot(userId: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as Snapshot;
    return Array.isArray(snapshot.buckets) && Array.isArray(snapshot.plans) ? snapshot : null;
  } catch {
    return null;
  }
}

function writeCachedSnapshot(userId: string, snapshot: Snapshot) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(snapshot));
  } catch {
    // Storage full or disabled: the page still works, it just will not paint instantly next time.
  }
}

export function clearCachedSnapshots() {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("lots:snapshot:")) localStorage.removeItem(key);
  }
}

export async function fetchSnapshot(userId: string): Promise<Snapshot> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (HISTORY_DAYS - 1));
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const [usage, plans] = await Promise.all([
    supabase.rpc("usage_buckets", {
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      time_zone: timeZone,
    }),
    supabase
      .from("subscriptions")
      .select("id,provider,label,amount_cents,cadence,starts_on,ends_on")
      .order("starts_on", { ascending: false }),
  ]);
  if (usage.error) {
    if (usage.error.code === "PGRST202" || usage.error.code === "42883") throw new MissingMigrationError();
    throw new Error(usage.error.message);
  }
  if (plans.error) throw new Error(plans.error.message);

  const payload = (usage.data ?? {}) as { buckets?: unknown; latest?: unknown };
  const snapshot: Snapshot = {
    buckets: Array.isArray(payload.buckets) ? payload.buckets : [],
    latest: typeof payload.latest === "string" ? payload.latest : null,
    plans: (plans.data ?? []) as PlanRow[],
    fetchedAt: Date.now(),
    today: localDateString(now),
  };
  writeCachedSnapshot(userId, snapshot);
  return snapshot;
}

export async function addPlan(userId: string, plan: Omit<PlanRow, "id">) {
  const { error } = await supabase.from("subscriptions").insert({ ...plan, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function removePlan(id: string) {
  const { error } = await supabase.from("subscriptions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
