# Web option (hosted URL): Cloudflare Workers Free evaluation

**Decision for v0.1: NO-GO (not shipped, not announced).** Technically promising, but nothing was deployed, so the
decisive tests (real GitHub display, cache freshness, abuse behaviour) were **not** run. Status: *to verify* in a later
version, on the owner's explicit go-ahead. The GitHub Actions route is the only documented way to use Daily Banner.

Nothing was deployed on any external account for this study, and no URL in the project points to a service.

## What was measured here (local, Node 24)

| Question | Result |
|---|---|
| CPU to draw a banner | about **3 ms** for one SVG (6.5 ms for the dark + light pair), measured as wall time on a developer laptop, including date selection. Free Workers allow **10 ms CPU per request**, so the margin is about 3x, thinner than it looks: a cold start, a cache miss and a slower CPU eat into it. Not measured on Cloudflare itself. |
| Code size | 53 KB of source (17 KB gzip), zero dependency, no native module, no filesystem at run time except the three small pack files. |
| Memory | far below 128 MB (strings of about 16 KB). |
| Output size | 12 to 20 KB per SVG. |

## Limits and costs, from Cloudflare's own pages (read 2026-10-27)

- Free plan: **100,000 requests per day** (reset at midnight UTC), **10 ms CPU per request**, 128 MB memory, 50 subrequests.
- Over the request quota: error 1027; over the CPU time: error 1102 ("Worker exceeded resource limits").
- The pricing page does not say whether a payment method is required for the Free plan: **to confirm when creating the account**.

## Open points (the reasons for no-go)

1. **Quota is shared by every user of the service.** An `<img>` in a popular README is fetched by GitHub's proxy, not
   by each visitor, but a few popular profiles plus crawlers can still reach 100,000 per day; when that happens
   every banner breaks at once. That is a recurring operations risk for the maintainer, which the issue forbids.
2. **CPU margin** (about 3x locally) must be measured on Cloudflare with the Cache API warm and cold.
3. **Freshness through GitHub's image proxy (camo).** GitHub rewrites remote images to `camo.githubusercontent.com` and
   caches them. Public reports give lifetimes from days to a month, depending on the `Cache-Control` the origin sends
   (sources below). A daily banner needs a short `max-age`; whether GitHub honours it today must be tested on a real
   README, which requires a deployed endpoint.
4. **Abuse.** Parameters are user text. Output is escaped and bounded (validated in the engine and tested against
   injection), but a public endpoint also needs rate limiting and a cap on distinct parameter combinations so the
   cache is not bypassed.
5. **Packs and the mascot file** are read from disk by the engine today; a Worker would need them bundled, and a
   custom mascot file could not be supported by URL.
6. **Terms of service** for a free image-rendering service used by third parties: not reviewed.

## If it is ever built (adapter sketch, not code)

The engine already is a pure function `generate(config, { date }) -> SVG`. A Worker would only parse query
parameters into the same validated configuration, call it, and answer with `Content-Type: image/svg+xml`,
`Cache-Control: public, max-age=3600` and a `Cache-Control`-aware cache key on `(parameters, UTC date)`. No database,
no account, no state. A spike would take a day; the unknowns above are operational, not technical.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[camo caching report (blog, 2020)](https://jrtechs.net/open-source/creating-a-dynamic-github-profile),
[camo caching thread (PlantUML forum, 2020)](https://forum.plantuml.net/7163/githubs-aggressive-caching-prevent-diagrams-updated-markdown?show=7169).
