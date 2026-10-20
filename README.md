# daily-banner

> An animated profile banner that changes with the day: a typed headline, a mascot drawn with stars, and special scenes on the dates you choose.

**Status: private incubation.** The code starts from the generator that builds my own GitHub profile (see [the export notes](docs/export-from-homelab.md)). It still renders one hard-coded name and mascot: making them configurable is the first work item. Nothing here is published yet.

```bash
npm test              # offline tests
npm run build:sample  # writes the sample banner and cards into ./out
```

## What it is

- A small engine that turns a **configuration, a calendar and a mascot** into an animated SVG banner, one picture per day.
- **Scenes** (snow, confetti, water, light blades, a hat on your initial…) triggered by dates: fixed days, "second Tuesday of October", days relative to Easter, one surprise day a month.
- **Packs** of scenes you can pick from (planned): holidays by country, observances, geek days, or your own.
- Four themes (dark, light, funky dark, funky light), several languages, and a **mascot you can swap** (a neutral star constellation by default).

## Principles

- **Zero dependency**, runs offline: the same date always produces the same picture.
- Plain **SVG with SMIL animations**, which GitHub renders inside a README image.
- Personal dates stay in your own private configuration and are never written in the output or the logs.
- Public packs use no trademarked names or characters.

## Documents

- [Design: anchors, variants and community scenes](docs/design-anchors-variants.md)
- [Export from the Homelab generator](docs/export-from-homelab.md): what was imported, what was left out, what is still tied to the original

## Roadmap

See the issues. The first one defines the pack format, declarative scenes and the clean separation from my private homelab.

## License

To be chosen before the first public release.
