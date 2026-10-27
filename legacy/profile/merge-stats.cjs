const fs = require("node:fs/promises");
const path = require("node:path");

// Combines the personal account and its organizations into the two profile cards.
// Commits, pull requests and issues are read from the user: GitHub already counts
// the user's work in organization repositories there. Stars, repositories and
// languages are summed over the repositories owned by the user and the organizations.

const WIDTH = 400;
const HEIGHT = 327;
const COLORS = { background: "#0D1117", title: "#58A6FF", text: "#C9D1D9", border: "#30363D" };
const FALLBACK_LANGUAGE_COLOR = "#8B949E";
const LANGUAGE_COUNT = 6;
// Medians and weights of the github-readme-stats ranking (all-time commits).
const RANK_METRICS = {
  commits: { median: 1000, weight: 2, curve: "exponential" },
  pullRequests: { median: 50, weight: 3, curve: "exponential" },
  issues: { median: 25, weight: 1, curve: "exponential" },
  reviews: { median: 2, weight: 1, curve: "exponential" },
  stars: { median: 50, weight: 4, curve: "logNormal" },
  followers: { median: 10, weight: 1, curve: "logNormal" },
};
const RANK_THRESHOLDS = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
const RANK_LEVELS = ["S", "A+", "A", "A-", "B+", "B", "B-", "C+", "C"];
const REPOSITORY_FIELDS = `
  totalCount
  pageInfo { hasNextPage endCursor }
  nodes {
    stargazerCount
    languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
      edges { size node { name color } }
    }
  }`;

const ICONS = {
  stars: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
  commits: "M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  pullRequests: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
  issues: "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
  repositories: "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
};

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]
  ));
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 5;

// GitHub's GraphQL endpoint sometimes answers 502/503/504 on heavy queries: retry those
// (and network timeouts) with a growing delay, but fail fast on every other error.
function createClient(token, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  return async function graphql(query, variables = {}) {
    for (let attempt = 1; ; attempt++) {
      let response;
      try {
        response = await fetchImpl("https://api.github.com/graphql", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "homelab-profile-stats",
          },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) throw new Error("GitHub GraphQL request failed: " + error.message);
        await sleep(attempt * 5000);
        continue;
      }
      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 5000);
        continue;
      }
      if (!response.ok) throw new Error("GitHub GraphQL request failed with HTTP " + response.status + ".");
      const body = await response.json();
      if (body.errors?.length) {
        throw new Error("GitHub GraphQL error: " + body.errors.map(error => error.message).join("; "));
      }
      return body.data;
    }
  };
}
async function listRepositories(graphql, ownerQuery, variables, select) {
  const nodes = [];
  let after = null;
  for (let page = 0; page < 50; page++) {
    const data = await graphql(ownerQuery, { ...variables, after });
    const connection = select(data);
    if (!connection) throw new Error("Owner not found or not readable with this token.");
    nodes.push(...connection.nodes.filter(Boolean));
    if (!connection.pageInfo.hasNextPage) return nodes;
    after = connection.pageInfo.endCursor;
  }
  throw new Error("Too many repositories to list.");
}

async function collect({ graphql, user, organizations = [], now = new Date() }) {
  const profile = await graphql(
    "query($login: String!) { user(login: $login) { createdAt followers { totalCount } pullRequests { totalCount } issues { totalCount } } }",
    { login: user },
  );
  if (!profile.user) throw new Error("User not found: " + user + ".");

  // One aliased request per calendar year, as a single contributions window is limited to a year.
  const firstYear = new Date(profile.user.createdAt).getUTCFullYear();
  const lastYear = now.getUTCFullYear();
  const years = [];
  for (let year = firstYear; year <= lastYear; year++) years.push(year);
  const windows = years.map(year => {
    const from = year === firstYear ? profile.user.createdAt : year + "-01-01T00:00:00Z";
    const to = year === lastYear ? now.toISOString() : year + "-12-31T23:59:59Z";
    return "y" + year + ': contributionsCollection(from: "' + from + '", to: "' + to +
      '") { totalCommitContributions restrictedContributionsCount totalPullRequestReviewContributions }';
  });
  const history = await graphql(
    "query($login: String!) { user(login: $login) { " + windows.join(" ") + " } }",
    { login: user },
  );
  const windowsByYear = years.map(year => history.user["y" + year]);
  const commits = windowsByYear.reduce(
    (sum, window) => sum + window.totalCommitContributions + window.restrictedContributionsCount, 0);
  const reviews = windowsByYear.reduce((sum, window) => sum + window.totalPullRequestReviewContributions, 0);

  const owned = await listRepositories(
    graphql,
    `query($login: String!, $after: String) { user(login: $login) {
      repositories(first: 50, after: $after, ownerAffiliations: OWNER, isFork: false) {${REPOSITORY_FIELDS}} } }`,
    { login: user },
    data => data.user?.repositories,
  );
  const repositories = [...owned];
  for (const organization of organizations) {
    repositories.push(...await listRepositories(
      graphql,
      `query($login: String!, $after: String) { organization(login: $login) {
        repositories(first: 50, after: $after, isFork: false) {${REPOSITORY_FIELDS}} } }`,
      { login: organization },
      data => data.organization?.repositories,
    ));
  }

  return {
    commits,
    pullRequests: profile.user.pullRequests.totalCount,
    issues: profile.user.issues.totalCount,
    reviews,
    followers: profile.user.followers.totalCount,
    repositories,
  };
}

