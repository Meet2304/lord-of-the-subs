# Lord of the Subs

A private page for the subscriptions you already pay for: Claude, ChatGPT, and Cursor. A small script on your computer reads the usage those tools already save locally and uploads it to your Supabase project. The website only reads that database, so the page still opens when the computer is asleep. New usage waits until the computer is on again.

The Supabase project is already created:

- Name: `lord-of-the-subs`
- URL: `https://lskthkcuiabrrmaxvccy.supabase.co`
- Region: `us-east-1`
- Cost: $0 / month

Your other Supabase projects were left untouched.

## When you are back at the laptop

From this repository:

```bash
npm install
cp .env.example .env
cp sync/.env.example sync/.env
npm run dev
```

`npm install` has to finish before `npm run dev`. On Windows, a folder name with a space (such as `Projects_Ad Astra`) keeps npm from finding the `vite` command. The scripts call `node ./node_modules/vite/bin/vite.js` directly so that path still works. If this copy of the repo still has the old `"dev": "vite"` script, run `node .\node_modules\vite\bin\vite.js` after `npm install`.

The dashboard reads one database function, `usage_buckets`, added in `supabase/migrations/20261008060000_usage_buckets.sql`. If the page says that function is missing, paste that file into the Supabase SQL editor once and reload:

https://supabase.com/dashboard/project/lskthkcuiabrrmaxvccy/sql/new

To look at the page with made-up numbers first, open the dev server URL with `?demo` (or `?demo=empty`). Demo mode exists only under `npm run dev`; a production build cannot show it.

Open the printed local URL. Create an account. Use a password you can keep in `sync/.env`.

If signup asks you to confirm an email and nothing arrives, open the project’s Auth settings and turn off **Confirm email**, then create the account again:

https://supabase.com/dashboard/project/lskthkcuiabrrmaxvccy/auth/providers

Put the same email and password in `sync/.env`. Then, in a second terminal, from this same folder:

```bash
npm run sync
```

Leave that process running while you work. It checks for new Claude Code and Codex transcripts every 20 seconds. The first run uploads the history already on the machine. Closing the terminal stops new uploads. Rows already in Supabase stay there.

On the phone, use the same Wi-Fi and run:

```bash
npm run dev -- --host
```

Open the Network URL Vite prints. That is the whole client. Nothing else has to be installed on the phone.

## Cursor

Claude Code and Codex need no extra install beyond the CLIs you already log into. Cursor does not write the same transcript, so install one local hook:

```bash
npm run install:cursor-hook
```

Restart Cursor. After each agent turn, the hook appends token counts on your machine and the sync process uploads them. The hook does not send the prompt or the reply.

## What shows up

| Where you worked | What the script can see |
| --- | --- |
| Claude Code | Token counts after each response, from `~/.claude/projects` |
| Codex | Token counts after each turn, from `~/.codex/sessions` |
| Cursor agent, after the hook | That turn’s tokens, from a local spool |
| ChatGPT or Claude in the browser | Nothing. Those sites do not write these files |

The page opens straight on the dashboard (or on sign-in, if you are signed out). It loads 90 days of hourly totals once and keeps a copy in the browser, so it paints immediately on the next visit and switching range or provider does not wait on the network. It shows:

- Cost: what the tokens would cost at API list prices, what you paid, and the ratio between them.
- Tokens: new input, output, cache writes, and cache reads, with each one's share of tokens and of cost, cache hit rate, and money saved by caching.
- Models: API value, responses, tokens, cache hit, output per response, list input and output price, the 3:1 blended price Artificial Analysis uses, and your effective price per 1M tokens.
- Time: daily or hourly charts, a weekday by hour heatmap, active days and hours, streaks, and the busiest slot.

Speed, latency, and benchmark scores are not shown. The ledger stores one timestamp per response, not when each reply started and finished.

The dollar figure is the public API list price for models in `shared/prices.mjs`. A model with no rate still shows its tokens, and those tokens are left out of the money total. Subscription amounts are whatever you type into the page. A free stretch is `$0` with an end date.

The page does not match the usage percentage on your Claude, ChatGPT, or Cursor account. Those meters include website and phone chats and use each company's own plan accounting. This page prices local CLI transcripts only. It lists newly generated tokens separately from cached context that later turns reread.

## Phone while the laptop is off

The database already has every row the script uploaded. This repository does not deploy the website anywhere, so the chart page runs where you start Vite. To open that same page from a phone while the laptop is off, build it and host the `dist` folder:

```bash
npm run build
```

The publishable key in `.env` is meant for the browser. Row security only lets a signed-in user read and write their own rows. Do not put a service-role key in either env file.
