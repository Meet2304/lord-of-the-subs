<script lang="ts" generics="T extends string | number">
  type Props = {
    options: readonly { value: T; label: string; color?: string }[];
    value: T;
    label: string;
    onchange: (value: T) => void;
  };

  let { options, value, label, onchange }: Props = $props();
  const index = $derived(Math.max(0, options.findIndex((option) => option.value === value)));
</script>

<div class="segmented" role="radiogroup" aria-label={label} style:--count={options.length} style:--index={index}>
  <span class="thumb" aria-hidden="true"></span>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={option.value === value}
      class:on={option.value === value}
      onclick={() => onchange(option.value)}
    >
      {#if option.color}<i style:background={option.color}></i>{/if}
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--count), minmax(0, 1fr));
    padding: 3px;
    border-radius: 999px;
    background: var(--well);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .thumb {
    position: absolute;
    inset: 3px auto 3px 3px;
    width: calc((100% - 6px) / var(--count));
    border-radius: 999px;
    background: var(--raised);
    box-shadow: inset 0 0 0 1px var(--line-strong), 0 6px 18px -10px rgba(0, 0, 0, 0.9);
    transform: translateX(calc(100% * var(--index)));
    transition: transform 420ms var(--ease-majestic);
  }
  button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.42rem 0.8rem;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.8125rem;
    letter-spacing: 0.01em;
    white-space: nowrap;
    cursor: pointer;
    transition: color 240ms ease;
  }
  button:hover,
  button.on {
    color: var(--text);
  }
  button:focus-visible {
    outline: 1px solid var(--gold);
    outline-offset: -2px;
    border-radius: 999px;
  }
  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
</style>
