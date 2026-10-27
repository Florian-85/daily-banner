# Daily Banner

An animated banner for your GitHub profile README. It types your headline, a little cat watches, and on special days
(Christmas, Halloween, Pi Day…) the scene changes by itself. No server, no token, no dependency: a GitHub Action draws
one SVG per day in **your** repository.

<p align="center">
  <img src="docs/img/default-dark.svg" alt="Daily Banner, dark theme" width="100%">
</p>
<p align="center">
  <img src="docs/img/christmas-dark.svg" alt="Christmas scene" width="49%">
  <img src="docs/img/halloween-dark.svg" alt="Halloween scene" width="49%">
  <img src="docs/img/april-fools-dark.svg" alt="April Fools scene" width="49%">
  <img src="docs/img/default-light.svg" alt="Light theme" width="49%">
</p>

> **Status: v0.1, pre-release.** Works end to end, limited on purpose (see [Limits](#limits)). Not yet published.

## ⚡ Quick setup

You need a GitHub **profile repository** (a public repository named exactly like your username, with a `README.md`).

### 1. Add your settings

Create `daily-banner.json` at the root of that repository:

```json
{
  "name": "Sam Rivera",
  "headline": ["Developer", "Open source fan", "Cat person"],
  "subtitle": "I build things and write about them.",
  "location": "Somewhere · Earth",
  "theme": "dark"
}
```

Only `name` is required. All options: [docs/customization.md](docs/customization.md).

### 2. Add the workflow

Create `.github/workflows/daily-banner.yml` with exactly this (also in [examples/daily-banner-workflow.yml](examples/daily-banner-workflow.yml)):

```yaml
name: Daily Banner

on:
  workflow_dispatch: # lets you run it by hand the first time
  schedule:
    - cron: "5 0 * * *" # then every day at 00:05 UTC

permissions:
  contents: write # the only permission needed: the workflow commits the SVG files

concurrency:
  group: daily-banner
  cancel-in-progress: true

jobs:
  banner:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v6
      - uses: Florian-85/daily-banner@v0.1.0
        with:
          config: daily-banner.json
          output-dir: assets
```

### 3. Run it once

On GitHub: **Actions → Daily Banner → Run workflow**. After about a minute the file `assets/daily-banner.svg`
exists in your repository. **The image does not exist before this first run.**

### 4. Add one tag to your README

```html
<img src="./assets/daily-banner.svg" alt="Animated banner of Sam Rivera" width="100%">
```

That is all. The workflow now runs every day and commits a new picture only when it changed.

### Light and dark mode (optional)

To show the light banner to readers using GitHub's light theme, and the dark one otherwise:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/daily-banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/daily-banner-light.svg">
  <img alt="Animated banner of Sam Rivera" src="./assets/daily-banner.svg" width="100%">
</picture>
```

## Options (short)

| Option | Default | Example |
|---|---|---|
| `name` | required | `"Sam Rivera"` |
| `headline` | `["Hello, world!"]` | `["Developer", "Writer"]` |
| `subtitle`, `location` | none | `"I build things."`, `"Paris"` |
| `theme` | `"dark"` | `"light"` |
| `lang` | `"en"` | `"fr"` |
| `mascot` | `"cat"` | `"stars"`, `"none"` |
| `timezone` | `"UTC"` | `"Europe/Paris"` |
| `exclude` | `[]` | `["halloween"]` |
| `days` | `[]` | `[{ "date": "04-19", "scene": "birthday" }]` |

Themes, scenes, packs, your own mascot: [docs/customization.md](docs/customization.md).
Action inputs: `config`, `output-dir`, `date`, `commit` (set `"false"` to only generate), `commit-message`.

## Preview on your computer

Requires Node 20 or newer, no install.

```bash
node bin/daily-banner.cjs init                                   # writes daily-banner.json
node bin/daily-banner.cjs generate --out assets --scene noel     # preview any scene
```

The same configuration and date always produce the same bytes.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The image is broken (no picture) | The workflow has not run yet, or `output-dir` differs from the path in your `<img>`. Run it from the Actions tab and check that `assets/daily-banner.svg` exists. |
| The run fails with `Permission to … denied` (403) | Add `permissions: contents: write` to the workflow, and check *Settings → Actions → General → Workflow permissions* does not forbid it. |
| The run fails with `"…" must be one of …`, `Unknown option` or `not valid JSON` | Your `daily-banner.json` has a typo; the message names the field. Check commas and quotes. |
| `Configuration file not found` | `config` is relative to the repository root, and `actions/checkout` must run first. |
| The banner does not change from one day to the next | Browsers and GitHub cache images for a while: refresh, or wait. On a forked or inactive repository, GitHub **disables scheduled workflows after 60 days without repository activity**: re-enable it in the Actions tab. Each daily commit counts as activity, but verify this on your own repository. |
| The date is off by one | "Today" is computed in UTC; set `"timezone": "Europe/Paris"` (or yours). |
| The name is refused as too long or too wide | 32 characters at most; wide letters (W, M) use more room. |

## Limits

- Text uses the **viewer's fonts**, each word at a fixed width. Letter shapes differ per machine; positions do not. The five launch fonts (outlined or embedded) are planned, not in v0.1.
- Scenes: Christmas, Halloween, New Year, April Fools, Pi Day, and a birthday scene for your own dates. One cat and a star constellation, plus your own constellation file.
- English and French celebration phrases. No right-to-left layout.
- SMIL animations cannot be paused by "reduce motion" settings. Nothing flashes more than 3 times per second (tested).
- No hosted URL mode: the evaluation concluded **no-go for v0.1** ([docs/web-option-cloudflare.md](docs/web-option-cloudflare.md)).
- Not verified yet: display on a real public GitHub README after a first scheduled run (see [the checklist](docs/publication-checklist.md)).

## More

- [Customization](docs/customization.md) · [Design: anchors, variants, fonts, assets](docs/design-anchors-variants.md) · [Web option study](docs/web-option-cloudflare.md) · [Publication checklist](docs/publication-checklist.md)
- [Origin of the code](docs/export-from-homelab.md) · [Credits](CREDITS.md)
- Tests: `npm test` (offline, no dependency). The previous profile generator is kept under [legacy/](legacy/) for reference only.

## License

[MIT](LICENSE). The cat and every drawing are original work released under the same license.
