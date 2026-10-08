<script lang="ts">
  import { localDateString } from "../../shared/subscriptions.mjs";
  import { PROVIDERS, parseBuckets, summarize, type Provider } from "../../shared/metrics.mjs";
  import { mixChart, mixColor, modelsChart, rhythmChart, timelineChart, type MixPart, type TimelineMetric } from "../lib/charts";
  import type { PlanRow, Snapshot } from "../lib/data";
  import {
    GOLD,
    WEEKDAYS,
    count,
    hourLabel,
    modelLabels,
    perM,
    pct,
    providerColor,
    providerLabel,
    providerSurface,
    times,
    tokens,
    usd,
  } from "../lib/format";
  import Chart from "./Chart.svelte";
  import Figure from "./Figure.svelte";
  import Plans from "./Plans.svelte";
  import Segmented from "./Segmented.svelte";

  type Props = {
    snapshot: Snapshot;
    readOnly: boolean;
    onaddplan: (plan: Omit<PlanRow, "id">) => Promise<void>;
    onremoveplan: (id: string) => Promise<void>;
  };

  let { snapshot, readOnly, onaddplan, onremoveplan }: Props = $props();

  const ranges = [
    { value: 1, label: "Today" },
    { value: 7, label: "7D" },
    { value: 30, label: "30D" },
    { value: 90, label: "90D" },
  ] as const;
  type Range = (typeof ranges)[number]["value"];
  type Filter = Provider | "all";

  const stored = Number(localStorage.getItem("lots:days"));
  let days = $state<Range>(ranges.some((range) => range.value === stored) ? (stored as Range) : 30);
  let filter = $state<Filter>("all");
  let metric = $state<TimelineMetric>("usd");
  let width = $state(1024);

  function setDays(next: Range) {
    days = next;
    localStorage.setItem("lots:days", String(next));
  }

  const buckets = $derived(parseBuckets(snapshot.buckets));
  const summary = $derived(
    summarize({ buckets, plans: snapshot.plans, endDate: localDateString(new Date()), days, provider: filter }),
  );
  const t = $derived(summary.totals);
  const seen = $derived(new Set(buckets.map((bucket) => bucket.provider)));
  const narrow = $derived(width < 640);

  const providerOptions = $derived([
    { value: "all" as Filter, label: "All" },
    ...PROVIDERS.map((provider) => ({ value: provider as Filter, label: providerLabel[provider], color: providerColor[provider] })),
  ]);
  const metricOptions = [
    { value: "usd" as TimelineMetric, label: "Cost" },
    { value: "tokens" as TimelineMetric, label: "Tokens" },
    { value: "events" as TimelineMetric, label: "Responses" },
  ];

  const rangeLabel = $derived(days === 1 ? "Today" : `Last ${days} days`);
  const hasPlans = $derived(
    snapshot.plans.some((plan) => filter === "all" || plan.provider === filter),
  );
  const returnFigure = $derived(
    t.leverage != null ? t.leverage : null,
  );
  const returnNote = $derived(
    !hasPlans
      ? "Add your plans below to compare"
      : t.paidUsd === 0
        ? "Your plans cost $0 in this window"
        : "API value for each $1 you paid",
  );

  const timeline = $derived(timelineChart(summary, metric, narrow));
  const mix = $derived(mixChart(t));
  const labels = $derived(modelLabels(summary.models));
  const modelChart = $derived(modelsChart(summary.models, labels));
  const pricedModels = $derived(summary.models.filter((model) => model.price && model.usd > 0).length);
  const rhythm = $derived(rhythmChart(summary.heat));

  const mixLegend: { part: MixPart; value: () => number }[] = [
    { part: "Input", value: () => t.input },
    { part: "Output", value: () => t.output },
    { part: "Cache write", value: () => t.cacheWrite },
    { part: "Cache read", value: () => t.cacheRead },
  ];

  const cursorMissing = $derived(!seen.has("cursor") && (filter === "all" || filter === "cursor"));
  const showReasoning = $derived(t.reasoningShare != null);

  function sentence() {
    if (t.events === 0) return `No responses recorded ${days === 1 ? "today" : `in the ${rangeLabel.toLowerCase()}`}.`;
    const span = days === 1 ? "today" : `on ${t.activeDays} of ${days} days`;
    const cached = t.tokens > 0 ? pct(t.cached / t.tokens) : "—";
    return `${tokens(t.tokens)} tokens across ${count(t.events)} responses ${span}. ${cached} of those tokens were cached context reread on later turns.`;
  }
