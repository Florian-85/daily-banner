"use strict";
// Project cards, stack, journey, streak, self-learning, statistics and languages.

const { FONT, NS, esc, num, star, pill } = require("./svg.cjs");

const DAY_MS = 86400000;

const pick = (pair, count) => (count === 1 ? pair[0] : pair[1]);
const groupDigits = (value, separator) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
const formatNumber = (value, lang) => groupDigits(value, lang === "fr" ? " " : ",");

function sizeLevel(bytes) {
  if (bytes < 200000) return 1;
  if (bytes < 500000) return 2;
  if (bytes < 1000000) return 3;
  if (bytes < 2000000) return 4;
  return 5;
}

function duration(data, labels) {
  const days = Math.max(7, (Date.parse(data.pushed) - Date.parse(data.created)) / DAY_MS);
  const weeks = Math.round(days / 7);
  if (weeks < 13) return `${weeks} ${pick(labels.weeks, weeks)}`;
  if (days < 730) {
    const months = Math.round(days / 30.4);
    return `${months} ${pick(labels.months, months)}`;
  }
  const years = Math.round(days / 365.25);
  return `${years} ${pick(labels.years, years)}`;
}

function projectCard(T, lang, i18n, statuses, project, data) {
  const labels = i18n.card;
  const status = statuses[project.status];
  const statusText = status[lang];
  const hot = status.hot;
  const isPublic = project.status === "public";
  const height = 210;
  const out = [
    `<svg width="440" height="${height}" viewBox="0 0 440 ${height}" ${NS} font-family="${FONT}" role="img" aria-label="${esc(project.name)}">`,
    `<rect x="0.5" y="0.5" width="439" height="${height - 1}" rx="10" fill="${T.bg}" stroke="${T.border}"/>`,
    `<rect x="0.5" y="0.5" width="439" height="4" rx="2" fill="${hot ? T.accent : T.border}"/>`,
    star(31, 33, 9, isPublic ? T.accent : "none", hot ? T.accent : T.muted, 1.5),
    `<text x="52" y="40" font-size="19" font-weight="600" fill="${T.accent}">${esc(project.name)}</text>`,
  ];
  const badge = pill(T, 0, 0, statusText, { size: 11, fill: hot ? T.hot : undefined, stroke: hot ? T.accent : undefined, color: hot ? T.accent : undefined });
  out.push(`<g transform="translate(${440 - badge.width - 18},22)">${badge.svg}</g>`);
  project.desc[lang].forEach((line, i) => out.push(`<text x="22" y="${78 + i * 21}" font-size="14" fill="${T.fg}">${esc(line)}</text>`));
  let x = 22;
  for (const tag of project.tags) {
    const tagPill = pill(T, x, 116, tag, { size: 12 });
    out.push(tagPill.svg);
    x += tagPill.width + 8;
  }
  out.push(`<line x1="22" y1="154" x2="418" y2="154" stroke="${T.border}"/>`);
  const first = `${duration(data, labels)} ${labels.activity} · ${data.commits} ${project.id === "homelab" ? labels.updates : labels.commits}`;
  out.push(`<text x="22" y="175" font-size="12" fill="${T.muted}">${esc(first)}</text>`);
  const parts = [];
  if (data.closed) parts.push(`${data.closed} ${pick(labels.issueClosed, data.closed)}`);
  if (project.id !== "homelab" && data.bytes > 0) {
    const lines = Math.round(data.bytes / 40 / 1000);
    parts.push(lines >= 1 ? `≈ ${lines} k ${labels.lines}` : `< 1 k ${labels.lines}`);
  }
  if (parts.length) out.push(`<text x="22" y="194" font-size="12" fill="${T.muted}">${esc(parts.join(" · "))}</text>`);
  const level = sizeLevel(data.bytes);
  for (let i = 0; i < 5; i++) out.push(`<rect x="${338 + i * 16}" y="167" width="12" height="10" rx="2" fill="${i < level ? T.accent : T.border}"/>`);
  out.push("</svg>");
  return out.join("\n");
}

const STACK_LIMIT = 880;
const STACK_LABEL_WIDTH = 196;

