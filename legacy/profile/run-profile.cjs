"use strict";
// Collects the real data, builds the whole profile and publishes it. Modes:
//
//   node services/github-profile/run-profile.cjs --diagnose                       read-only report (booleans and counts only)
//   node services/github-profile/run-profile.cjs --out ./out                      collect + build into a local folder
//   node services/github-profile/run-profile.cjs --publish --branch profile-staging
//
// Tokens: PROFILE_STATS_TOKEN (read) and PROFILE_PUBLISH_TOKEN (write). Neither is ever printed.

const fs = require("node:fs");
const path = require("node:path");
const { buildProfile, loadConfig } = require("./lib/build.cjs");
const { collectAll, collectDuolingo, collectProjects } = require("./lib/collect.cjs");
const { createRest } = require("./lib/rest.cjs");
const { publishTree } = require("./lib/publish-tree.cjs");
const { createClient, collect: collectAccount } = require("./merge-stats.cjs");

const PROFILE = "Florian-85/Florian-85";

function parseArguments(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (["--diagnose", "--publish"].includes(argument)) options[argument.slice(2)] = true;
    else if (["--out", "--branch", "--date"].includes(argument)) options[argument.slice(2)] = argv[++i];
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  return options;
}

function requireToken(env, name) {
  if (!env[name]) throw new Error(`Missing ${name}.`);
  return env[name];
}

// Previous published state: gives the fallback values and the stack already shown.
async function readState(rest, branch, config) {
  const text = await rest.text(`/repos/${PROFILE}/contents/profile-data/state.json?ref=${encodeURIComponent(branch)}`);
  const fallback = { data: config.snapshot, stack: config.stack };
  if (!text) return fallback;
  try {
    const state = JSON.parse(text);
    if (state.version === 1 && state.data?.projects && state.data?.stats && state.stack?.rows) return { data: { ...config.snapshot, ...state.data }, stack: state.stack };
  } catch {
    // an unreadable state is replaced by the committed snapshot
  }
  return fallback;
}

const stateFile = (data, stack) => `${JSON.stringify({ version: 1, data, stack: { rows: stack.rows } }, null, 2)}\n`;

async function diagnose({ env, fetchImpl, config, log }) {
  const graphql = createClient(requireToken(env, "PROFILE_STATS_TOKEN"), fetchImpl);
  const rest = createRest(env.PROFILE_STATS_TOKEN, fetchImpl);
  const user = env.PROFILE_USER || "Florian-85";
  const organizations = (env.PROFILE_ORGS ?? "thekingadn").split(",").map(name => name.trim()).filter(Boolean);
  const shown = config.projects.projects.filter(project => project.shown);

  try {
    const viewer = await graphql("query { viewer { login } }");
    const headers = await rest.headers("/user");
    const scopes = headers["x-oauth-scopes"];
    log(`token identity: ${viewer.viewer.login === user ? "same account as the profile" : `DIFFERENT account (${viewer.viewer.login})`}; ` +
      `kind: ${scopes === undefined ? "fine-grained or app token (no scope header)" : `classic, scopes [${scopes}]`}`);
    const created = (await graphql("query($login: String!) { user(login: $login) { createdAt } }", { login: user })).user.createdAt;
    const first = new Date(created).getUTCFullYear();
    const last = new Date().getUTCFullYear();
    const windows = [];
    for (let year = first; year <= last; year++) windows.push(`y${year}: contributionsCollection(from: "${year === first ? created : `${year}-01-01T00:00:00Z`}", to: "${year === last ? new Date().toISOString() : `${year}-12-31T23:59:59Z`}") { totalCommitContributions totalIssueContributions totalPullRequestContributions totalPullRequestReviewContributions restrictedContributionsCount contributionCalendar { totalContributions } }`);
    const history = (await graphql(`query($login: String!) { user(login: $login) { ${windows.join(" ")} } }`, { login: user })).user;
    const sum = key => Object.values(history).reduce((total, window) => total + window[key], 0);
    log(`commit contributions seen by this token: public/accessible=${sum("totalCommitContributions")}, restricted (private)=${sum("restrictedContributionsCount")}`);
    const calendar = Object.values(history).reduce((total, window) => total + window.contributionCalendar.totalContributions, 0);
    log(`contribution types seen by this token: commits=${sum("totalCommitContributions")}, issues=${sum("totalIssueContributions")}, pullRequests=${sum("totalPullRequestContributions")}, reviews=${sum("totalPullRequestReviewContributions")}, restricted(all types)=${sum("restrictedContributionsCount")}, calendar total=${calendar}`);
  } catch (error) {
    log(`token inspection: ERROR (${error.message})`);
  }
  try {
    const collected = await collectAccount({ graphql, user, organizations });
    const privateCount = collected.repositories.length;
    log(`account statistics: ok (${privateCount} repositories readable across ${1 + organizations.length} owners)`);
  } catch (error) {
    log(`account statistics: ERROR (${error.message})`);
  }
  const projects = await collectProjects({ graphql, projects: shown });
  for (const project of shown) log(`project ${project.id}: ${projects.unreadable.includes(project.id) ? "NOT readable" : "readable (commits, issues, pull requests, languages)"}`);
  let readable = 0;
  let total = 0;
  for (const project of shown) {
    for (const rule of config.stack.detection.files) {
      total += 1;
      if (await rest.text(`/repos/${project.repo}/contents/${rule.path}`)) readable += 1;
    }
  }
  log(`stack detection files found: ${readable} of ${total} checked`);
  const duolingo = config.learning?.duolingo;
  if (duolingo) {
    const result = await collectDuolingo({ fetchImpl, username: duolingo.username, language: duolingo.language });
    log(`Duolingo public profile: ${result.stale ? `UNREACHABLE (${result.reason})` : "reachable"}`);
  }
  const publishRest = createRest(requireToken(env, "PROFILE_PUBLISH_TOKEN"), fetchImpl);
  const repository = await publishRest.request("GET", `/repos/${PROFILE}`);
  const staging = await publishRest.request("GET", `/repos/${PROFILE}/git/ref/heads/profile-staging`, null, [404]);
  log(`profile repository: push permission=${Boolean(repository.data.permissions?.push)}, staging branch exists=${staging.status === 200}`);
}

