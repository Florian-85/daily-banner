const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { main, parseArguments, readState } = require("./run-profile.cjs");
const { loadConfig } = require("./lib/build.cjs");
const { fakeGraphql, fakeGitHub } = require("./test-fakes.cjs");

const TOKEN = "secret-stats-token-123";
const PUBLISH_TOKEN = "secret-publish-token-456";
const NOW = new Date("2026-10-20T04:17:00Z");
const duolingo = async () => ({ ok: true, status: 200, json: async () => ({ users: [{ streakData: { currentStreak: { length: 135, startDate: "2026-06-07" } }, creationDate: 1704786928, courses: [{ learningLanguage: "es", xp: 17556 }] }] }) });

function setup() {
  const github = fakeGitHub();
  const rest = { text: async file => {
    if (!file.includes("profile-data/state.json")) return null;
    return github.hasBranch("profile-staging") ? github.filesOf("profile-staging")["profile-data/state.json"] ?? null : null;
  } };
  const logs = [];
  const deps = { graphql: fakeGraphql({ days: { "2026-10-20": 1 } }), rest, publishRest: github, fetchImpl: duolingo, now: NOW, log: line => logs.push(String(line)) };
  return { github, deps, logs };
}

test("parses the modes and rejects unknown arguments", () => {
  assert.deepEqual(parseArguments(["--publish", "--branch", "profile-staging", "--date", "2026-10-20"]), { publish: true, branch: "profile-staging", date: "2026-10-20" });
  assert.deepEqual(parseArguments(["--diagnose"]), { diagnose: true });
  assert.throws(() => parseArguments(["--force"]), /Unexpected argument/);
});

test("needs a mode and the read token", async () => {
  await assert.rejects(main([], {}), /Choose --diagnose/);
  await assert.rejects(main(["--publish"], {}), /Missing PROFILE_STATS_TOKEN/);
  await assert.rejects(main(["--diagnose"], {}), /Missing PROFILE_STATS_TOKEN/);
});

test("publishes the generated profile and its state to the test branch, then stays idle", async () => {
  const { github, deps, logs } = setup();
  await main(["--publish", "--branch", "profile-staging"], { PROFILE_STATS_TOKEN: TOKEN, PROFILE_ORGS: "org" }, deps);
  const tree = github.filesOf("profile-staging");
  assert.ok(tree["README.md"] && tree["README.fr.md"] && tree["assets/en/dark/banner.svg"]);
  const state = JSON.parse(tree["profile-data/state.json"]);
  assert.equal(state.version, 1);
  assert.equal(state.data.duolingo.xp, 17556);
  assert.ok(state.stack.rows.languages.includes("Go"), "a detected technology is kept in the state");
  assert.ok(!JSON.stringify(state).includes("sample-learner"), "the state holds figures, not account names");

  const commitsAfterFirstRun = github.calls.filter(call => call.path.endsWith("/git/commits") && call.method === "POST").length;
  assert.equal(commitsAfterFirstRun, 1);
  await main(["--publish", "--branch", "profile-staging"], { PROFILE_STATS_TOKEN: TOKEN, PROFILE_ORGS: "org" }, deps);
  assert.equal(github.calls.filter(call => call.path.endsWith("/git/commits") && call.method === "POST").length, 1, "an identical second run makes no commit");
  assert.ok(logs.every(line => !line.includes(TOKEN)), "no token in the logs");
});

test("main is only written when running from Homelab's main branch", async () => {
  const { github, deps } = setup();
  for (const ref of [undefined, "refs/heads/feat/profile-generator-68", "refs/pull/69/merge"]) {
    await assert.rejects(main(["--publish", "--branch", "main"], { PROFILE_STATS_TOKEN: TOKEN, GITHUB_REF: ref }, deps), /only allowed from Homelab's main branch/, String(ref));
  }
  assert.equal(github.calls.filter(call => call.method !== "GET").length, 0);
  await main(["--publish", "--branch", "main"], { PROFILE_STATS_TOKEN: TOKEN, GITHUB_REF: "refs/heads/main" }, deps);
  assert.ok(github.filesOf("main")["README.md"].includes("<picture>"));
  await assert.rejects(main(["--publish", "--branch", "feat/x"], { PROFILE_STATS_TOKEN: TOKEN, GITHUB_REF: "refs/heads/main" }, deps), /not allowed/);
});

test("--out collects and writes everything locally without publishing", async () => {
  const { github, deps } = setup();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "profile-run-"));
  await main(["--out", out, "--date", "2026-10-20"], { PROFILE_STATS_TOKEN: TOKEN }, deps);
  assert.ok(fs.existsSync(path.join(out, "README.md")));
  assert.ok(fs.existsSync(path.join(out, "profile-data/state.json")));
  assert.equal(github.calls.length, 0);
  fs.rmSync(out, { recursive: true, force: true });
});

test("a collection problem is logged by name and never blocks the publication", async () => {
  const { deps, logs, github } = setup();
  deps.graphql = fakeGraphql({ failAccount: true, unreadable: ["alpha"] });
  await main(["--publish", "--branch", "profile-staging"], { PROFILE_STATS_TOKEN: TOKEN }, deps);
  assert.ok(logs.some(line => /warning: account statistics kept/.test(line)));
  assert.ok(logs.some(line => /projects kept from the previous run: alpha/.test(line)));
  assert.ok(github.hasBranch("profile-staging"));
});

test("readState falls back to the committed snapshot when the state is missing or broken", async () => {
  const config = loadConfig(path.join(__dirname, "config"));
  for (const text of [null, "{not json", JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, data: {} })]) {
    const state = await readState({ text: async () => text }, "profile-staging", config);
    assert.equal(state.data, config.snapshot);
    assert.equal(state.stack, config.stack);
  }
});

test("diagnose prints booleans and counts only, never a token", async () => {
  const response = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (body === null ? "" : JSON.stringify(body)) });
  const graphql = fakeGraphql();
  const fetchImpl = async (url, init = {}) => {
    if (url.endsWith("/graphql")) return response(200, { data: await graphql(JSON.parse(init.body).query) });
    if (url.includes("duolingo.com")) return duolingo();
    if (url.includes("/contents/")) return response(404, null);
    if (url.endsWith("/git/ref/heads/profile-staging")) return response(404, null);
    if (url.endsWith("/user")) return response(200, {});
    if (url.endsWith("/repos/Florian-85/Florian-85")) return response(200, { permissions: { push: true } });
    throw new Error(`unexpected ${url}`);
  };
  const logs = [];
  await main(["--diagnose"], { PROFILE_STATS_TOKEN: TOKEN, PROFILE_PUBLISH_TOKEN: PUBLISH_TOKEN, PROFILE_ORGS: "org" }, { fetchImpl, log: line => logs.push(String(line)) });
  const report = logs.join("\n");
  assert.match(report, /account statistics: ok/);
  assert.match(report, /project alpha: readable/);
  assert.match(report, /Duolingo public profile: reachable/);
  assert.match(report, /push permission=true, staging branch exists=false/);
  assert.ok(!report.includes(TOKEN) && !report.includes(PUBLISH_TOKEN));
});
