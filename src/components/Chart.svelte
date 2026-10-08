<script
  lang="ts"
  generics="TDatum, TXValue extends ChartValue = ChartValue, TYValue extends ChartValue = ChartValue"
>
  // The Svelte adapter in @tanstack/charts only paints static SVG. The
  // renderer-neutral host accepts the optional spring renderer, which also
  // animates bar growth on range changes and the tooltip.
  import type { ChartRendererHost, ChartValue, DomChartDefinition } from "@tanstack/charts";
  import { motion } from "@tanstack/charts/motion";
  import { mountChartRenderer } from "@tanstack/charts/renderer";
  import { onMount } from "svelte";

  type Props = {
    definition: DomChartDefinition<TDatum, TXValue, TYValue>;
    ariaLabel: string;
    height: number;
  };

  let { definition, ariaLabel, height }: Props = $props();
  let container: HTMLDivElement;
  let host: ChartRendererHost<TDatum, TXValue, TYValue> | null = null;
  // Overdamped (damping ratio ≈ 1.2): an underdamped spring overshoots bars
  // that shrink to zero into negative widths.
  const renderer = motion<TDatum, TXValue, TYValue>({
    transition: { type: "spring", stiffness: 140, damping: 28, mass: 1 },
  });

  onMount(() => {
    host = mountChartRenderer(container, { definition, ariaLabel, height, renderer });
    return () => {
      host?.destroy();
      host = null;
    };
  });

  $effect(() => {
    const options = { definition, ariaLabel, height, renderer };
    host?.update(options);
  });
</script>

<div class="chart" bind:this={container} style:height="{height}px"></div>

<style>
  .chart {
    position: relative;
    width: 100%;
  }
</style>