function rankOf(values) {
  const curves = {
    exponential: x => 1 - 2 ** -x,
    logNormal: x => x / (1 + x),
  };
  const totalWeight = Object.values(RANK_METRICS).reduce((sum, metric) => sum + metric.weight, 0);
  const score = Object.entries(RANK_METRICS).reduce((sum, [name, metric]) =>
    sum + metric.weight * curves[metric.curve](values[name] / metric.median), 0);
  const percentile = (1 - score / totalWeight) * 100;
  const index = RANK_THRESHOLDS.findIndex(threshold => percentile <= threshold);
  return { level: RANK_LEVELS[index === -1 ? RANK_LEVELS.length - 1 : index], percentile };
}

function summarize(collected) {
  const languages = new Map();
  let stars = 0;
  for (const repository of collected.repositories) {
    stars += repository.stargazerCount;
    for (const edge of repository.languages.edges) {
      const known = languages.get(edge.node.name) ?? { name: edge.node.name, color: edge.node.color, size: 0 };
      known.size += edge.size;
      known.color = known.color ?? edge.node.color;
      languages.set(edge.node.name, known);
    }
  }
  const sorted = [...languages.values()].sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  const top = sorted.slice(0, LANGUAGE_COUNT);
  const total = top.reduce((sum, language) => sum + language.size, 0);
  return {
    stats: {
      stars,
      commits: collected.commits,
      pullRequests: collected.pullRequests,
      issues: collected.issues,
      repositories: collected.repositories.length,
    },
    rank: rankOf({ ...collected, stars }),
    languages: top.map(language => ({
      name: language.name,
      color: language.color ?? FALLBACK_LANGUAGE_COLOR,
      percent: total ? (language.size / total) * 100 : 0,
    })),
  };
}

function frame(label, body) {
  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title">
<title id="title">${escapeXml(label)}</title>
<style>text{font:600 16px 'Segoe UI',Ubuntu,'Helvetica Neue',Sans-Serif;fill:${COLORS.text}}.value{font-size:18px;fill:${COLORS.title}}.muted{font-weight:400;font-size:13px}.rank{font-size:22px;font-weight:800}</style>
<rect x="0.5" y="0.5" rx="4.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" fill="${COLORS.background}" stroke="${COLORS.border}"/>
${body}
</svg>
`;
}

function renderStats(summary) {
  const rows = [
    ["stars", "Total Stars", summary.stats.stars],
    ["commits", "Total Commits", summary.stats.commits],
    ["pullRequests", "Total PRs", summary.stats.pullRequests],
    ["issues", "Total Issues", summary.stats.issues],
    ["repositories", "Repositories", summary.stats.repositories],
  ];
  const pitch = 52;
  const top = (HEIGHT - ((rows.length - 1) * pitch + 16)) / 2;
  const body = rows.map(([key, label, value], index) => {
    const y = top + index * pitch;
    return `<g transform="translate(0, ${y})"><path transform="translate(25, 0)" fill="${COLORS.title}" d="${ICONS[key]}"/>` +
      `<text x="53" y="13">${escapeXml(label)}</text>` +
      `<text class="value" x="235" y="14" text-anchor="end">${Number(value).toLocaleString("en-US")}</text></g>`;
  }).join("\n");
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, 100 - summary.rank.percentile));
  const offset = circumference * (1 - progress / 100);
  const circle = `<g transform="translate(315, ${HEIGHT / 2})" aria-label="Top ${Math.max(1, Math.round(summary.rank.percentile))}%">` +
    `<circle r="${radius}" stroke="${COLORS.title}" stroke-width="6" opacity="0.2"/>` +
    `<circle r="${radius}" stroke="${COLORS.title}" stroke-width="6" stroke-linecap="round" ` +
    `stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90)"/>` +
    `<text class="muted" y="-14" text-anchor="middle" dominant-baseline="central">Top</text>` +
    `<text class="rank" y="8" text-anchor="middle" dominant-baseline="central">${Math.max(1, Math.round(summary.rank.percentile))}%</text></g>`;
  return frame("Statistics: personal account and organizations", body + "\n" + circle);
}

function renderLanguages(summary) {
  const rows = summary.languages;
  const pitch = 46;
  const top = (HEIGHT - ((rows.length - 1) * pitch + 28)) / 2;
  const barWidth = WIDTH - 80;
  const body = rows.map((language, index) => {
    const y = top + index * pitch;
    const filled = Math.max(2, (barWidth * language.percent) / 100);
    return `<g transform="translate(40, ${y})"><text y="12">${escapeXml(language.name)}</text>` +
      `<text class="muted" x="${barWidth}" y="12" text-anchor="end">${language.percent.toFixed(2)}%</text>` +
      `<rect y="20" width="${barWidth}" height="8" rx="4" fill="${COLORS.border}"/>` +
      `<rect y="20" width="${filled.toFixed(2)}" height="8" rx="4" fill="${escapeXml(language.color)}"/></g>`;
  }).join("\n");
  return frame("Most used languages: personal account and organizations", body);
}

async function writeCards(summary, directory = ".") {
  const files = [["profile/stats.svg", renderStats(summary)], ["profile/languages.svg", renderLanguages(summary)]];
  for (const [file, svg] of files) {
    const target = path.join(directory, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, svg);
  }
}

async function main(env = process.env) {
  const token = env.STATS_TOKEN;
  if (!token) throw new Error("Missing STATS_TOKEN.");
  const user = env.PROFILE_USER || "Florian-85";
  const organizations = (env.PROFILE_ORGS ?? "thekingadn").split(",").map(name => name.trim()).filter(Boolean);
  const collected = await collect({ graphql: createClient(token), user, organizations });
  await writeCards(summarize(collected), env.PROFILE_OUTPUT_DIR || ".");
}

module.exports = { collect, summarize, renderStats, renderLanguages, writeCards, createClient, main };
if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
