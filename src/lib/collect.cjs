"use strict";
// Real data for the profile. Every collector keeps the previous value when its source fails,
// so a bad day never blanks a card. Errors are reported by name, never with a token.

const { collect: collectAccount, summarize } = require("../merge-stats.cjs");
const { mergeStack } = require("./stack.cjs");

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = date => date.toISOString().slice(0, 10);

// ---------- project cards ----------
async function collectProjects({ graphql, projects, previous = {} }) {
  const result = {};
  const unreadable = [];
  for (const project of projects) {
    if (!REPOSITORY.test(project.repo)) throw new Error(`Invalid repository in projects.json: ${project.id}`);
    const [owner, name] = project.repo.split("/");
    try {
      const data = await graphql(
        `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
          createdAt pushedAt
          defaultBranchRef { target { ... on Commit { history { totalCount } } } }
          issues(states: CLOSED) { totalCount }
          pullRequests(states: MERGED) { totalCount }
          languages(first: 50) { edges { size } }
        } }`,
      );
      const repository = data.repository;
      if (!repository) throw new Error("not readable");
      result[project.id] = {
        created: repository.createdAt.slice(0, 10),
        pushed: repository.pushedAt.slice(0, 10),
        commits: repository.defaultBranchRef?.target?.history?.totalCount ?? previous[project.id]?.commits ?? 0,
        merged: repository.pullRequests.totalCount,
        closed: repository.issues.totalCount,
        bytes: repository.languages.edges.reduce((sum, edge) => sum + edge.size, 0),
      };
    } catch {
      unreadable.push(project.id);
      if (previous[project.id]) result[project.id] = previous[project.id];
    }
  }
  return { projects: result, unreadable };
}

// ---------- contribution streak ----------
function streakFromDays(days, today) {
  const dates = Object.keys(days).sort();
  let total = 0;
  for (const date of dates) total += days[date];
  const yesterday = day(new Date(Date.parse(today) - 86400000));
  let cursor = (days[today] ?? 0) > 0 ? today : yesterday;
  const currentEnd = cursor;
  let current = 0;
  let currentStart = cursor;
  while ((days[cursor] ?? 0) > 0) {
    current += 1;
    currentStart = cursor;
    cursor = day(new Date(Date.parse(cursor) - 86400000));
  }
  let longest = 0;
  let longestStart = null;
  let longestEnd = null;
  let run = 0;
  let runStart = null;
  for (const date of dates) {
    if (days[date] > 0) {
      run += 1;
      if (run === 1) runStart = date;
      if (run > longest) {
        longest = run;
        longestStart = runStart;
        longestEnd = date;
      }
    } else {
      run = 0;
    }
  }
  return { total, current, currentStart: current ? currentStart : currentEnd, currentEnd, longest, longestStart: longestStart ?? today, longestEnd: longestEnd ?? today };
}

async function collectStreak({ graphql, user, now = new Date() }) {
  const profile = await graphql("query($login: String!) { user(login: $login) { createdAt } }", { login: user });
  if (!profile.user) throw new Error(`User not found: ${user}.`);
  const firstYear = new Date(profile.user.createdAt).getUTCFullYear();
  const lastYear = now.getUTCFullYear();
  const windows = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const from = year === firstYear ? profile.user.createdAt : `${year}-01-01T00:00:00Z`;
    const to = year === lastYear ? now.toISOString() : `${year}-12-31T23:59:59Z`;
    windows.push(`y${year}: contributionsCollection(from: "${from}", to: "${to}") { contributionCalendar { weeks { contributionDays { date contributionCount } } } }`);
  }
  const data = await graphql(`query($login: String!) { user(login: $login) { ${windows.join(" ")} } }`, { login: user });
  const days = {};
  for (let year = firstYear; year <= lastYear; year++) {
    for (const week of data.user[`y${year}`].contributionCalendar.weeks) {
      for (const entry of week.contributionDays) days[entry.date] = entry.contributionCount;
    }
  }
  const streak = streakFromDays(days, day(now));
  return { ...streak, firstContribution: profile.user.createdAt.slice(0, 7) };
}

