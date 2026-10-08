<script lang="ts">
  import { supabase } from "../lib/supabase";

  let mode = $state<"sign-in" | "sign-up">("sign-in");
  let email = $state("");
  let password = $state("");
  let error = $state("");
  let note = $state("");
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = "";
    note = "";
    busy = true;
    try {
      if (mode === "sign-up") {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!data.session) {
          note = "Confirm the email, then sign in. If no email arrives, turn off Confirm email in Supabase Auth settings and sign up again.";
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Sign-in failed";
    } finally {
      busy = false;
    }
  }
</script>

<form class="sign-in rise" onsubmit={submit}>
  <h1>{mode === "sign-in" ? "Sign in to see your usage" : "Create the account the sync script uses"}</h1>
  <label>
    <span>Email</span>
    <input type="email" bind:value={email} autocomplete="username" required />
  </label>
  <label>
    <span>Password</span>
    <input
      type="password"
      bind:value={password}
      autocomplete={mode === "sign-in" ? "current-password" : "new-password"}
      minlength="6"
      required
    />
  </label>
  {#if error}<p class="error">{error}</p>{/if}
  {#if note}<p class="note">{note}</p>{/if}
  <button class="primary" type="submit" disabled={busy}>{busy ? "…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
  <button class="link" type="button" onclick={() => (mode = mode === "sign-in" ? "sign-up" : "sign-in")}>
    {mode === "sign-in" ? "No account yet? Create one" : "Have an account? Sign in"}
  </button>
</form>

<style>
  .sign-in {
    display: grid;
    gap: 1rem;
    width: min(100%, 22rem);
    margin: 14vh auto 0;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-family: var(--serif);
    font-weight: 400;
    font-size: 1.5rem;
    line-height: 1.25;
  }
  label {
    display: grid;
    gap: 0.4rem;
  }
  label span {
    color: var(--muted);
    font-size: 0.8125rem;
  }
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 0.8125rem;
  }
</style>
