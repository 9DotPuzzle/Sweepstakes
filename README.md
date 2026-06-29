# Office World Cup Sweepstakes — self-updating bracket

A static bracket page that **updates itself**: a scheduled GitHub Action fetches finished
knockout results from a football data API, works out winners and scores, and commits an
updated `data.json`. GitHub Pages serves the page; visitors always see the latest results.
No manual entry.

```
index.html        the page (reads config.json + data.json)
config.json       fixed structure: 32 teams, owners, kick-off times, sweepstake mapping
data.json         auto-generated results (don't hand-edit; the Action overwrites it)
update.mjs        the updater the Action runs (Node 18+, no dependencies)
.github/workflows/update.yml   the schedule + commit step
```

## One-time setup (about 10 minutes)

### 1. Create the repo
Create a **new GitHub repository** (Public is easiest — Pages and Actions are free and
unlimited on public repos) and upload all of these files, keeping the folder layout
(especially `.github/workflows/update.yml`).

### 2. Get a free football-data API key
- Sign up at **https://www.football-data.org/** (free tier).
- Copy your API token.
- Confirm your plan can access the World Cup. The competition code used here is `WC`
  (set in `config.json`). If your key doesn't include it, see "Swapping the data source" below.

### 3. Add the key as a repo secret
Repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name: `FOOTBALL_API_KEY`
- Value: your token

### 4. Allow the Action to commit
Repo → **Settings → Actions → General → Workflow permissions** → select
**Read and write permissions** → Save.

### 5. Turn on GitHub Pages
Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `/ (root)`
→ Save. Your URL will be `https://<you>.github.io/<repo>/`.

### 6. Run it once
Repo → **Actions** tab → **Update bracket** → **Run workflow**. This does the first fetch and
writes `data.json`. Then open your Pages URL.

That's it. From now on it runs automatically at **09:00 and 23:00 BST** every day. Edit the
`cron` lines in `update.yml` to change the times or add more (they're in UTC — `0 8` = 09:00 BST).

## How updating works
- The Action calls the API, keeps only **finished** matches, and matches each one to a bracket
  slot by team name (with aliases in `config.json`), then advances the winner through the rounds.
- It writes `data.json` and commits it **only if something changed**.
- The page fetches `data.json` on load (and on the **Refresh** button), so it always shows the
  latest committed results.

## Things you may need to tweak
- **Team names.** If a finished game doesn't appear, the API probably spells a country
  differently. Open the Action run log — it prints `Unmatched knockout-looking result: X v Y`.
  Add that spelling to the team's `aliases` list in `config.json` and re-run.
- **Penalties.** If a tie went to a shootout and the winner doesn't fill in, the API's
  `score.winner` field may be empty for that match; the log will say so. You can add the
  result by hand to `data.json` as a one-off if needed.
- **Kick-off times** are static (the published fixture schedule, UK/BST). The auto-update fills
  in scores and winners, not the times. Round of 16 onward are the scheduled slots and can shift
  once teams are confirmed.

## Swapping the data source
Only `fetchResults()` in `update.mjs` talks to the API. To use a different provider
(e.g. API-Football), rewrite just that function to return the same array shape:
`{ home, away, hg, ag, winner: 'home'|'away'|null, ph, pa }`. Everything else stays the same.

## Sharing / privacy
The Pages URL is **public** — anyone with the link can view it (and it could be search-indexed).
There's no built-in password. For office-only use, just share the link with colleagues; if you
need access control, host the files behind something that provides it instead of public Pages.
