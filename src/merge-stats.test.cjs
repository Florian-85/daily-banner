const { test } = require("node:test");
const assert = require("node:assert/strict");
const { collect, summarize, renderStats, renderLanguages, createClient } = require("./merge-stats.cjs");

const repository = (stars, ...languages) => ({
  stargazerCount: stars,
  languages: { edges: languages.map(([name, size, color]) => ({ size, node: { name, color } })) },
});
const page = nodes => ({ totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes });

function fakeGraphql(calls = []) {
  return async (query, variables) => {
    calls.push({ query, variables });
    if (query.includes("createdAt followers")) {
      return { user: { createdAt: "2024-05-01T10:00:00Z", followers: { totalCount: 4 }, pullRequests: { totalCount: 7 }, issues: { totalCount: 3 } } };
    }
    if (query.includes("contributionsCollection")) {
      return { user: {
        y2024: { totalCommitContributions: 100, restrictedContributionsCount: 10, totalPullRequestReviewContributions: 2 },
        y2025: { totalCommitContributions: 200, restrictedContributionsCount: 0, totalPullRequestReviewContributions: 3 },
      } };
    }
    if (query.includes("organization(")) {
      return { organization: { repositories: page([repository(5, ["Python", 3000, "#3572A5"]), null]) } };
    }
    return { user: { repositories: page([repository(2, ["Python", 1000, "#3572A5"], ["Shell", 500, null]), repository(0)]) } };
  };
}

test("collects commits per year and repositories from the user and organizations", async () => {
  const calls = [];
  const collected = await collect({
    graphql: fakeGraphql(calls), user: "someone", organizations: ["acme"], now: new Date("2025-06-01T00:00:00Z"),
  });
  assert.equal(collected.commits, 310);
  assert.equal(collected.pullRequests, 7);
  assert.equal(collected.issues, 3);
  assert.equal(collected.reviews, 5);
  assert.equal(collected.followers, 4);
  assert.equal(collected.repositories.length, 3);
  assert.match(calls.find(call => call.query.includes("contributionsCollection")).query, /y2024.*y2025/);
  assert.deepEqual(calls.find(call => call.query.includes("organization(")).variables.login, "acme");
});

test("sums stars and languages across personal and organization repositories", async () => {
  const summary = summarize(await collect({
    graphql: fakeGraphql(), user: "someone", organizations: ["acme"], now: new Date("2025-06-01T00:00:00Z"),
  }));
  assert.deepEqual(summary.stats, { stars: 7, commits: 310, pullRequests: 7, issues: 3, repositories: 3 });
  assert.equal(summary.languages[0].name, "Python");
  assert.equal(summary.languages[0].percent.toFixed(2), "88.89");
  assert.equal(summary.languages[1].color, "#8B949E");
});

test("an unreadable organization fails instead of publishing partial numbers", async () => {
  const graphql = async (query, variables) => query.includes("organization(")
    ? { organization: null } : fakeGraphql()(query, variables);
  await assert.rejects(collect({ graphql, user: "someone", organizations: ["acme"], now: new Date("2025-06-01T00:00:00Z") }), /not found or not readable/);
});

test("cards share the same size, escape names and show the combined numbers", () => {
  const summary = summarize({
    commits: 1234, pullRequests: 1, issues: 2, reviews: 0, followers: 0,
    repositories: [repository(1, ["C<>&", 10, "#fff"])],
  });
  const stats = renderStats(summary);
  const languages = renderLanguages(summary);
  for (const svg of [stats, languages]) assert.match(svg, /width="400" height="327" viewBox="0 0 400 327"/);
  assert.match(stats, />1,234</);
  assert.match(stats, /class="rank"[^>]*>\d+%</);
  assert.match(languages, /C&lt;&gt;&amp;/);
  assert.match(languages, /100.00%/);
});

test("rank follows the published formula: nothing is C, huge numbers are S", () => {
  const rank = values => summarize({ ...values, repositories: [repository(values.stars)] }).rank;
  const none = rank({ commits: 0, pullRequests: 0, issues: 0, reviews: 0, followers: 0, stars: 0 });
  assert.equal(none.level, "C");
  assert.equal(none.percentile, 100);
  const huge = rank({ commits: 1e6, pullRequests: 1e6, issues: 1e6, reviews: 1e6, followers: 1e6, stars: 1e6 });
  assert.equal(huge.level, "S");
  const middle = rank({ commits: 1000, pullRequests: 50, issues: 25, reviews: 2, followers: 10, stars: 50 });
  assert.equal(middle.percentile.toFixed(2), "50.00");
  assert.equal(middle.level, "B+");
});
const reply = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test("gateway timeouts are retried with a delay, then succeed", async () => {
  const statuses = [504, 502, 200];
  const delays = [];
  const client = createClient("token", async () => reply(statuses.shift(), { data: { ok: true } }), async ms => delays.push(ms));
  assert.deepEqual(await client("query"), { ok: true });
  assert.deepEqual(delays, [5000, 10000]);
});

test("network failures are retried, persistent 504 and other errors fail", async () => {
  let calls = 0;
  const flaky = createClient("token", async () => {
    if (++calls < 3) throw new Error("network down");
    return reply(200, { data: { ok: true } });
  }, async () => {});
  assert.deepEqual(await flaky("query"), { ok: true });

  const down = createClient("token", async () => reply(504), async () => {});
  await assert.rejects(down("query"), /HTTP 504/);

  let attempts = 0;
  const forbidden = createClient("token", async () => { attempts++; return reply(401); }, async () => {});
  await assert.rejects(forbidden("query"), /HTTP 401/);
  assert.equal(attempts, 1);
});