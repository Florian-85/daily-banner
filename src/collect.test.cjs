const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { collectProjects, collectStreak, streakFromDays, collectDuolingo, detectStack, collectAll, collectEstablishedLanguages, isEstablished } = require("./lib/collect.cjs");
const { loadConfig } = require("./lib/build.cjs");
const { fakeGraphql } = require("./test-fakes.cjs");

const config = loadConfig(path.join(__dirname, "config"));
const previousData = config.snapshot;

test("project figures come from the repository, bytes are the sum of the languages", async () => {
  const projects = [{ id: "alpha", repo: "acme/alpha" }];
  const result = await collectProjects({ graphql: fakeGraphql(), projects });
  assert.deepEqual(result.projects.alpha, { created: "2026-09-16", pushed: "2026-10-20", commits: 168, merged: 51, closed: 58, bytes: 1219362 });
  assert.deepEqual(result.unreadable, []);
});

test("an unreadable repository keeps its previous figures and is reported", async () => {
  const projects = [{ id: "alpha", repo: "acme/alpha" }, { id: "secret", repo: "acme/Hidden" }];
  const previous = { secret: { created: "2026-01-01", pushed: "2026-01-02", commits: 3, merged: 0, closed: 0, bytes: 10 } };
  const result = await collectProjects({ graphql: fakeGraphql({ unreadable: ["Hidden"] }), projects, previous });
  assert.deepEqual(result.unreadable, ["secret"]);
  assert.equal(result.projects.secret, previous.secret);
  assert.ok(result.projects.alpha);
});

test("a repository name that could alter the query is refused", async () => {
  await assert.rejects(collectProjects({ graphql: fakeGraphql(), projects: [{ id: "x", repo: 'a/b") { x } y: repository(owner: "c' }] }), /Invalid repository/);
});

test("streak: current run may end yesterday, longest run is tracked, total counts every contribution", () => {
  const days = { "2026-10-14": 2, "2026-10-15": 1, "2026-10-16": 0, "2026-10-17": 3, "2026-10-18": 1, "2026-10-19": 4, "2026-10-20": 0 };
  const streak = streakFromDays(days, "2026-10-20");
  assert.equal(streak.total, 11);
  assert.deepEqual([streak.current, streak.currentStart, streak.currentEnd], [3, "2026-10-17", "2026-10-19"]);
  assert.deepEqual([streak.longest, streak.longestStart, streak.longestEnd], [3, "2026-10-17", "2026-10-19"]);
  const today = streakFromDays({ ...days, "2026-10-20": 5 }, "2026-10-20");
  assert.deepEqual([today.current, today.currentEnd], [4, "2026-10-20"]);
  assert.equal(streakFromDays({ "2026-10-20": 0, "2026-10-19": 0 }, "2026-10-20").current, 0);
});

test("the streak is read from one aliased request per year", async () => {
  const calls = [];
  const streak = await collectStreak({ graphql: fakeGraphql({ calls, days: { "2025-12-31": 1, "2026-01-01": 1, "2026-10-20": 2 } }), user: "me", now: new Date("2026-10-20T04:00:00Z") });
  assert.equal(streak.total, 4);
  assert.equal(streak.firstContribution, "2025-03");
  assert.equal(calls.filter(call => call.includes("contributionCalendar")).length, 1);
  assert.match(calls.find(call => call.includes("contributionCalendar")), /y2025:.*y2026:/s);
});

const duolingoResponse = body => async () => ({ ok: true, status: 200, json: async () => body });
const profile = { users: [{ streak: 0, streakData: { currentStreak: { length: 135, startDate: "2026-06-07" } }, creationDate: 1704786928, courses: [{ learningLanguage: "es", xp: 17556 }, { learningLanguage: "de", xp: 15 }] }] };

test("Duolingo: reads the requested language, the streak and the start date", async () => {
  const result = await collectDuolingo({ fetchImpl: duolingoResponse(profile), username: "me", language: "es" });
  assert.deepEqual(result, { value: { xp: 17556, streak: 135, streakStart: "2026-06-07", since: "2024-01" }, stale: false });
});

