// Shared fakes for the offline tests (not a test file itself).
const { blobSha } = require("./lib/publish-tree.cjs");

const repository = (stars, ...languages) => ({
  stargazerCount: stars,
  languages: { edges: languages.map(([name, size, color]) => ({ size, node: { name, color } })) },
});
const page = nodes => ({ totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes });

// Answers the GraphQL queries of merge-stats.cjs and of lib/collect.cjs.
function fakeGraphql({ unreadable = [], failAccount = false, days = {}, calls = [], projectCommits = 168, projectBytes = 1219362 } = {}) {
  return async query => {
    calls.push(query);
    if (query.includes("viewer { login }")) return { viewer: { login: "Florian-85" } };
    if (query.includes("totalIssueContributions")) {
      const years = [...query.matchAll(/y(\d{4}):/g)].map(match => match[1]);
      const window = { totalCommitContributions: 10, totalIssueContributions: 5, totalPullRequestContributions: 3, totalPullRequestReviewContributions: 2, restrictedContributionsCount: 0, contributionCalendar: { totalContributions: 20 } };
      return { user: Object.fromEntries(years.map(year => [`y${year}`, window])) };
    }
    if (query.includes("contributionCalendar")) {
      const entries = Object.entries(days).map(([date, contributionCount]) => ({ date, contributionCount }));
      const years = [...query.matchAll(/y(\d{4}):/g)].map(match => match[1]);
      return { user: Object.fromEntries(years.map(year => [`y${year}`, { contributionCalendar: { weeks: [{ contributionDays: entries.filter(entry => entry.date.startsWith(year)) }] } }])) };
    }
    if (query.includes("user(login: $login) { createdAt }")) return { user: { createdAt: "2025-03-10T10:00:00Z" } };
    if (query.includes("nameWithOwner")) {
      const big = { nameWithOwner: "me/app", defaultBranchRef: { target: { history: { totalCount: 120 } } }, languages: { edges: [{ size: 600000, node: { name: "Python" } }, { size: 20000, node: { name: "Go" } }, { size: 300, node: { name: "Makefile" } }] } };
      const tiny = { nameWithOwner: "me/tiny", defaultBranchRef: { target: { history: { totalCount: 3 } } }, languages: { edges: [{ size: 500, node: { name: "Ruby" } }] } };
      const listing = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: query.includes("organization(") ? [] : [big, tiny] };
      return query.includes("organization(") ? { organization: { repositories: listing } } : { user: { repositories: listing } };
    }
    if (query.includes("repository(owner")) {
      if (unreadable.some(name => query.includes(`name: "${name}"`))) return { repository: null };
      return { repository: {
        createdAt: "2026-09-16T10:00:00Z", pushedAt: "2026-10-20T08:00:00Z",
        defaultBranchRef: { target: { history: { totalCount: projectCommits } } },
        issues: { totalCount: 58 }, pullRequests: { totalCount: 51 },
        languages: { edges: [{ size: projectBytes - 1000 }, { size: 1000 }] },
      } };
    }
    if (failAccount) throw new Error("GitHub GraphQL error: bad credentials");
    if (query.includes("createdAt followers")) return { user: { createdAt: "2025-03-10T10:00:00Z", followers: { totalCount: 4 }, pullRequests: { totalCount: 7 }, issues: { totalCount: 3 } } };
    if (query.includes("totalCommitContributions")) {
      return { user: { y2025: { totalCommitContributions: 100, restrictedContributionsCount: 10, totalPullRequestReviewContributions: 2 }, y2026: { totalCommitContributions: 200, restrictedContributionsCount: 0, totalPullRequestReviewContributions: 3 } } };
    }
    if (query.includes("organization(")) return { organization: { repositories: page([repository(5, ["Python", 3000, "#3572A5"]), repository(0, ["Go", 500, "#00ADD8"])]) } };
    return { user: { repositories: page([repository(2, ["Python", 1000, "#3572A5"], ["Shell", 500, null])]) } };
  };
}

// In-memory git repository answering the REST calls of lib/publish-tree.cjs.
function fakeGitHub({ branches = { main: { "README.md": "old" } }, extra = {} } = {}) {
  const calls = [];
  const trees = new Map(); // tree sha -> { path: content }
  const commits = new Map(); // commit sha -> { tree }
  const refs = {};
  let counter = 0;
  const addCommit = files => {
    const treeSha = `tree${++counter}`;
    trees.set(treeSha, { ...files });
    const commitSha = `commit${++counter}`;
    commits.set(commitSha, { tree: treeSha });
    return commitSha;
  };
  for (const [name, files] of Object.entries(branches)) refs[name] = addCommit({ ...files, ...extra });
  const blobs = new Map();
  const request = async (method, path, body, allow = []) => {
    calls.push({ method, path, body });
    const respond = (status, data) => {
      if (status >= 400 && !allow.includes(status)) throw new Error(`HTTP ${status}`);
      return { status, data };
    };
    let match;
    if ((match = /\/git\/ref\/heads\/(.+)$/.exec(path)) && method === "GET") {
      return refs[match[1]] ? respond(200, { object: { sha: refs[match[1]] } }) : respond(404, null);
    }
    if (path.endsWith("/git/refs") && method === "POST") {
      const name = body.ref.replace("refs/heads/", "");
      const main = Object.values(refs).find(sha => sha === body.sha);
      refs[name] = addCommit(trees.get(commits.get(main).tree));
      return respond(201, {});
    }
    if ((match = /\/git\/commits\/([^/]+)$/.exec(path)) && method === "GET") return respond(200, { tree: { sha: commits.get(match[1]).tree } });
    if ((match = /\/git\/trees\/([^/?]+)/.exec(path)) && method === "GET") {
      const files = trees.get(match[1]);
      return respond(200, { truncated: false, tree: Object.entries(files).map(([entryPath, content]) => ({ path: entryPath, type: "blob", sha: blobSha(content) })) });
    }
    if (path.endsWith("/git/blobs")) {
      const sha = blobSha(body.content);
      blobs.set(sha, body.content);
      return respond(201, { sha });
    }
    if (path.endsWith("/git/trees") && method === "POST") {
      const base = { ...trees.get(body.base_tree) };
      for (const entry of body.tree) {
        if (entry.sha === null) delete base[entry.path];
        else base[entry.path] = blobs.get(entry.sha);
      }
      const treeSha = `tree${++counter}`;
      trees.set(treeSha, base);
      return respond(201, { sha: treeSha });
    }
    if (path.endsWith("/git/commits") && method === "POST") {
      const commitSha = `commit${++counter}`;
      commits.set(commitSha, { tree: body.tree });
      return respond(201, { sha: commitSha });
    }
    if ((match = /\/git\/refs\/heads\/(.+)$/.exec(path)) && method === "PATCH") {
      refs[match[1]] = body.sha;
      return respond(200, {});
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  };
  return { request, calls, filesOf: branch => trees.get(commits.get(refs[branch]).tree), hasBranch: branch => Boolean(refs[branch]) };
}

module.exports = { fakeGraphql, fakeGitHub };
