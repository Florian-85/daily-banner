# Design: anchors, variants and community scenes

Status: draft, to settle before extracting the code from the private generator.

## The problem

In the generator this engine comes from, every animation is written for **one** name ("Florian B."), **one** mascot (a
badger drawn with stars) and **one** layout. A hat sits at fixed coordinates above the letter B, a snorkel is drawn from a
fixed point on the badger. As soon as the name, the language or the mascot changes, those coordinates are wrong.

We also want, for one date, **several versions** (Halloween could have five), and eventually **scenes written by other
people**, through pull requests, as long as the way to write one is simple and safe.

So a scene must never contain coordinates. It must say *what* goes *where*, using names the engine resolves for each
configuration.

## Principles

1. **Scenes know names, not positions.** They attach things to **anchors**.
2. **The engine owns the layout.** It measures the text and the mascot, and publishes anchors.
3. **A scene degrades gracefully.** If an anchor does not exist, optional layers are skipped; a scene that cannot work at all is not chosen.
4. **Deterministic and offline.** The same date and the same configuration always give the same picture.
5. **Safe to merge.** A contributed scene is data, validated and sanitized by CI before a human reads it.

## Layout and anchors

The engine builds a small scene graph from the configuration and exposes named anchors, each with a position and a size.

| Group | Anchors |
|---|---|
| Name | `name.initial` (the letter the owner chooses to highlight, e.g. the last-name initial), `name.first-word`, `name.end` (the final punctuation), `name.box` |
| Text | `headline.cursor`, `headline.box`, `subline.box` |
| Mascot | `mascot.center`, `mascot.head-top`, `mascot.eye-left`, `mascot.eye-right`, `mascot.nose` (or `mouth`), `mascot.side-left`, `mascot.side-right`, `mascot.base` |
| Banner | `banner.top`, `banner.bottom`, `banner.left`, `banner.right`, `banner.center`, `banner.water-line` (a level chosen by the scene) |

A mascot **declares its own anchors** in its data (a constellation or an SVG drawing, plus a list of named points). A scene
lists the anchors it `requires`; a mascot that lacks `mascot.nose` simply cannot host a snorkel.

### Text, fonts and why the first version used `textLength`

Visitors render the SVG with **their own fonts**, so the width of a word changes from one machine to another and an
accessory placed "above the B" would drift. The generator therefore forces the width of each word (and of the highlighted
letter on its own) with `textLength`. The engine must keep that guarantee for any name. Two options to decide:

- **System-font mode** (what exists): per-word `textLength` with a per-character width estimate. Works for any script, but the estimate is approximate and glyphs get slightly stretched when it is off.
- **Outline mode** (to evaluate): text converted to paths at build time from an open-licensed font subset (Latin and accents). Exact metrics, identical everywhere, exact anchors; not selectable (an `aria-label` and a `<title>` carry the text). CJK, Arabic and similar scripts would stay in system-font mode.

The name also needs **auto-fit** (shrink to the available width down to a minimum, then wrap or truncate) and a rule for
right-to-left languages.

## Scenes, variants and packs

```
packs/<pack-id>/
  pack.json                      id, name, author, license, languages, engine version, description
  scenes/<scene-id>/
    scene.json                   id, name, date rule, default theme (normal | funky), selection policy
    variants/<variant-id>.json   one version of the scene (layers)
  assets/<asset-id>.svg          reusable fragments with their own attachment points
```

**Date rules**: fixed day (`10-31`), n-th weekday (`10/tuesday/2`), relative to Easter (`+39`), a range of days, a table per
year (for lunisolar calendars: dates cannot be computed with a formula), and "one surprise day a month".

**A variant** is a list of layers, each of a known type:

| Layer | Meaning |
|---|---|
| `particles` | snow, confetti, bats, stars, rain, digits: a kind, a count, an area |
| `attach` | put an asset on an anchor (a hat on `name.initial`, a snorkel from `mascot.nose` up to the water line) |
| `recolor` | change the colour of a target (a letter, the mascot) |
| `drips`, `trail`, `glow` | effects generated from the box of a target |
| `motion` | move or transform a target on a loop (fall, wobble, march to the centre, swing) |
| `overlay` | water level, fog, a tint over the banner |
| `text` | add phrases before the usual ones, or replace them (per language) |
| `svg` | free drawing in a restricted dialect, positioned relative to an anchor (see Safety) |