// ---------- Duolingo (public, undocumented profile endpoint: best effort) ----------
async function collectDuolingo({ fetchImpl = fetch, username, language, previous }) {
  try {
    const response = await fetchImpl(`https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(username)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; homelab-profile)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const user = body.users?.[0];
    if (!user) throw new Error("profile not found or private");
    const course = (user.courses ?? []).find(candidate => candidate.learningLanguage === language);
    const xp = course?.xp;
    const streak = user.streakData?.currentStreak?.length ?? user.streak;
    const streakStart = user.streakData?.currentStreak?.startDate ?? previous?.streakStart;
    if (!Number.isFinite(xp) || !Number.isFinite(streak) || !DAY.test(String(streakStart))) throw new Error("unexpected response shape");
    const since = Number.isFinite(user.creationDate) ? new Date(user.creationDate * 1000).toISOString().slice(0, 7) : previous?.since;
    return { value: { xp, streak, streakStart, since }, stale: false };
  } catch (error) {
    return { value: previous, stale: true, reason: error.message };
  }
}

// ---------- stack detection (additions only, established projects only) ----------
// A project counts once it passes both thresholds: enough commits and enough code. Small starts never feed the stack.
const isEstablished = (stats, thresholds) => Boolean(stats) && stats.commits >= thresholds.minCommits && stats.bytes >= thresholds.minBytes;

const ESTABLISHED_FIELDS = `
  pageInfo { hasNextPage endCursor }
  nodes {
    nameWithOwner
    defaultBranchRef { target { ... on Commit { history { totalCount } } } }
    languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
  }`;

async function listOwned(graphql, ownerKind, login) {
  const nodes = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const affiliations = ownerKind === "user" ? "ownerAffiliations: OWNER, " : "";
    const data = await graphql(
      `query($login: String!, $after: String) { ${ownerKind}(login: $login) { repositories(first: 30, after: $after, ${affiliations}isFork: false) {${ESTABLISHED_FIELDS}} } }`,
      { login, after },
    );
    const connection = data[ownerKind]?.repositories;
    if (!connection) throw new Error(`${login} not found or not readable.`);
    nodes.push(...connection.nodes.filter(Boolean));
    if (!connection.pageInfo.hasNextPage) return nodes;
    after = connection.pageInfo.endCursor;
  }
  throw new Error("Too many repositories to list.");
}

// Languages found in the repositories that passed the thresholds (all owners, forks excluded).
async function collectEstablishedLanguages({ graphql, user, organizations = [], thresholds }) {
  const repositories = [...await listOwned(graphql, "user", user)];
  for (const organization of organizations) repositories.push(...await listOwned(graphql, "organization", organization));
  const names = new Set();
  const small = [];
  for (const repository of repositories) {
    const commits = repository.defaultBranchRef?.target?.history?.totalCount ?? 0;
    const bytes = repository.languages.edges.reduce((sum, edge) => sum + edge.size, 0);
    if (!isEstablished({ commits, bytes }, thresholds)) {
      small.push(repository.nameWithOwner.split("/")[1]);
      continue;
    }
    for (const edge of repository.languages.edges) if (edge.size >= thresholds.minLanguageBytes) names.add(edge.node.name);
  }
  return { languages: [...names], small };
}
async function detectStack({ rest, projects, languages, detection }) {
  const detected = languages.map(name => ({ name }));
  for (const project of projects) {
    if (!REPOSITORY.test(project.repo)) continue;
    for (const rule of detection.files) {
      const text = await rest.text(`/repos/${project.repo}/contents/${rule.path}`);
      if (text && text.toLowerCase().includes(rule.contains.toLowerCase())) detected.push({ name: rule.name });
    }
  }
  return detected;
}

function thousands(value) {
  return Number(value).toLocaleString("en-US");
}

// Everything the generator needs, with per-source fallback.
async function collectAll({ graphql, rest, fetchImpl, config, previous, user, organizations, now = new Date() }) {
  const report = { warnings: [], unreadableProjects: [], duolingoStale: false, unknownTechnologies: [], addedTechnologies: [], smallProjects: [] };
  const shown = config.projects.projects.filter(project => project.shown);
  const data = { ...previous.data };

  try {
    const collected = await collectAccount({ graphql, user, organizations, now });
    const summary = summarize(collected);
    data.stats = {
      ...previous.data.stats,
      values: [summary.stats.stars, summary.stats.commits, summary.stats.pullRequests, summary.stats.issues, summary.stats.repositories].map(thousands),
      rankTop: Math.max(1, Math.round(summary.rank.percentile)),
    };
    data.languages = summary.languages;
  } catch (error) {
    report.warnings.push(`account statistics kept from the previous run (${error.message})`);
  }

  const projects = await collectProjects({ graphql, projects: shown, previous: previous.data.projects });
  data.projects = { ...previous.data.projects, ...projects.projects };
  report.unreadableProjects = projects.unreadable;

  try {
    data.streak = { ...previous.data.streak, ...(await collectStreak({ graphql, user, now })) };
  } catch (error) {
    report.warnings.push(`streak kept from the previous run (${error.message})`);
  }

  const learning = config.learning?.duolingo;
  if (learning) {
    const duolingo = await collectDuolingo({ fetchImpl, username: learning.username, language: learning.language, previous: previous.data.duolingo });
    data.duolingo = duolingo.value;
    report.duolingoStale = duolingo.stale;
    if (duolingo.stale) report.warnings.push(`Duolingo kept from the previous run (${duolingo.reason})`);
  }

  let stack = previous.stack ?? config.stack;
  try {
    const thresholds = config.stack.thresholds;
    const established = await collectEstablishedLanguages({ graphql, user, organizations, thresholds });
    report.smallProjects = established.small;
    const bigShown = shown.filter(project => isEstablished(data.projects[project.id], thresholds));
    const detected = await detectStack({ rest, projects: bigShown, languages: established.languages, detection: config.stack.detection });
    const merged = mergeStack(stack, detected, config.stack.dictionary);
    stack = merged.stack;
    report.addedTechnologies = merged.added;
    report.unknownTechnologies = merged.unknown;
  } catch (error) {
    report.warnings.push(`stack kept from the previous run (${error.message})`);
  }
  return { data, stack, report };
}

module.exports = { collectProjects, collectStreak, streakFromDays, collectDuolingo, detectStack, collectAll, collectEstablishedLanguages, isEstablished };
