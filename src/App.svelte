<script lang="ts">
  import type { Session } from "@supabase/supabase-js";
  import { onMount } from "svelte";
  import Dashboard from "./components/Dashboard.svelte";
  import SignIn from "./components/SignIn.svelte";
  import Wordmark from "./components/Wordmark.svelte";
  import {
    MissingMigrationError,
    addPlan,
    clearCachedSnapshots,
    fetchSnapshot,
    readCachedSnapshot,
    removePlan,
    type PlanRow,
    type Snapshot,
  } from "./lib/data";
  import { ago } from "./lib/format";
  import { supabase } from "./lib/supabase";

  const demo = import.meta.env.DEV && new URLSearchParams(location.search).has("demo");

  let session = $state<Session | null>(null);
  let ready = $state(false);
  let snapshot = $state<Snapshot | null>(null);
  let refreshing = $state(false);
  let error = $state("");
  let missingMigration = $state(false);
  let now = $state(Date.now());

  async function refresh() {
    if (demo || !session || refreshing) return;
    refreshing = true;
    try {
      snapshot = await fetchSnapshot(session.user.id);
      error = "";
      missingMigration = false;
    } catch (caught) {
      if (caught instanceof MissingMigrationError) missingMigration = true;
      else error = caught instanceof Error ? caught.message : "Could not load usage";
    } finally {
      refreshing = false;
    }
  }

  onMount(() => {
    const clock = setInterval(() => (now = Date.now()), 30_000);
    if (demo) {
      void import("./lib/demo").then(({ demoSnapshot }) => {
        const full = demoSnapshot();
        snapshot =
          new URLSearchParams(location.search).get("demo") === "empty"
            ? { ...full, buckets: [], plans: [], latest: null }
            : full;
        ready = true;
      });
      return () => clearInterval(clock);
    }

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const userChanged = next?.user.id !== session?.user.id;
      session = next;
      ready = true;
      if (!next) {
        snapshot = null;
        return;
      }
      if (userChanged) {
        snapshot = readCachedSnapshot(next.user.id);
        // Supabase warns against awaiting its own calls inside this callback.
        setTimeout(() => void refresh(), 0);
      }
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  });

  async function signOut() {
    clearCachedSnapshots();
    await supabase.auth.signOut();
  }

  async function onaddplan(plan: Omit<PlanRow, "id">) {
    if (!session) return;
    await addPlan(session.user.id, plan);
    await refresh();
  }

  async function onremoveplan(id: string) {
    await removePlan(id);
    await refresh();
  }

  const fresh = $derived(
    snapshot?.latest ? now - new Date(snapshot.latest).getTime() < 15 * 60_000 : false,
  );
</script>

<div class="glow" aria-hidden="true"></div>
<div class="shell">
  <header class="top">
    <Wordmark />
    {#if demo}
      <span class="status"><i class="dot demo"></i>Demo data</span>
    {:else if session}
      <div class="right">
        {#if snapshot}
          <span class="status" title={snapshot.latest ? new Date(snapshot.latest).toLocaleString() : "No usage uploaded yet"}>
            <i class="dot" class:live={fresh} class:busy={refreshing}></i>
            <span class="status-text">Latest response {ago(snapshot.latest, now)}</span>
          </span>
        {/if}
        <button class="ghost" type="button" onclick={signOut} title={session.user.email}>Sign out</button>
      </div>
    {/if}
  </header>

  <main>
    {#if !ready}
      <div class="placeholder" aria-busy="true"></div>
    {:else if !demo && !session}
      <SignIn />
    {:else}
      {#if missingMigration}
        <p class="banner">
          The database is missing the <code>usage_buckets</code> function this page reads. Run
          <code>supabase/migrations/20261008060000_usage_buckets.sql</code> in the Supabase SQL editor, then reload.
        </p>
      {/if}
      {#if error}<p class="banner error">{error}</p>{/if}
      {#if snapshot}
        <Dashboard {snapshot} readOnly={demo} {onaddplan} {onremoveplan} />
      {:else if !missingMigration && !error}
        <div class="placeholder" aria-busy="true"></div>
      {/if}
    {/if}
  </main>
</div>
