<script lang="ts">
  import { cubicOut } from "svelte/easing";
  import { Tween } from "svelte/motion";

  type Props = {
    value: number | null;
    format: (value: number | null) => string;
  };

  let { value, format }: Props = $props();

  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tween = new Tween(0, { duration: reduced ? 0 : 750, easing: cubicOut });

  $effect(() => {
    if (value != null && Number.isFinite(value)) void tween.set(value);
  });
</script>

<span class="figure">{value == null || !Number.isFinite(value) ? format(null) : format(tween.current)}</span>

<style>
  .figure {
    font-variant-numeric: tabular-nums;
  }
</style>