test("Duolingo: any failure keeps the previous value", async () => {
  const previous = { xp: 1, streak: 2, streakStart: "2026-01-01", since: "2024-01" };
  const failures = [
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
    async () => { throw new Error("network down"); },
    duolingoResponse({ users: [] }),
    duolingoResponse({ users: [{ courses: [], streak: 5 }] }),
    duolingoResponse({ users: [{ courses: [{ learningLanguage: "es", xp: "lots" }], streak: 5 }] }),
  ];
  for (const fetchImpl of failures) {
    const result = await collectDuolingo({ fetchImpl, username: "me", language: "es", previous });
    assert.equal(result.stale, true);
    assert.equal(result.value, previous);
  }
});

test("stack detection reads the configured files, case-insensitively", async () => {
  const rest = { text: async file => (file.endsWith("/composer.json") ? '{"require":{"Laravel/Framework":"^12"}}' : null) };
  const detected = await detectStack({ rest, projects: [{ repo: "me/app" }], languages: ["Python"], detection: config.stack.detection });
  assert.deepEqual(detected.map(item => item.name).sort(), ["Laravel", "Python"]);
});

test("collectAll: a failing account query keeps the previous statistics and still updates the rest", async () => {
  const rest = { text: async () => null };
  const previous = { data: previousData, stack: config.stack };
  const { data, report } = await collectAll({ graphql: fakeGraphql({ failAccount: true }), rest, fetchImpl: duolingoResponse(profile), config, previous, user: "me", organizations: ["org"], now: new Date("2026-10-20T04:00:00Z") });
  assert.deepEqual(data.stats, previousData.stats);
  assert.ok(report.warnings.some(warning => warning.startsWith("account statistics kept")));
  assert.equal(data.projects.alpha.commits, 168);
  assert.equal(data.duolingo.xp, 17556);
});

test("collectAll: fresh statistics, additive stack and no failure on a healthy day", async () => {
  const rest = { text: async () => null };
  const previous = { data: previousData, stack: config.stack };
  const { data, stack, report } = await collectAll({ graphql: fakeGraphql({ days: { "2026-10-20": 1 } }), rest, fetchImpl: duolingoResponse(profile), config, previous, user: "me", organizations: ["org"], now: new Date("2026-10-20T04:00:00Z") });
  assert.deepEqual(report.warnings, []);
  assert.equal(data.stats.values[1], "310", "commits = 100 + 10 + 200, formatted");
  assert.deepEqual(report.addedTechnologies, ["Go"], "Ruby (3 commits) and the 300-byte Makefile do not feed the stack");
  assert.deepEqual(report.smallProjects, ["tiny"]);
  assert.ok(stack.rows.languages.includes("Go"));
  for (const [row, items] of Object.entries(config.stack.rows)) for (const item of items) assert.ok(stack.rows[row].some(shown => JSON.stringify(shown) === JSON.stringify(item)), `${row} keeps ${JSON.stringify(item)}`);
  assert.equal(data.streak.current, 1);
});

test("a project feeds the stack only once it has enough commits and enough code", async () => {
  const thresholds = config.stack.thresholds;
  const { minCommits, minBytes } = thresholds;
  assert.equal(isEstablished({ commits: minCommits, bytes: minBytes }, thresholds), true);
  assert.equal(isEstablished({ commits: minCommits - 1, bytes: minBytes * 5 }, thresholds), false, "many lines but few commits");
  assert.equal(isEstablished({ commits: minCommits * 10, bytes: minBytes - 1 }, thresholds), false, "many commits but little code");
  assert.equal(isEstablished(undefined, thresholds), false);
  const { languages, small } = await collectEstablishedLanguages({ graphql: fakeGraphql(), user: "me", organizations: ["org"], thresholds });
  assert.deepEqual(languages.sort(), ["Go", "Python"]);
  assert.deepEqual(small, ["tiny"]);
});

test("file-based detection ignores projects that are still small", async () => {
  const asked = [];
  const rest = { text: async file => { asked.push(file); return '{"require":{"laravel/framework":"^12"}}'; } };
  const previous = { data: previousData, stack: config.stack };
  const run = projectCommits => collectAll({ graphql: fakeGraphql({ projectCommits }), rest, fetchImpl: duolingoResponse(profile), config, previous, user: "me", organizations: ["org"], now: new Date("2026-10-20T04:00:00Z") });
  const small = await run(5);
  assert.equal(asked.length, 0, "no file is read for a project below the thresholds");
  assert.ok(!small.report.addedTechnologies.includes("Laravel"));
  asked.length = 0;
  const big = await run(168);
  assert.ok(asked.length > 0);
  assert.ok(big.stack.rows.frameworks.includes("Laravel"));
});
