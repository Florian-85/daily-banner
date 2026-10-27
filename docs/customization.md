# Customization

Everything lives in one file, `daily-banner.json`, next to your README. Only `name` is required.
Mistakes are reported in plain words, for example `"theme" must be one of "dark", "light"`.

## Options

| Option | Default | Meaning |
|---|---|---|
| `name` | **required** | Up to 32 characters. The last word's first letter is the highlighted one (hats and effects attach to it). |
| `highlight` | `"last"` | `"first"` highlights the first word instead. A single word highlights its first letter. |
| `headline` | `["Hello, world!"]` | Up to 8 phrases of 48 characters, typed one after the other. Their order moves by one step every day. |
| `subtitle` | none | One line, 70 characters. |
| `location` | none | A small pill, 24 characters. |
| `lang` | `"en"` | Language of the celebration phrases: `"en"` or `"fr"`. |
| `theme` | `"dark"` | Look of `daily-banner.svg`: `"dark"` or `"light"`. The `-dark` and `-light` files always exist. |
| `mascot` | `"cat"` | `"cat"`, `"stars"`, `"none"`, or `{ "file": "my-mascot.json" }`. |
| `packs` | `["core", "geek-days"]` | Which sets of special days to use (see below). |
| `exclude` | `[]` | Scene ids to switch off, e.g. `["halloween"]`. The day keeps its colourful theme. |
| `days` | `[]` | Your own days: `{ "date": "04-19", "scene": "birthday" }`. Optional `"theme": "normal"` removes the colourful theme. |
| `surprise` | `true` | One surprise colourful day per month (no animation). |
| `timezone` | `"UTC"` | Decides what "today" is, e.g. `"Europe/Paris"`. |
| `alt` | `Animated banner of <name>` | Text alternative embedded in the SVG. |

Limits are checked for you. Text is escaped: `&`, `<`, quotes and emoji are fine. Line breaks are refused.

## Themes

Four palettes: `dark`, `light`, and their colourful `funky-dark`, `funky-light` versions, used automatically on
special days. You choose which of dark or light is the default file; GitHub readers can get both with
`<picture>` (see the README).

## Scenes and packs

| Scene id | Shows | Needs |
|---|---|---|
| `noel` | Santa hat on the highlighted letter, snow on the mascot's head, snowfall | letter |
| `halloween` | glowing orange letter, bats | letter |
| `new-year` | confetti | nothing |
| `birthday` | the letter tips over, a "+1" appears, confetti. Only on your own `days`. | letter |
| `april-fools` | water, a fish, a snorkel from the mascot's mouth | mouth or nose (optional) |
| `pi` | falling digits of pi | nothing |

| Pack | Content |
|---|---|
| `core` | 24-26 Dec, 31 Oct, 1 Jan, 1 Apr |
| `geek-days` | 14 Mar (pi), 25 May, 13 Sep, Ada Lovelace Day (2nd Tuesday of October): colourful theme |
| `holidays-fr` | French public holidays (colourful theme, no scene) |

Preview any scene on any date without waiting:

```bash
node bin/daily-banner.cjs generate --scene halloween --out preview
node bin/daily-banner.cjs scenes     # list scene ids, their tags, and the packs
```

A scene is never drawn with coordinates: it attaches to **anchors** (`name.initial`, `mascot.head-top`,
`mascot.mouth`…). If an anchor does not exist the optional layer is skipped, and if a scene cannot work at all the day
keeps its theme only. See [design-anchors-variants.md](design-anchors-variants.md).

## Your own mascot (constellation file)

Put a JSON file in your repository (same folder as the configuration or below it; absolute paths and `..` are refused):

```json
{
  "points": [[100, 20, 5], [170, 150, 4], [30, 150, 4]],
  "outline": [[0, 1], [1, 2], [2, 0]],
  "stripes": [],
  "anchors": { "head-top": [100, 20], "mouth": [100, 90] }
}
```

`points` are `[x, y, radius]` in a 200 x 200 box (2 to 60 points); `outline` and `stripes` are pairs of point numbers;
`anchors` are optional named points that let scenes attach things (`head-top`, `mouth`, `nose`). Top, bottom, left,
right and center are computed for you.

## Dates and privacy

The generator never writes a date or a scene name in the SVG or the logs (a forced `--scene` is the only exception).
But a `days` entry sits in **your** `daily-banner.json`: in a public repository, that file is public.

## Not in v0.1

Embedded or outlined fonts (the five launch fonts of the design document), pixel-art and SVG-drawing mascots,
pack folders written by users, violence-tagged variants, an asset catalogue, `exclude-tags`. They are decided and
planned, not dropped: see [design-anchors-variants.md](design-anchors-variants.md). Text uses the reader's own fonts
with a fixed width per word, so anchors stay put but letter shapes differ between machines.
