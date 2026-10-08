<script lang="ts">
  import { localDateString } from "../../shared/subscriptions.mjs";
  import type { Provider } from "../../shared/metrics.mjs";
  import type { PlanRow } from "../lib/data";
  import { providerColor, providerLabel, usd } from "../lib/format";

  type Props = {
    plans: PlanRow[];
    readOnly: boolean;
    onadd: (plan: Omit<PlanRow, "id">) => Promise<void>;
    onremove: (id: string) => Promise<void>;
  };

  let { plans, readOnly, onadd, onremove }: Props = $props();

  let label = $state("");
  let provider = $state<Provider>("anthropic");
  let dollars = $state("");
  let cadence = $state<PlanRow["cadence"]>("annual");
  let startsOn = $state(localDateString(new Date()));
  let endsOn = $state("");
  let error = $state("");
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = "";
    const amount = Number(dollars);
    if (!label.trim() || dollars.trim() === "" || !Number.isFinite(amount) || amount < 0) {
      error = "Enter a name and a dollar amount. Use 0 while a promo is free.";
      return;
    }
    busy = true;
    try {
      await onadd({
        provider,
        label: label.trim(),
        amount_cents: Math.round(amount * 100),
        cadence,
        starts_on: startsOn,
        ends_on: endsOn || null,
      });
      label = "";
      dollars = "";
      endsOn = "";
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Could not save the plan";
    } finally {
      busy = false;
    }
  }

  async function remove(id: string) {
    error = "";
    try {
      await onremove(id);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Could not remove the plan";
    }
  }
</script>

{#if plans.length > 0}
  <ul class="plans">
    {#each plans as plan (plan.id)}
      <li>
        <i style:background={providerColor[plan.provider]}></i>
        <div>
          <strong>{plan.label}</strong>
          <span>
            {providerLabel[plan.provider]} · {plan.amount_cents === 0 ? "free" : `${usd(plan.amount_cents / 100)} / ${plan.cadence === "annual" ? "year" : "month"}`}
            · {plan.starts_on}{plan.ends_on ? ` → ${plan.ends_on}` : " → ongoing"}
          </span>
        </div>
        {#if !readOnly}<button class="ghost" type="button" onclick={() => remove(plan.id)}>Remove</button>{/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="muted">No plans yet. Add what you actually pay so the page can compare it with API prices.</p>
{/if}

{#if !readOnly}
  <details class="add">
    <summary>Add a plan</summary>
    <form onsubmit={submit}>
      <label class="wide"><span>Name</span><input bind:value={label} placeholder="Claude Pro" /></label>
      <label>
        <span>Provider</span>
        <select bind:value={provider}>
          <option value="anthropic">Claude</option>
          <option value="openai">ChatGPT / OpenAI</option>
          <option value="cursor">Cursor</option>
        </select>
      </label>
      <label><span>Amount (USD)</span><input inputmode="decimal" bind:value={dollars} placeholder="200" /></label>
      <label>
        <span>Billed</span>
        <select bind:value={cadence}>
          <option value="annual">Per year</option>
          <option value="monthly">Per month</option>
        </select>
      </label>
      <label><span>Starts</span><input type="date" bind:value={startsOn} required /></label>
      <label class="wide"><span>Ends (for a promo)</span><input type="date" bind:value={endsOn} /></label>
      {#if error}<p class="error wide">{error}</p>{/if}
      <button class="primary wide" type="submit" disabled={busy}>Save plan</button>
    </form>
  </details>
{:else if error}
  <p class="error">{error}</p>
{/if}

<style>
  .plans {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.85rem;
    padding: 0.85rem 0;
    border-top: 1px solid var(--line);
  }
  li:first-child {
    border-top: 0;
  }
  li i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  li div {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  li span {
    color: var(--muted);
    font-size: 0.8125rem;
  }
  .add {
    margin-top: 1rem;
  }
  summary {
    cursor: pointer;
    color: var(--gold);
    font-size: 0.875rem;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: "+ ";
  }
  details[open] summary::before {
    content: "– ";
  }
  form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
    margin-top: 1rem;
    animation: rise 420ms var(--ease-majestic) both;
  }
  label {
    display: grid;
    gap: 0.35rem;
  }
  label span {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .wide {
    grid-column: 1 / -1;
  }
</style>