function stackCard(T, i18n, stack) {
  const names = i18n.stackRows;
  const items = i18n.stackItems;
  const label = item => (typeof item === "string" ? item : items[item.i18n]);
  const rows = Object.keys(names).map(key => [names[key], (stack.rows[key] ?? []).map(label)]);
  const body = [];
  let y = 20;
  for (const [title, list] of rows) {
    body.push(`<text x="24" y="${y + 17}" font-size="11" letter-spacing="1.5" fill="${T.muted}" font-weight="600">${esc(title)}</text>`);
    let x = STACK_LABEL_WIDTH;
    let line = 0;
    for (const text of list) {
      const width = pill(T, 0, 0, text, { size: 13, height: 26 }).width;
      if (x + width > STACK_LIMIT && x > STACK_LABEL_WIDTH) {
        x = STACK_LABEL_WIDTH;
        line += 1;
      }
      body.push(pill(T, x, y + line * 36, text, { size: 13, height: 26 }).svg);
      x += width + 10;
    }
    y += 50 + line * 36;
  }
  const height = y + 4;
  return [`<svg width="900" height="${height}" viewBox="0 0 900 ${height}" ${NS} font-family="${FONT}" role="img" aria-label="Stack">`,
    `<rect x="0.5" y="0.5" width="899" height="${height - 1}" rx="10" fill="${T.bg}" stroke="${T.border}"/>`,
    ...body, "</svg>"].join("\n");
}

function journeyCard(T, i18n) {
  const steps = i18n.journey;
  const out = [`<svg width="900" height="184" viewBox="0 0 900 184" ${NS} font-family="${FONT}" role="img" aria-label="Journey">`,
    `<rect x="0.5" y="0.5" width="899" height="183" rx="10" fill="${T.bg}" stroke="${T.border}"/>`,
    `<line x1="90" y1="36" x2="810" y2="36" stroke="${T.accent}" stroke-opacity="0.45" stroke-dasharray="4 5"/>`];
  steps.forEach((step, i) => {
    const cx = 90 + i * 180;
    out.push(`<circle cx="${cx}" cy="36" r="9" fill="${T.bg}" stroke="${T.accent}" stroke-width="2"/><circle cx="${cx}" cy="36" r="3.5" fill="${T.accent}"><animate attributeName="opacity" values="1;.3;1" dur="${num(2.4 + i * 0.5)}s" repeatCount="indefinite"/></circle>`,
      `<text x="${cx}" y="72" text-anchor="middle" font-size="14" font-weight="600" fill="${T.accent}">${esc(step.title)}</text>`);
    step.lines.forEach((line, j) => out.push(`<text x="${cx}" y="${96 + j * 19}" text-anchor="middle" font-size="12" fill="${j === 0 ? T.fg : T.muted}">${esc(line)}</text>`));
  });
  out.push("</svg>");
  return out.join("\n");
}

function shortDate(iso, lang, months) {
  const [, month, day] = iso.split("-").map(Number);
  return lang === "fr" ? `${day} ${months[month - 1]}` : `${months[month - 1]} ${day}`;
}
const dateRange = (start, end, lang, months) => `${shortDate(start, lang, months)} – ${shortDate(end, lang, months)}`;