async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const options = parseArguments(argv);
  const log = deps.log ?? console.log;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const config = loadConfig(path.join(__dirname, "config"));
  if (options.diagnose) return diagnose({ env, fetchImpl, config, log });
  if (!options.publish && !options.out) throw new Error("Choose --diagnose, --out <directory> or --publish.");

  const statsToken = requireToken(env, "PROFILE_STATS_TOKEN");
  const graphql = deps.graphql ?? createClient(statsToken, fetchImpl);
  const rest = deps.rest ?? createRest(statsToken, fetchImpl);
  const branch = options.branch || "profile-staging";
  // The live profile can only be written by the workflow running on Homelab's own main branch.
  if (options.publish && branch === "main" && env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Publishing to main is only allowed from Homelab's main branch (GITHUB_REF).");
  }
  const date = options.date || (deps.now ?? new Date()).toISOString().slice(0, 10);
  const previous = await readState(rest, branch, config);
  const organizations = (env.PROFILE_ORGS ?? "thekingadn").split(",").map(name => name.trim()).filter(Boolean);
  const { data, stack, report } = await collectAll({
    graphql, rest, fetchImpl, config, previous, user: env.PROFILE_USER || "Florian-85", organizations, now: deps.now ?? new Date(),
  });
  for (const warning of report.warnings) log(`warning: ${warning}`);
  if (report.unreadableProjects.length) log(`warning: projects kept from the previous run: ${report.unreadableProjects.join(", ")}`);
  if (report.addedTechnologies.length) log(`stack additions: ${report.addedTechnologies.join(", ")}`);
  if (report.smallProjects.length) log(`stack: projects too small to feed the stack yet: ${report.smallProjects.join(", ")}`);
  if (report.unknownTechnologies.length) log(`unknown technologies (not displayed): ${report.unknownTechnologies.join(", ")}`);

  const { files, selection } = buildProfile({ ...config, stack }, data, { date });
  files.set("profile-data/state.json", stateFile(data, stack));

  if (options.out) {
    for (const [relative, content] of files) {
      const target = path.join(options.out, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    log(`${files.size} files written to ${options.out} (themes: ${selection.themes.dark}/${selection.themes.light}).`);
    return;
  }
  const publishRest = deps.publishRest ?? createRest(requireToken(env, "PROFILE_PUBLISH_TOKEN"), fetchImpl);
  await publishTree({ rest: publishRest, files, branch, log });
}

module.exports = { main, parseArguments, readState, stateFile, diagnose };
if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
