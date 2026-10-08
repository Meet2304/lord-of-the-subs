<script lang="ts">
  import type { Session } from "@supabase/supabase-js";
  import { onMount } from "svelte";
  import { eventCostUsd } from "../shared/prices.mjs";
  import { localDateString, subscriptionCostUsd } from "../shared/subscriptions.mjs";
  import { supabase } from "./lib/supabase";

  type Provider = "anthropic" | "openai" | "cursor";

  type SummaryRow = {
    provider: Provider;
    model: string;
    events: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
  };

  type RecentRow = {
    provider: Provider;
    model: string;
    occurred_at: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
  };

  type Subscription = {
    id: string;
    provider: "anthropic" | "openai" | "cursor";
    label: string;
    amount_cents: number;
    cadence: "monthly" | "annual";
    starts_on: string;
    ends_on: string | null;
  };

  const providerName: Record<Provider, string> = {
    anthropic: "Claude Code",
    openai: "Codex",
    cursor: "Cursor",
  };

  const planName: Record<Provider, string> = {
    anthropic: "Claude",
    openai: "ChatGPT",
    cursor: "Cursor",
  };

  let session = $state<Session | null>(null);
  let ready = $state(false);
  let mode = $state<"sign-in" | "sign-up">("sign-up");
  let email = $state("");
  let password = $state("");
  let authError = $state("");
  let authNote = $state("");
  let busy = $state(false);

  let days = $state(30);
  let summaryRows = $state<SummaryRow[]>([]);
  let recent = $state<RecentRow[]>([]);
  let subscriptions = $state<Subscription[]>([]);
  let loadError = $state("");
  let latestUpload = $state<string | null>(null);

  let label = $state("");
  let planProvider = $state<Subscription["provider"]>("anthropic");
  let dollars = $state("");
  let cadence = $state<Subscription["cadence"]>("annual");
  let startsOn = $state(localDateString(new Date()));
  let endsOn = $state("");
  let planError = $state("");

  const usd = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
  const tokens = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const when = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  function windowBounds(dayCount: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (dayCount - 1));
    start.setHours(0, 0, 0, 0);
    const endExclusive = new Date(end);
    endExclusive.setDate(end.getDate() + 1);
    endExclusive.setHours(0, 0, 0, 0);
    return {
      startDate: localDateString(start),
      endDate: localDateString(end),
      startIso: start.toISOString(),
      endIso: endExclusive.toISOString(),
    };
  }

  async function load() {
    const bounds = windowBounds(days);
    const [usage, plans, newest, latestRows] = await Promise.all([
      supabase.rpc("usage_summary", { start_at: bounds.startIso, end_at: bounds.endIso }),
      supabase
        .from("subscriptions")
        .select("id,provider,label,amount_cents,cadence,starts_on,ends_on")
        .order("starts_on", { ascending: false }),
      supabase
        .from("usage_events")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("usage_events")
        .select("provider,model,occurred_at,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens")
        .gte("occurred_at", bounds.startIso)
        .lt("occurred_at", bounds.endIso)
        .order("occurred_at", { ascending: false })
        .limit(8),
    ]);
    if (usage.error) throw new Error(usage.error.message);
    if (plans.error) throw new Error(plans.error.message);
    if (newest.error) throw new Error(newest.error.message);
    if (latestRows.error) throw new Error(latestRows.error.message);
    summaryRows = (usage.data ?? []) as SummaryRow[];
    subscriptions = (plans.data ?? []) as Subscription[];
    latestUpload = newest.data?.[0]?.created_at ?? null;
    recent = (latestRows.data ?? []) as RecentRow[];
  }

  async function refresh() {
    loadError = "";
    try {
      await load();
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Could not load usage";
    }
  }

  onMount(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      session = next;
      ready = true;
      if (next) void refresh();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible" && session) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  });

  async function submitAuth(event: SubmitEvent) {
    event.preventDefault();
    authError = "";
    authNote = "";
    busy = true;
    try {
      if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          authNote = "Check your email to confirm the account, then sign in. If no email arrives, turn off Confirm email in the Supabase Auth settings and sign up again.";
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      authError = error instanceof Error ? error.message : "Auth failed";
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    summaryRows = [];
    recent = [];
    subscriptions = [];
  }

  async function addPlan(event: SubmitEvent) {
    event.preventDefault();
    if (!session) return;
    planError = "";
    const amount = Number(dollars);
    if (!label.trim() || !Number.isFinite(amount) || amount < 0) {
      planError = "Enter a name and a dollar amount. Use 0 while a promo is free.";
      return;
    }
    const { error } = await supabase.from("subscriptions").insert({
      user_id: session.user.id,
      provider: planProvider,
      label: label.trim(),
      amount_cents: Math.round(amount * 100),
      cadence,
      starts_on: startsOn,
      ends_on: endsOn || null,
    });
    if (error) {
      planError = error.message;
      return;
    }
    label = "";
    dollars = "";
    endsOn = "";
    await refresh();
  }

  async function removePlan(id: string) {
    const { error } = await supabase.from("subscriptions").delete().eq("id", id);
    if (error) {
      planError = error.message;
      return;
    }
    await refresh();
  }

  function setDays(next: number) {
    days = next;
    void refresh();
  }

  const bounds = $derived(windowBounds(days));
  const summary = $derived.by(() => {
    const byProvider = new Map<string, { fresh: number; cache: number; usd: number; unpriced: number }>();
    const byModel = new Map<string, { provider: string; fresh: number; cache: number; usd: number; unpriced: boolean }>();
    let apiUsd = 0;
    let unpricedTokens = 0;
    let freshTokens = 0;
    let cacheTokens = 0;
    for (const row of summaryRows) {
      const fresh = Number(row.input_tokens) + Number(row.output_tokens);
      const cache = Number(row.cache_read_tokens) + Number(row.cache_write_tokens);
      freshTokens += fresh;
      cacheTokens += cache;
      const cost = eventCostUsd(row);
      const provider = byProvider.get(row.provider) ?? { fresh: 0, cache: 0, usd: 0, unpriced: 0 };
      provider.fresh += fresh;
      provider.cache += cache;
      if (cost == null) unpricedTokens += fresh + cache;
      else {
        provider.usd += cost;
        apiUsd += cost;
      }
      provider.unpriced += cost == null ? fresh + cache : 0;
      byProvider.set(row.provider, provider);

      const model = byModel.get(`${row.provider}:${row.model}`) ?? {
        provider: row.provider,
        fresh: 0,
        cache: 0,
        usd: 0,
        unpriced: cost == null,
      };
      model.fresh += fresh;
      model.cache += cache;
      if (cost != null) model.usd += cost;
      byModel.set(`${row.provider}:${row.model}`, model);
    }
    const paid = subscriptionCostUsd(subscriptions, bounds.startDate, bounds.endDate);
    return {
      apiUsd,
      paid,
      unpricedTokens,
      freshTokens,
      cacheTokens,
      providers: [...byProvider.entries()].sort((a, b) => b[1].fresh + b[1].cache - (a[1].fresh + a[1].cache)),
      models: [...byModel.entries()]
        .map(([key, value]) => ({ model: key.slice(key.indexOf(":") + 1), ...value }))
        .sort((a, b) => b.fresh + b.cache - (a.fresh + a.cache)),
    };
  });
</script>

<main>
  <h1>Lord of the Subs</h1>
  <p class="muted">Local Claude Code and Codex transcripts from this computer, priced at public API rates. This is not the percentage on your Claude, ChatGPT, or Cursor account page.</p>

  {#if !ready}
    <p>Loading…</p>
  {:else if !session}
    <form class="card stack" onsubmit={submitAuth}>
      <div class="row">
        <button type="button" class={mode === "sign-up" ? "active" : "secondary"} onclick={() => (mode = "sign-up")}>Create account</button>
        <button type="button" class={mode === "sign-in" ? "active" : "secondary"} onclick={() => (mode = "sign-in")}>Sign in</button>
      </div>
      <label>Email <input type="email" bind:value={email} autocomplete="username" required /></label>
      <label>Password <input type="password" bind:value={password} autocomplete="current-password" minlength="6" required /></label>
      {#if authError}<p class="error">{authError}</p>{/if}
      {#if authNote}<p>{authNote}</p>{/if}
      <button type="submit" disabled={busy}>{mode === "sign-up" ? "Create account" : "Sign in"}</button>
    </form>
  {:else}
    <div class="row">
      <span class="muted">{session.user.email}</span>
      <button class="secondary" type="button" onclick={signOut}>Sign out</button>
    </div>

    <div class="row" style="margin-top: 1rem">
      {#each [1, 7, 30, 90] as option}
        <button type="button" class={days === option ? "active" : "secondary"} onclick={() => setDays(option)}>
          {option === 1 ? "Today" : `${option} days`}
        </button>
      {/each}
    </div>

    {#if loadError}<p class="error">{loadError}</p>{/if}

    <section class="figures" style="margin-top: 1rem">
      <article class="card">
        <div class="muted">API-equivalent</div>
        <p class="figure">{usd.format(summary.apiUsd)}</p>
        <div class="muted">{tokens.format(summary.freshTokens)} new tokens. {tokens.format(summary.cacheTokens)} were cached context reread on later turns.</div>
      </article>
      <article class="card">
        <div class="muted">Subscriptions in this window</div>
        <p class="figure">{usd.format(summary.paid)}</p>
        <div class="muted">
          {#if summary.paid === 0 && subscriptions.length === 0}
            Add your plans below.
          {:else}
            Difference {usd.format(summary.apiUsd - summary.paid)}
          {/if}
        </div>
      </article>
    </section>

    <p class="muted">
      {#if latestUpload}
        Newest row reached the database {when.format(new Date(latestUpload))}.
      {:else}
        No usage uploaded yet. The laptop script fills this in after you run it.
      {/if}
      {#if summary.unpricedTokens > 0}
        {tokens.format(summary.unpricedTokens)} tokens have no list price yet, so they are excluded from the dollar figure.
      {/if}
    </p>

    <section class="card" style="margin-top: 1rem">
      <h2>Providers</h2>
      {#if summary.providers.length === 0}
        <p class="muted">Nothing in this window.</p>
      {:else}
        <table>
          <thead>
            <tr><th>Source</th><th>New</th><th>Cached</th><th>API $</th></tr>
          </thead>
          <tbody>
            {#each summary.providers as [provider, value]}
              <tr>
                <td>{providerName[provider as Provider] ?? provider}</td>
                <td>{tokens.format(value.fresh)}</td>
                <td>{tokens.format(value.cache)}</td>
                <td>{usd.format(value.usd)}{#if value.unpriced > 0} <span class="muted">partial</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      {#if !summary.providers.some(([provider]) => provider === "cursor")}
        <p class="muted">Cursor account usage is not here. Run npm run install:cursor-hook, restart Cursor, and leave npm run sync running.</p>
      {/if}
    </section>

    <section class="card" style="margin-top: 0.75rem">
      <h2>Models</h2>
      {#if summary.models.length === 0}
        <p class="muted">No model rows yet.</p>
      {:else}
        <table>
          <thead>
            <tr><th>Model</th><th>New</th><th>Cached</th><th>API $</th></tr>
          </thead>
          <tbody>
            {#each summary.models as model}
              <tr>
                <td>{model.model}<div class="muted">{providerName[model.provider as Provider] ?? model.provider}</div></td>
                <td>{tokens.format(model.fresh)}</td>
                <td>{tokens.format(model.cache)}</td>
                <td>{model.unpriced ? "—" : usd.format(model.usd)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section class="card" style="margin-top: 0.75rem">
      <h2>Latest</h2>
      {#if recent.length === 0}
        <p class="muted">Claude Code and Codex show up after the sync script runs. Cursor shows up after you run npm run install:cursor-hook and restart Cursor. Chats on the Claude and ChatGPT websites are not in this list.</p>
      {:else}
        <table>
          <tbody>
            {#each recent as row}
              <tr>
                <td>
                  {when.format(new Date(row.occurred_at))}
                  <div class="muted">{providerName[row.provider]} · {row.model}</div>
                </td>
                <td>{tokens.format(row.output_tokens)} out</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section class="card" style="margin-top: 0.75rem">
      <h2>What you pay</h2>
      <p class="muted">Enter the real charge. A free student window is $0 with an end date. An annual plan is the amount you paid for the year.</p>
      {#if subscriptions.length > 0}
        <table>
          <tbody>
            {#each subscriptions as plan}
              <tr>
                <td>
                  {plan.label}
                  <div class="muted">
                    {planName[plan.provider]} · {usd.format(plan.amount_cents / 100)} / {plan.cadence === "annual" ? "year" : "month"}
                    · from {plan.starts_on}{plan.ends_on ? ` to ${plan.ends_on}` : ""}
                  </div>
                </td>
                <td><button class="secondary" type="button" onclick={() => removePlan(plan.id)}>Remove</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      <form class="form-grid" style="margin-top: 0.8rem" onsubmit={addPlan}>
        <label class="span-2">Name <input bind:value={label} placeholder="Claude Pro" /></label>
        <label>Provider
          <select bind:value={planProvider}>
            <option value="anthropic">Claude</option>
            <option value="openai">ChatGPT</option>
            <option value="cursor">Cursor</option>
          </select>
        </label>
        <label>Amount in USD <input inputmode="decimal" bind:value={dollars} placeholder="200" /></label>
        <label>Cadence
          <select bind:value={cadence}>
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label>Starts <input type="date" bind:value={startsOn} required /></label>
        <label class="span-2">Ends, if the promo stops <input type="date" bind:value={endsOn} /></label>
        {#if planError}<p class="error span-2">{planError}</p>{/if}
        <button class="span-2" type="submit">Save plan</button>
      </form>
    </section>
  {/if}
</main>