function streakCard(T, lang, i18n, streak) {
  const labels = i18n.streakLabels;
  const range = dateRange(streak.currentStart, streak.currentEnd, lang, i18n.months);
  const longest = dateRange(streak.longestStart, streak.longestEnd, lang, i18n.months);
  const column = (cx, big, label, sub) => `<text x="${cx}" y="58" text-anchor="middle" font-size="32" font-weight="700" fill="${T.fg}">${esc(big)}</text>` +
    `<text x="${cx}" y="82" text-anchor="middle" font-size="14" fill="${T.accent}">${esc(label)}</text>` +
    `<text x="${cx}" y="100" text-anchor="middle" font-size="12" fill="${T.muted}">${esc(sub)}</text>`;
  return [`<svg width="900" height="124" viewBox="0 0 900 124" ${NS} font-family="${FONT}" role="img" aria-label="${esc(labels.contributions)}">`,
    `<rect x="0.5" y="0.5" width="899" height="123" rx="10" fill="${T.bg}" stroke="${T.border}"/>`,
    `<line x1="300" y1="20" x2="300" y2="104" stroke="${T.border}"/><line x1="600" y1="20" x2="600" y2="104" stroke="${T.border}"/>`,
    column(150, formatNumber(streak.total, lang), labels.contributions, labels.since),
    `<circle cx="450" cy="46" r="30" fill="none" stroke="${T.accent}" stroke-width="5" opacity="0.25"/>` +
    `<circle cx="450" cy="46" r="30" fill="none" stroke="${T.accent}" stroke-width="5" stroke-linecap="round" stroke-dasharray="188.5" stroke-dashoffset="30" transform="rotate(-90 450 46)"/>` +
    `<text x="450" y="55" text-anchor="middle" font-size="26" font-weight="700" fill="${T.fg}">${streak.current}</text>` +
    `<text x="450" y="94" text-anchor="middle" font-size="14" fill="${T.accent}">${esc(labels.current)}</text>` +
    `<text x="450" y="112" text-anchor="middle" font-size="12" fill="${T.muted}">${esc(range)}</text>`,
    column(750, String(streak.longest), labels.longest, longest),
    "</svg>"].join("\n");
}

function learningCard(T, lang, i18n, duolingo, now = new Date()) {
  const labels = i18n.learning;
  const [sinceYear, sinceMonth] = duolingo.since.split("-").map(Number);
  const totalMonths = (now.getUTCFullYear() - sinceYear) * 12 + (now.getUTCMonth() + 1 - sinceMonth);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const duration = `${years} ${labels.y} ${months} ${labels.m}`;
  const sinceText = `${labels.since} ${i18n.months[sinceMonth - 1]} ${sinceYear}`;
  const xp = formatNumber(duolingo.xp, lang);
  const flame = T.flame;
  return [`<svg width="900" height="124" viewBox="0 0 900 124" ${NS} font-family="${FONT}" role="img" aria-label="${esc(labels.title)}">`,
    `<rect x="0.5" y="0.5" width="899" height="123" rx="10" fill="${T.bg}" stroke="${T.border}"/>`,
    '<g transform="translate(24,14)"><rect width="22" height="15" rx="2.5" fill="#C60B1E"/><rect y="3.75" width="22" height="7.5" fill="#FFC400"/></g>',
    `<text x="54" y="26" font-size="11" letter-spacing="1.5" font-weight="700" fill="${T.accent}">${esc(labels.title)}</text>`,
    `<line x1="300" y1="40" x2="300" y2="108" stroke="${T.border}"/><line x1="600" y1="40" x2="600" y2="108" stroke="${T.border}"/>`,
    `<g transform="translate(150,52)"><path d="M3,-16 L-9,3 H-1 L-4,16 L10,-5 H1 Z" fill="${T.gold}"><animate attributeName="opacity" values="1;.55;1" dur="2.2s" repeatCount="indefinite"/></path></g>` +
    `<text x="150" y="92" text-anchor="middle" font-size="24" font-weight="700" fill="${T.fg}">${xp} XP</text>` +
    `<text x="150" y="110" text-anchor="middle" font-size="12" fill="${T.muted}">${esc(labels.xpSub)}</text>`,
    `<circle cx="450" cy="60" r="34" fill="none" stroke="${flame}" stroke-width="5" opacity=".25"/>` +
    `<circle cx="450" cy="60" r="34" fill="none" stroke="${flame}" stroke-width="5" stroke-linecap="round" stroke-dasharray="213.6" stroke-dashoffset="32" transform="rotate(-90 450 60)"/>` +
    `<path d="M450,36 C455,43 460,47 460,54 C460,60 456,64 450,64 C444,64 440,60 440,54 C440,49 443,47 445,42 C447,45 448,47 450,36 Z" fill="${flame}"><animate attributeName="opacity" values="1;.6;1" dur="1.3s" repeatCount="indefinite"/></path>` +
    `<text x="450" y="84" text-anchor="middle" font-size="19" font-weight="800" fill="${T.fg}">${duolingo.streak}</text>` +
    `<text x="450" y="115" text-anchor="middle" font-size="12" fill="${T.accent}">${esc(labels.streak)}</text>`,
    `<g transform="translate(750,36)"><rect x="-13" y="-10" width="26" height="22" rx="4" fill="none" stroke="${T.accent}" stroke-width="2"/><line x1="-13" y1="-3" x2="13" y2="-3" stroke="${T.accent}" stroke-width="2"/>` +
    `<line x1="-6" y1="-14" x2="-6" y2="-7" stroke="${T.accent}" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="-14" x2="6" y2="-7" stroke="${T.accent}" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="0" cy="5" r="2.2" fill="${T.accent}"><animate attributeName="opacity" values="1;.3;1" dur="2s" repeatCount="indefinite"/></circle></g>` +
    `<text x="750" y="86" text-anchor="middle" font-size="24" font-weight="700" fill="${T.fg}">${esc(duration)}</text>` +
    `<text x="750" y="104" text-anchor="middle" font-size="12" fill="${T.accent}">${esc(labels.learning)}</text>` +
    `<text x="750" y="118" text-anchor="middle" font-size="11" fill="${T.muted}">${esc(sinceText)}</text>`,
    "</svg>"].join("\n");
}

