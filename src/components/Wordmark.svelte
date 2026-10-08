<div class="wordmark">
  <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
    <defs>
      <linearGradient id="ring-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f3dca4" />
        <stop offset="0.55" stop-color="#d9b46a" />
        <stop offset="1" stop-color="#8f6f33" />
      </linearGradient>
    </defs>
    <circle class="ring" cx="16" cy="16" r="11" fill="none" stroke="url(#ring-gold)" stroke-width="3.2" />
  </svg>
  <span>Lord of the Subs</span>
</div>

<style>
  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-family: var(--serif);
    font-size: 1.05rem;
    letter-spacing: 0.02em;
    color: var(--text);
  }
  .ring {
    stroke-dasharray: 70;
    stroke-dashoffset: 70;
    transform: rotate(-90deg);
    transform-origin: center;
    animation: draw 1.6s var(--ease-majestic) 0.1s forwards;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring {
      animation: none;
      stroke-dashoffset: 0;
    }
  }
</style>