</script>

<svelte:window bind:innerWidth={width} />

<div class="controls rise" style:--d="0">
  <Segmented label="Time range" options={ranges} value={days} onchange={setDays} />
  <Segmented label="Provider" options={providerOptions} value={filter} onchange={(next) => (filter = next)} />
</div>

<section class="hero rise" style:--d="1" aria-label="Summary">
  <div class="figures">
    <div class="figure-block">
      <span class="eyebrow">Worth at API prices</span>
      <strong class="big gold-text"><Figure value={t.usd} format={usd} /></strong>
      <span class="sub">{rangeLabel.toLowerCase()} · list price × tokens</span>
    </div>
    <div class="figure-block">
      <span class="eyebrow">You paid</span>
      <strong class="big"><Figure value={hasPlans ? t.paidUsd : null} format={usd} /></strong>
      <span class="sub">{hasPlans ? "plan prices spread per day" : "no plans entered"}</span>
    </div>
    <div class="figure-block">
      <span class="eyebrow">Return</span>
      <strong class="big">
        {#if hasPlans && t.paidUsd === 0 && t.usd > 0}
          Free
        {:else}
          <Figure value={returnFigure} format={times} />
        {/if}
      </strong>
      <span class="sub">{returnNote}</span>
    </div>
  </div>
  <p class="sentence">{sentence()}</p>
  {#if t.unpricedTokens > 0 || t.partial > 0 || cursorMissing}
    <ul class="notes">
      {#if t.unpricedTokens > 0}
        <li>{tokens(t.unpricedTokens)} tokens come from models with no public list price. They count as tokens but add $0.</li>
      {/if}
      {#if t.partial > 0}
        <li>{count(t.partial)} Cursor responses arrived without a cache split, so all their input counts as new input.</li>
      {/if}
      {#if cursorMissing}
        <li>No Cursor usage yet. Run <code>npm run install:cursor-hook</code>, restart Cursor, and keep <code>npm run sync</code> running.</li>
      {/if}
    </ul>
  {/if}
</section>

<section class="panel rise" style:--d="2">
  <header>
    <div>
      <h2>{summary.hourly ? "Hour by hour" : "Day by day"}</h2>
      <p>
        {#if metric === "usd"}API-equivalent cost per {summary.hourly ? "hour" : "day"}; the dashed line is what your plans cost per {summary.hourly ? "hour" : "day"}.
        {:else if metric === "tokens"}All tokens, including cached context.
        {:else}Responses: one per model reply recorded by the sync script.{/if}
      </p>
    </div>
    <Segmented label="Chart metric" options={metricOptions} value={metric} onchange={(next) => (metric = next)} />
  </header>
  <div class="chart-frame">
    <Chart definition={timeline} ariaLabel="Usage over time by provider" height={narrow ? 190 : 240} />
    {#if t.events === 0}<p class="chart-empty">Nothing recorded in this window yet.</p>{/if}
  </div>
  <div class="legend">
    {#each summary.providers as provider (provider.provider)}
      <span><i style:background={providerColor[provider.provider]}></i>{providerLabel[provider.provider]}</span>
    {/each}
    {#if metric === "usd" && t.paidUsd > 0}<span><i class="dash" style:border-color={GOLD}></i>Paid</span>{/if}
  </div>
</section>

<div class="pair">
  <section class="panel rise" style:--d="3">
    <header>
      <div>
        <h2>Providers</h2>
        <p>What each subscription would have cost at API prices.</p>
      </div>
    </header>
    <ul class="providers">
      {#each summary.providers as provider (provider.provider)}
        <li class:empty={provider.events === 0}>
          <div class="who">
            <i style:background={providerColor[provider.provider]}></i>
            <div>
              <strong>{providerLabel[provider.provider]}</strong>
              <span>{providerSurface[provider.provider]}</span>
            </div>
          </div>
          <div class="num">
            <strong>{usd(provider.usd)}</strong>
            <span>API value</span>
          </div>
          <div class="num">
            <strong>{provider.hasPlan ? usd(provider.paidUsd) : "—"}</strong>
            <span>paid</span>
          </div>
          <div class="num">
            <strong class:gold-text={provider.leverage != null && provider.leverage >= 1}>
              {provider.leverage != null ? times(provider.leverage) : provider.hasPlan && provider.usd > 0 ? "Free" : "—"}
            </strong>
            <span>return</span>
          </div>
          <p class="facts">
            {#if provider.events === 0}
              Nothing recorded in this window.
            {:else}
              {tokens(provider.tokens)} tokens · {count(provider.events)} responses · {pct(provider.cacheHitRate)} cache hit · {perM(provider.effectivePerM)} per 1M
            {/if}
          </p>
        </li>
      {/each}
    </ul>
  </section>

  <section class="panel rise" style:--d="4">
    <header>
      <div>
        <h2>Tokens</h2>
        <p>Where the tokens go, and where the money goes.</p>
      </div>
    </header>
    {#if t.tokens > 0}
      <Chart definition={mix} ariaLabel="Share of tokens and cost by token type" height={104} />
    {/if}
    <div class="mix-legend">
      {#each mixLegend as entry (entry.part)}
        <span><i style:background={mixColor[entry.part]}></i>{entry.part}<b>{tokens(entry.value())}</b></span>
      {/each}
    </div>
    <dl class="stats">
      <div><dt>New tokens</dt><dd>{tokens(t.fresh)}</dd><small>input + output</small></div>
      <div><dt>Cached context</dt><dd>{tokens(t.cached)}</dd><small>reads + writes</small></div>
      <div><dt>Cache hit rate</dt><dd>{pct(t.cacheHitRate)}</dd><small>of input served from cache</small></div>
      <div><dt>Saved by cache</dt><dd>{usd(t.cacheSavingsUsd)}</dd><small>vs. paying full input price</small></div>
      <div><dt>Output per response</dt><dd>{tokens(t.outputPerResponse)}</dd><small>average tokens written</small></div>
      <div>
        <dt>Reasoning share</dt>
        <dd>{showReasoning ? pct(t.reasoningShare) : "—"}</dd>
        <small>{showReasoning ? "of Codex output" : "only Codex reports it"}</small>
      </div>
    </dl>
  </section>
</div>

<section class="panel rise" style:--d="5">
  <header>
    <div>
      <h2>Models</h2>
      <p>Your own workload priced per model, beside public list prices (USD per 1M tokens).</p>
    </div>
  </header>
  {#if pricedModels > 0}
    <Chart definition={modelChart} ariaLabel="API-equivalent cost by model" height={Math.max(96, pricedModels * 34 + 34)} />
  {/if}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Model</th>
          <th>API value</th>
          <th>Responses</th>
          <th>Tokens</th>
          <th>Cache hit</th>
          <th>Out / resp.</th>
          <th title="List price per 1M tokens: input / output">List in / out</th>
          <th title="Artificial Analysis convention: 3 parts input to 1 part output">Blended 3:1</th>
          <th title="API value divided by every token you processed, cache included">Your $ / 1M</th>
        </tr>
      </thead>
      <tbody>
        {#each summary.models as model (`${model.provider}:${model.model}`)}
          <tr>
            <td>
              <div class="model">
                <i style:background={providerColor[model.provider]}></i>
                <span title={model.model}>{labels.get(`${model.provider}:${model.model}`) ?? model.model}</span>
              </div>
            </td>
            <td class="strong">{model.price ? usd(model.usd) : "no list price"}</td>
            <td>{count(model.events)}</td>
            <td>{tokens(model.tokens)}</td>
            <td>{pct(model.cacheHitRate)}</td>
            <td>{tokens(model.outputPerResponse)}</td>
            <td>{model.price ? `${perM(model.price.input)} / ${perM(model.price.output)}` : "—"}</td>
            <td>{perM(model.blendedPrice)}</td>
            <td>{model.price ? perM(model.effectivePerM) : "—"}</td>
          </tr>
        {:else}
          <tr><td colspan="9" class="muted">No models in this window.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<section class="panel rise" style:--d="6">
  <header>
    <div>
      <h2>Rhythm</h2>
      <p>When you work, by local weekday and hour. Brighter means more responses.</p>
    </div>
  </header>
  <Chart definition={rhythm} ariaLabel="Responses by weekday and hour" height={narrow ? 190 : 220} />
  <dl class="stats six">
    <div><dt>Active days</dt><dd>{t.activeDays}<small class="of"> / {days}</small></dd></div>
    <div><dt>Active hours</dt><dd>{count(t.activeHours)}</dd><small>clock hours with a response</small></div>
    <div><dt>Longest streak</dt><dd>{t.longestStreak} {t.longestStreak === 1 ? "day" : "days"}</dd></div>
    <div>
      <dt>Busiest slot</dt>
      <dd>{summary.peak ? `${WEEKDAYS[summary.peak.weekday]} ${hourLabel(summary.peak.hour)}` : "—"}</dd>
    </div>
    <div><dt>Responses / active day</dt><dd>{count(t.eventsPerActiveDay == null ? null : Math.round(t.eventsPerActiveDay))}</dd></div>
    <div><dt>API value / active day</dt><dd>{usd(t.usdPerActiveDay)}</dd></div>
  </dl>
</section>

<section class="panel rise" style:--d="7" id="plans">
  <header>
    <div>
      <h2>What you pay</h2>
      <p>Enter the real charge. An annual plan is the amount for the year. A free promo is $0 with an end date.</p>
    </div>
  </header>
  <Plans plans={snapshot.plans} {readOnly} onadd={onaddplan} onremove={onremoveplan} />
</section>

<footer class="method rise" style:--d="8">
  <h2>Not in your ledger</h2>
  <p>
    The sync script uploads token counts and one timestamp per response. That is enough for cost, tokens, cache, volume,
    and timing patterns. These <a href="https://artificialanalysis.ai" target="_blank" rel="noreferrer">Artificial Analysis</a>
    measures need data the ledger does not have, so they are left out:
  </p>
  <ul>
    <li><b>Intelligence and benchmark scores.</b> These need graded task results.</li>
    <li><b>Output speed, time to first token, response time.</b> These need when each reply started and finished.</li>
    <li><b>Context window.</b> This is a model specification, not your usage.</li>
    <li><b>claude.ai and chatgpt.com chats, and your account usage meters.</b> They never reach the local files.</li>
  </ul>
  <p class="fine">
    Prices are public API list rates in <code>shared/prices.mjs</code>, checked 2 Oct 2026. Plan costs are spread evenly across
    365 days. “Cache hit rate” is cache reads divided by all input-side tokens.
  </p>
</footer>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0.5rem 0 2.5rem;
  }

  .hero {
    margin-bottom: 3rem;
  }
  .figures {
    display: grid;
    grid-template-columns: 1.35fr 1fr 1fr;
    grid-template-rows: auto auto auto;
    column-gap: 2rem;
    row-gap: 0.45rem;
  }
  .figure-block {
    display: grid;
    grid-row: span 3;
    grid-template-rows: subgrid;
    align-items: end;
    min-width: 0;
  }
  .figure-block .sub {
    align-self: start;
  }
  .big {
    font-family: var(--serif);
    font-weight: 400;
    font-size: clamp(2.1rem, 5.2vw, 3.6rem);
    line-height: 1;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .figure-block:first-child .big {
    font-size: clamp(2.6rem, 7vw, 4.75rem);
  }
  .sub {
    color: var(--faint);
    font-size: 0.8125rem;
  }
  .sentence {
    max-width: 46rem;
    margin: 2rem 0 0;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.6;
  }
  .notes {
    display: grid;
    gap: 0.35rem;
    margin: 1rem 0 0;
    padding: 0;
    list-style: none;
    color: var(--faint);
    font-size: 0.8125rem;
  }
  .notes li::before {
    content: "◦ ";
    color: var(--gold);
  }

  .panel {
    padding: 1.75rem 0 2rem;
    border-top: 1px solid var(--line);
  }
  .panel > header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 3rem;
  }

  .chart-frame {
    position: relative;
  }
  .chart-empty {
    position: absolute;
    inset: 0 0 2rem;
    display: grid;
    place-items: center;
    margin: 0;
    color: var(--faint);
    font-size: 0.875rem;
    pointer-events: none;
  }

  .legend,
  .mix-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.1rem;
    margin-top: 0.75rem;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .legend span,
  .mix-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .legend i,
  .mix-legend i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .legend i.dash {
    width: 14px;
    height: 0;
    border-top: 1.5px dashed;
    border-radius: 0;
  }
  .mix-legend b {
    color: var(--text);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .providers {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .providers li {
    display: grid;
    grid-template-columns: 1.4fr repeat(3, minmax(0, 1fr));
    align-items: center;
    gap: 0.25rem 0.75rem;
    padding: 0.9rem 0;
    border-top: 1px solid var(--line);
    transition: opacity 300ms ease;
  }
  .providers li:first-child {
    border-top: 0;
    padding-top: 0.25rem;
  }
  .providers li.empty {
    opacity: 0.45;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
  }
  .who i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .who div,
  .num {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }
  .who span,
  .num span {
    color: var(--faint);
    font-size: 0.75rem;
  }
  .num {
    text-align: right;
  }
  .num strong {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .facts {
    grid-column: 1 / -1;
    margin: 0.2rem 0 0 1.2rem;
    color: var(--faint);
    font-size: 0.75rem;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.25rem 1rem;
    margin: 1.5rem 0 0;
  }
  .stats div {
    display: grid;
    align-content: start;
    gap: 0.2rem;
    min-width: 0;
  }
  .stats dt {
    color: var(--faint);
    font-size: 0.75rem;
  }
  .stats dd {
    margin: 0;
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }
  .stats small {
    color: var(--faint);
    font-size: 0.6875rem;
  }
  .stats small.of {
    font-size: 0.8rem;
  }
  .stats.six {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .table-wrap {
    margin-top: 1rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 0.7rem 0.6rem;
    border-bottom: 1px solid var(--line);
    text-align: right;
    white-space: nowrap;
  }
  th {
    color: var(--faint);
    font-weight: 400;
    font-size: 0.75rem;
  }
  th:first-child,
  td:first-child {
    position: sticky;
    left: 0;
    padding-left: 0;
    text-align: left;
    background: var(--bg);
  }
  td.strong {
    color: var(--text);
  }
  td {
    color: var(--muted);
  }
  tbody tr {
    transition: background 200ms ease;
  }
  tbody tr:hover td {
    background: var(--well);
  }
  .model {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    color: var(--text);
  }
  .model i {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .method {
    padding: 2rem 0 4rem;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.8125rem;
    line-height: 1.65;
  }
  .method h2 {
    margin-bottom: 0.75rem;
  }
  .method ul {
    margin: 0.75rem 0;
    padding-left: 1.1rem;
  }
  .method b {
    color: var(--text);
    font-weight: 500;
  }
  .method a {
    color: var(--gold);
  }
  .fine {
    color: var(--faint);
  }

  @media (max-width: 900px) {
    .pair {
      grid-template-columns: 1fr;
    }
    .stats.six {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .controls {
      flex-direction: column;
      margin-bottom: 2rem;
    }
    .figures {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto auto auto auto auto;
      column-gap: 1rem;
    }
    .figure-block:first-child {
      grid-column: 1 / -1;
      margin-bottom: 1rem;
    }
    .sentence {
      margin-top: 1.5rem;
      font-size: 0.9375rem;
    }
    .providers li {
      grid-template-columns: 1fr repeat(3, auto);
    }
    .who span {
      display: none;
    }
    .stats,
    .stats.six {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
