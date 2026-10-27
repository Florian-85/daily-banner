"use strict";
// README in each language. Images are served through <picture> so GitHub picks dark or light.

const IMAGE_NAMES = ["banner", "stack", "journey", "learning", "streak", "stats", "languages"];

function picture(lang, name, alt, version, width = "100%") {
  const query = version ? `?v=${version}` : "";
  const src = mode => `./assets/${lang}/${mode}/${name}.svg${query}`;
  return `<picture>\n    <source media="(prefers-color-scheme: dark)" srcset="${src("dark")}">\n` +
    `    <source media="(prefers-color-scheme: light)" srcset="${src("light")}">\n` +
    `    <img src="${src("dark")}" alt="${alt}" width="${width}">\n  </picture>`;
}

const escapeAttribute = value => String(value).replace(/"/g, "&quot;");

function renderReadme({ lang, i18n, projects, discussionsUrl, version }) {
  const copy = i18n.readme;
  const cards = projects.filter(project => project.shown)
    .map(project => picture(lang, `card-${project.id}`, escapeAttribute(project.name), version, "49%")).join("\n  ");
  const nav = copy.nav.map((label, i) => `<a href="#${copy.anchors[i]}">${label}</a>`).join(" · ");
  const now = copy.nowItems.map(item => `- ${item}`).join("\n");
  const heading = i => copy.headings[i];
  return `<p align="right"><a href="./${copy.otherFile}">${copy.other}</a></p>

<p align="center">
  ${picture(lang, "banner", escapeAttribute(copy.altBanner), version)}
</p>

<p align="center"><em>${copy.tagline}</em></p>

<p align="center">
  ${nav}
</p>

${copy.intro}

**${copy.now}**
${now}

## ${heading(0)}

<p align="center">
  ${cards}
</p>

<sub>${copy.legend}</sub>

## ${heading(1)}

<p align="center">${picture(lang, "stack", escapeAttribute(i18n.stackRows.languages + ", " + i18n.stackRows.frameworks + ", " + i18n.stackRows.infra), version)}</p>

## ${heading(2)}

<p align="center">${picture(lang, "journey", escapeAttribute(heading(2)), version)}</p>

## ${heading(3)}

<p align="center">${picture(lang, "learning", escapeAttribute(i18n.learning.title), version)}</p>

## ${heading(4)}

<p align="center">${picture(lang, "streak", escapeAttribute(heading(4)), version)}</p>
<p align="center">
  ${picture(lang, "stats", "GitHub stats", version, "49%")}
  ${picture(lang, "languages", "Languages", version, "49%")}
</p>

## ${heading(5)}

<p align="center">
  <a href="${discussionsUrl}"><b>${copy.contact}</b></a>
</p>

<!-- LinkedIn later: [LinkedIn](https://www.linkedin.com/in/...) -->
<!-- Email: TBD -->
`;
}

module.exports = { renderReadme, IMAGE_NAMES };