function statsCard(T, lang, i18n, stats) {
  const out = [`<svg width="440" height="200" viewBox="0 0 440 200" ${NS} font-family="${FONT}" role="img" aria-label="GitHub stats">`,
    `<rect x="0.5" y="0.5" width="439" height="199" rx="10" fill="${T.bg}" stroke="${T.border}"/>`];
  i18n.statsLabels.forEach((label, i) => {
    const y = 24 + i * 31;
    const value = lang === "fr" ? String(stats.values[i]).replace(/,/g, " ") : stats.values[i];
    out.push(`<g transform="translate(28,${y})"><path fill="${T.accent}" d="${stats.icons[i]}"/></g>` +
      `<text x="56" y="${y + 13}" font-size="14" fill="${T.fg}" font-weight="600">${esc(label)}</text>` +
      `<text x="250" y="${y + 13}" text-anchor="end" font-size="16" fill="${T.accent}" font-weight="600">${esc(value)}</text>`);
  });
  const circumference = 2 * Math.PI * 38;
  out.push(`<g transform="translate(346,100)"><circle r="38" fill="none" stroke="${T.accent}" stroke-width="6" opacity="0.2"/>` +
    `<circle r="38" fill="none" stroke="${T.accent}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${num(circumference)}" stroke-dashoffset="${num(circumference * stats.rankTop / 100)}" transform="rotate(-90)"/>` +
    `<text y="-12" text-anchor="middle" font-size="12" fill="${T.muted}">Top</text><text y="10" text-anchor="middle" font-size="21" font-weight="800" fill="${T.fg}">${stats.rankTop}%</text></g>`,
    "</svg>");
  return out.join("\n");
}

function languagesCard(T, languages) {
  const out = [`<svg width="440" height="200" viewBox="0 0 440 200" ${NS} font-family="${FONT}" role="img" aria-label="Languages">`,
    `<rect x="0.5" y="0.5" width="439" height="199" rx="10" fill="${T.bg}" stroke="${T.border}"/>`];
  languages.slice(0, 6).forEach(({ name, percent, color }, i) => {
    const y = 16 + i * 29;
    out.push(`<text x="28" y="${y + 12}" font-size="14" font-weight="600" fill="${T.fg}">${esc(name)}</text>` +
      `<text x="412" y="${y + 12}" text-anchor="end" font-size="12" fill="${T.muted}">${percent.toFixed(2)}%</text>` +
      `<rect x="28" y="${y + 17}" width="384" height="6" rx="3" fill="${T.border}"/>` +
      `<rect x="28" y="${y + 17}" width="${num(Math.max(6, (384 * percent) / 100), 1)}" height="6" rx="3" fill="${color}"/>`);
  });
  out.push("</svg>");
  return out.join("\n");
}

module.exports = { projectCard, stackCard, journeyCard, streakCard, learningCard, statsCard, languagesCard, duration, sizeLevel, formatNumber, dateRange };
