const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8").split(String.fromCharCode(13)).join("");
const available = command => spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0;

test("the example workflow is complete: manual trigger, schedule, minimal permissions, one action", () => {
  const workflow = read("examples/daily-banner-workflow.yml");
  assert.match(workflow, /^on:\n {2}workflow_dispatch:/m);
  assert.match(workflow, /schedule:\n\s+- cron: "\d+ \d+ \* \* \*"/);
  assert.match(workflow, /^permissions:\n {2}contents: write/m);
  assert.doesNotMatch(workflow, /write-all|secrets\.|GITHUB_TOKEN|pull-requests|packages|id-token/);
  assert.match(workflow, /uses: actions\/checkout@v\d+/);
  assert.match(workflow, /uses: Florian-85\/daily-banner@v\d+\.\d+\.\d+/);
  assert.match(workflow, /timeout-minutes:/);
});

test("action inputs reach shell code only through environment variables, never by expression injection", () => {
  const action = read("action.yml");
  for (const line of action.split("\n").filter(l => l.includes("${{"))) {
    assert.match(line, /^\s+(?:DB_[A-Z_]+: |if: )/, `unsafe expression: ${line.trim()}`);
  }
  for (const input of ["config", "output-dir", "date", "commit", "commit-message"]) assert.match(action, new RegExp(`^  ${input}:`, "m"));
  assert.match(action, /using: composite/);
});

test("the repository's own workflows use no unpinned third-party code and read-only permissions", () => {
  const tests = read(".github/workflows/tests.yml");
  assert.match(tests, /^permissions:\n {2}contents: read/m);
  for (const [, reference] of tests.matchAll(/uses: (\S+)/g)) {
    assert.ok(reference.startsWith("./") || /@[0-9a-f]{40}$/.test(reference), `${reference} must be pinned to a commit`);
  }
});

// A consumer repository, end to end: config in, workflow steps run, commit pushed, nothing on a second run.
test("consumer repository: first run commits and pushes, same day is quiet, next day commits again", { skip: !(available("git") && available("bash")) && "git and bash are required" }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "db-consumer-"));
  const git = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(base, "init", "--bare", "--initial-branch=main", "origin.git");
  const work = path.join(base, "work");
  git(base, "clone", "origin.git", "work");
  git(work, "config", "user.name", "Test");
  git(work, "config", "user.email", "test@example.invalid");
  fs.writeFileSync(path.join(work, "README.md"), "# profile\n");
  fs.copyFileSync(path.join(root, "examples", "daily-banner.json"), path.join(work, "daily-banner.json"));
  git(work, "add", "-A");
  git(work, "commit", "-m", "init");
  git(work, "push", "origin", "HEAD:main");

  const step = (date, dir = "assets") => {
    const env = { ...process.env, DB_OUTPUT_DIR: dir, DB_MESSAGE: "chore: update daily banner" };
    const generate = spawnSync(process.execPath, [path.join(root, "bin", "daily-banner.cjs"), "generate", "--config", "daily-banner.json", "--out", dir, "--date", date], { cwd: work, encoding: "utf8", env });
    assert.equal(generate.status, 0, generate.stderr);
    return spawnSync("bash", [path.join(root, "scripts", "commit-if-changed.sh")], { cwd: work, encoding: "utf8", env });
  };
  const commits = () => Number(git(work, "rev-list", "--count", "HEAD"));

  const first = step("2026-02-10");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(commits(), 2);
  assert.equal(git(base, "--git-dir=origin.git", "rev-list", "--count", "main"), "2", "pushed");
  assert.match(git(work, "show", "--stat", "--format=%an %s", "HEAD"), /github-actions\[bot\] chore: update daily banner[\s\S]*assets\/daily-banner\.svg/);
  assert.equal(git(work, "status", "--porcelain"), "");

  const sameDay = step("2026-02-10");
  assert.equal(sameDay.status, 0, sameDay.stderr);
  assert.match(sameDay.stdout, /nothing to commit/);
  assert.equal(commits(), 2);

  assert.equal(step("2026-02-11").status, 0);
  assert.equal(commits(), 3);

  // Only the output folder is ever committed.
  fs.writeFileSync(path.join(work, "notes.txt"), "unrelated work in progress");
  assert.equal(step("2026-02-12").status, 0);
  assert.equal(git(work, "status", "--porcelain"), "?? notes.txt");

  // Something else already staged is neither a reason to commit nor part of the commit.
  git(work, "add", "notes.txt");
  const before = commits();
  const quiet = step("2026-02-12");
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.match(quiet.stdout, /nothing to commit/);
  assert.equal(commits(), before);
  assert.equal(git(work, "diff", "--cached", "--name-only"), "notes.txt");

  assert.equal(step("2026-02-13").status, 0);
  assert.equal(commits(), before + 1);
  assert.equal(git(work, "show", "--name-only", "--format=", "HEAD").split(String.fromCharCode(10)).some(file => file === "notes.txt"), false);
  assert.equal(git(work, "diff", "--cached", "--name-only"), "notes.txt");
});

test("the commit script refuses an output folder outside the repository", { skip: !available("bash") && "bash is required" }, () => {
  for (const dir of ["/etc", "../outside", "a/../../b", "C:\\x"]) {
    const result = spawnSync("bash", [path.join(root, "scripts", "commit-if-changed.sh")], { cwd: os.tmpdir(), encoding: "utf8", env: { ...process.env, DB_OUTPUT_DIR: dir } });
    assert.equal(result.status, 1, dir);
    assert.match(result.stdout + result.stderr, /output-dir must be a folder inside the repository/);
  }
});
