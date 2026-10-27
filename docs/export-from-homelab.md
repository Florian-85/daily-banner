# Export from the Homelab generator

> **Update for v0.1.** The banner engine no longer contains the name, the badger, the golden snitch, the sabres or any
> owner constant: it is configured by `daily-banner.json` (see the README). The profile-specific code (cards, collection,
> publication, `tools/homelab-report.sh`, the sample profile configuration) moved unchanged to `legacy/profile/`. The
> tables below describe the original export and are kept as history.

This repository starts from the profile generator that runs in the owner's private Homelab repository. From now on,
**all development happens here**. The Homelab copy is **frozen**: it keeps running so we can see whether the first real
tests hold up over time, and nothing is changed there except one log line (see below).

## Origin

- Source: `Florian-85/homelab` (private), folder `services/github-profile/`.
- Exported on **2026-10-20** from the branch of PR #73 (`44ef4a0`), which is `main` (`8eb95a2`, the generator merged in PR #69)
  plus a small accessibility fix (the May 4th spark flashed 6 times per second; it now pulses slowly, and a test
  forbids any looping brightness animation faster than 0.34 s). That fix is **not** merged in Homelab.
- Exported as a **single fresh commit**, not with the Git history. The history of that folder contains personal
  configuration (private dates, private repository names), and a Git history cannot be cleaned afterwards without
  rewriting it. This repository will become public one day, so nothing personal enters it at all.

## What is here

| Path | Content |
|---|---|
| `src/lib/` | the engine pieces: SVG helpers, palettes, banner and scenes, calendar, cards, stack, README, collection, publication |
| `src/build-profile.cjs`, `src/run-profile.cjs` | command-line entry points (offline build; collect + publish) |
| `src/merge-stats.cjs` | account statistics collection (GraphQL), reused by the collection |
| `src/*.test.cjs`, `src/test-fakes.cjs` | 69 offline tests |
| `src/config/` | a **neutral sample configuration** (invented project names, figures and dates) |
| `tools/homelab-report.sh` | shows how the nightly Homelab run is doing, without touching it |
| `.github/workflows/tests.yml` | runs the tests and builds the sample on every push |

```bash
npm test                      # 69 tests, offline, under a second
npm run build:sample          # writes the sample banner and cards into ./out
```

## What was left out, and why

| Left out | Reason |
|---|---|
| The real configuration (`profile`, `projects`, `snapshot`, `stack`, `learning`, `calendar.private`) | personal: texts, private repository names, real figures, account names, **private dates** |
| `Dockerfile`, `VPS-RUNNER.md`, the n8n workflow and its test | specific to the Homelab operations |
| `publish.cjs` and its test (the previous two-card job) | legacy, replaced by the full publication |
| The GitHub workflow that runs the nightly job | stays in Homelab; a test workflow lives here instead |

The sample configuration keeps the structure and the generic parts (holidays, geek days, detection rules, scene
phrases). The private calendar here contains **three invented dates**. Real personal dates must never be committed in this repository.

## Things still tied to the original (first cleanup)

These are known and expected; they are the first work items of the layout model (issue #3):

1. **The name "Florian B." is written in the banner code** (`src/lib/banner.cjs`), not read from the configuration. So are the highlighted letter, the typing area and the coordinates of every accessory.
2. **Owner constants**: the profile repository (`Florian-85/Florian-85`) and the organisation (`thekingadn`) appear as defaults in `run-profile.cjs`, `merge-stats.cjs` and `publish-tree.cjs`. They are public names, not secrets, but must become configuration.
3. **The project card special-cases a project id (`homelab`)** to show "updates" instead of commits and no code size.
4. **Brand references** in scenes and comments: the golden ball and the badger constellation (house colours), and the May 4th sabres (Star Wars). These belong to a private pack, not to public ones.
5. **The mascot constellation** (`src/config/mascot.json`) is the sample mascot, but accessories are positioned for it by hand.
6. **The config directory is fixed** (`src/config`): it must become a command-line option.

## Observing the Homelab copy

The Homelab job publishes to the owner's real profile every night. To see how it goes without touching anything:

```bash
tools/homelab-report.sh          # last 7 runs
tools/homelab-report.sh 15       # last 15 runs
```

It prints, for each run, the status and the key log lines. When the Homelab package prints its structured
`PROFILE_REPORT` line (the only change allowed there), the report shows it as well: date, whether a special scene ran,
themes, files changed, warnings, stale sources, technologies added or unknown.

## Rules for this repository

- **Never commit personal data**: no real private dates, no private repository names, no account names, no tokens.
- Public packs contain **no trademarked names or characters**.
- A change that moves code without changing the output must produce **byte-identical** files for the sample.
- Tests stay offline and run in a few seconds.
