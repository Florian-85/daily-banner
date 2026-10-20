const { test } = require("node:test");
const assert = require("node:assert/strict");
const { publishTree, validateFile } = require("./lib/publish-tree.cjs");
const { fakeGitHub } = require("./test-fakes.cjs");

const svg = name => `<svg width="10" height="10"><title>${name}</title></svg>\n`;
const readme = text => `<picture></picture>\n${text}\n`;
const files = (extra = {}) => new Map(Object.entries({
  "README.md": readme("en"),
  "README.fr.md": readme("fr"),
  "assets/en/dark/banner.svg": svg("a"),
  "assets/en/light/banner.svg": svg("b"),
  "profile-data/state.json": '{"version":1}\n',
  ...extra,
}));
const writes = github => github.calls.filter(call => call.method !== "GET");

test("creates the test branch from main and publishes everything in a single commit", async () => {
  const github = fakeGitHub();
  const result = await publishTree({ rest: github, files: files(), branch: "profile-staging" });
  assert.equal(result.committed, true);
  assert.equal(result.changed, 5);
  assert.ok(github.hasBranch("profile-staging"));
  assert.equal(writes(github).filter(call => call.path.endsWith("/git/commits")).length, 1);
  assert.equal(github.filesOf("profile-staging")["assets/en/dark/banner.svg"], svg("a"));
  assert.equal(writes(github).find(call => call.method === "PATCH").body.force, false, "never forces the branch");
});

test("an unchanged second run makes no commit and no write", async () => {
  const github = fakeGitHub();
  await publishTree({ rest: github, files: files(), branch: "profile-staging" });
  const before = github.calls.length;
  const result = await publishTree({ rest: github, files: files(), branch: "profile-staging" });
  assert.equal(result.committed, false);
  assert.equal(writes({ calls: github.calls.slice(before) }).length, 0);
});

test("only the changed file is uploaded", async () => {
  const github = fakeGitHub();
  await publishTree({ rest: github, files: files(), branch: "profile-staging" });
  const before = github.calls.length;
  const result = await publishTree({ rest: github, files: files({ "assets/en/dark/banner.svg": svg("changed") }), branch: "profile-staging" });
  assert.equal(result.changed, 1);
  assert.equal(github.calls.slice(before).filter(call => call.path.endsWith("/git/blobs")).length, 1);
  assert.equal(github.filesOf("profile-staging")["assets/en/dark/banner.svg"], svg("changed"));
});

test("removes generated images that are no longer produced, and nothing else", async () => {
  const github = fakeGitHub({ branches: { main: { "README.md": "old", "profile/stats.svg": "<svg></svg>", "assets/en/dark/card-old.svg": svg("old"), "notes/keep.md": "keep" } } });
  const result = await publishTree({ rest: github, files: files(), branch: "profile-staging" });
  assert.equal(result.removed, 1);
  const tree = github.filesOf("profile-staging");
  assert.ok(!("assets/en/dark/card-old.svg" in tree));
  assert.ok("profile/stats.svg" in tree && "notes/keep.md" in tree, "legacy files and unrelated files stay untouched");
});

test("only the test branch and main are writable", async () => {
  const github = fakeGitHub();
  for (const branch of ["master", "feat/x", "profile-staging2", ""]) {
    await assert.rejects(publishTree({ rest: github, files: files(), branch }), /not allowed/, branch);
  }
  assert.equal(github.calls.length, 0);
});

test("on main, the previous job's SVG files are removed once; on the test branch they are left alone", async () => {
  const legacy = { "profile/stats.svg": "<svg></svg>", "profile/languages.svg": "<svg></svg>", "notes/keep.md": "keep" };
  const github = fakeGitHub({ branches: { main: { "README.md": "old", ...legacy } } });
  await publishTree({ rest: github, files: files(), branch: "profile-staging" });
  assert.ok("profile/stats.svg" in github.filesOf("profile-staging"), "kept on the test branch");
  const result = await publishTree({ rest: github, files: files(), branch: "main" });
  assert.equal(result.committed, true);
  const tree = github.filesOf("main");
  assert.ok(!("profile/stats.svg" in tree) && !("profile/languages.svg" in tree));
  assert.ok("notes/keep.md" in tree, "unrelated files are never removed");
  assert.equal(tree["README.md"], readme("en"));
  const again = await publishTree({ rest: github, files: files(), branch: "main" });
  assert.equal(again.committed, false, "a second run is idle");
});

test("anything outside the allowlist is refused before any write", async () => {
  for (const path of [".github/workflows/x.yml", "profile/stats.svg", "assets/fr/dark/../x.svg", "assets/de/dark/banner.svg", "../README.md", "docs/a.md"]) {
    const github = fakeGitHub();
    await assert.rejects(publishTree({ rest: github, files: files({ [path]: svg("x") }), branch: "profile-staging" }), /allowlist/, path);
    assert.equal(writes(github).length, 0, path);
  }
});

test("invalid content is refused, keeping what is published", async () => {
  const bad = [
    ["assets/en/dark/banner.svg", "<html></html>"],
    ["assets/en/dark/banner.svg", '<svg><text>Something went wrong</text></svg>'],
    ["assets/en/dark/banner.svg", "x".repeat(1024 * 1024 + 1)],
    ["README.md", "no picture here"],
    ["profile-data/state.json", "{broken"],
  ];
  for (const [path, content] of bad) {
    const github = fakeGitHub();
    await assert.rejects(publishTree({ rest: github, files: files({ [path]: content }), branch: "profile-staging" }), undefined, path);
    assert.equal(writes(github).length, 0, path);
  }
  assert.throws(() => validateFile("assets/en/dark/banner.svg", 42), /Invalid or oversized/);
  await assert.rejects(publishTree({ rest: fakeGitHub(), files: new Map(), branch: "profile-staging" }), /number of files/);
});