Example (the "bloody initial" Halloween variant of the owner's pack):

```json
{
  "id": "bloody-initial",
  "scene": "halloween",
  "name": "Bloody initial",
  "author": "florian-85",
  "tags": ["violence"],
  "theme": "funky",
  "requires": ["name.initial"],
  "text": { "mode": "prefix", "phrases": { "en": ["Happy Halloween!"], "fr": ["Joyeux Halloween !"] } },
  "layers": [
    { "type": "recolor", "target": "name.initial", "fill": "#C1121F" },
    { "type": "drips",   "target": "name.initial", "edge": "bottom", "count": 3 },
    { "type": "attach",  "asset": "knife", "target": "name.initial", "at": "top-center", "angle": -35, "scale": 1.1 },
    { "type": "particles", "kind": "bats", "count": 3, "color": "#0B0B10" }
  ]
}
```

### Several versions of one date

A scene lists its variants. The **selection policy** is part of the configuration:

- `rotate`: the variant changes every year (year modulo the number of variants);
- `by-day`: for multi-day events (Christmas Eve, Christmas, Boxing Day), a different one each day;
- `fixed:<id>`: always the same;
- `weighted`: favourite variants appear more often.

All of them are deterministic: no stored state.

### Tags, so every owner can say no

Each variant carries tags (`violence`, `religious`, `humor`, `calm`, `scary`, `brand-reference`…). The configuration holds
`exclude-tags`. Someone who does not want blood on Halloween excludes `violence` and gets the other four versions.
Religious observances are always tagged and reviewed by a maintainer.

## Contributions by pull request

A contributor adds `variants/<id>.json` (and, if needed, an asset). CI then:

1. **Validates** the files against the JSON schema (unknown layer, missing anchor, bad date rule: a clear message).
2. **Sanitizes** the `svg` layers (allowlist below).
3. **Renders previews** automatically on a fixed set of test configurations: the default mascot with a short name, a very long name, a non-Latin name, another mascot with different anchors; the four themes and two languages. The previews appear in the pull request.
4. **Checks budgets**: size of the variant, number of animated elements, duration of the loop, nothing outside the viewBox.
5. **Checks accessibility rules**: no element flashes more than three times per second (see below), a text alternative exists, and a static fallback is rendered for people who prefer reduced motion.
6. Publishes a **gallery** (GitHub Pages) of every pack and variant, with a "preview this date" picker: it documents the project and invites contributions.

A short "write your first variant in ten minutes" guide and a `CONTRIBUTING.md` are part of the work, not an afterthought.

## Safety

An SVG from an unknown author is code. The `svg` layer accepts **only** a fixed allowlist: shapes, paths, groups, gradients,
`animate`, `animateTransform`, `animateMotion`, `set`. It refuses scripts, event attributes, `foreignObject`, external
references (`href` to anything but an internal id), `style` with URLs, `image`, filters beyond blur, and any size or
element count above the budget. Anything else fails CI.

## Accessibility

- **Flashing**: WCAG asks for no more than three flashes per second. A fast brightness flicker (a lightsaber spark at about 6 Hz in the first version) must be slowed or removed. CI measures the shortest opacity or colour loop.
- **Reduced motion**: render a static fallback and, where the viewer's browser allows it, honour `prefers-reduced-motion`.
- **Text alternative**: the banner always carries a title and a description.

## Open questions

1. Outline mode or system-font mode for Latin text (exactness against flexibility)?
2. Which mascot types in version 1: constellation only, or any SVG drawing with named anchors?
3. How strict is "identical output" when migrating the first six scenes? A pure code move must be byte-identical; generalising the layout will move some pixels. Proposal: byte-identical for the move, a visual tolerance afterwards.
4. Does the highlighted letter always exist? Names with a single word: fall back to the first letter?
5. Who reviews religious and cultural packs, and what is the guideline?

## Suggested order

1. **Layout model and anchors** replace the hard-coded coordinates (no new feature).
2. **Layer types and assets**: the six current scenes rewritten as variants of the owner's private pack, same output.
3. **Schema, sanitizer, CI previews, budgets.**
4. **Selection policy and tags**; a few extra variants (Halloween first) to prove it.
5. **Gallery and contributing guide**, then open the repository.
