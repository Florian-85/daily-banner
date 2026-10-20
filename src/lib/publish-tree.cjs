"use strict";
// Publishes the generated files to the public profile repository in ONE commit (git data API),
// only when something changed. Hard safeguards: fixed repository, allowlisted branches and paths,
// validated content, deletions limited to the generated images.

const crypto = require("node:crypto");

const OWNER = "Florian-85";
const REPOSITORY = "Florian-85";
// The test branch, and `main` (phase 3). Publishing to `main` is further restricted by the caller
// (run-profile.cjs only does it when running from Homelab's own main branch).
const ALLOWED_BRANCHES = new Set(["profile-staging", "main"]);
const MAX_FILES = 300;
const MAX_BYTES = 1024 * 1024;
const PATH_RULES = [
  /^README(\.[a-z]{2})?\.md$/,
  /^assets\/(en|fr)\/(dark|light)\/[a-z0-9-]+\.svg$/,
  /^profile-data\/state\.json$/,
];
const DELETABLE = PATH_RULES[1];
// Files of the previous daily job, no longer used by the new README. Removed once, on `main` only.
const LEGACY_FILES = new Set(["profile/stats.svg", "profile/languages.svg"]);
const BOT = { name: "github-actions[bot]", email: "41898282+github-actions[bot]@users.noreply.github.com" };

function validateFile(path, content) {
  if (!PATH_RULES.some(rule => rule.test(path))) throw new Error(`Refusing to publish outside the allowlist: ${path}`);
  if (typeof content !== "string" || Buffer.byteLength(content) > MAX_BYTES) throw new Error(`Invalid or oversized file: ${path}`);
  if (path.endsWith(".svg")) {
    if (!/^<svg\b/.test(content) || !content.trimEnd().endsWith("</svg>") || content.includes("Something went wrong")) {
      throw new Error(`Invalid SVG, keeping the published image: ${path}`);
    }
  } else if (path.endsWith(".md")) {
    if (!content.includes("<picture>")) throw new Error(`Unexpected README content: ${path}`);
  } else {
    JSON.parse(content);
  }
}

const blobSha = content => crypto.createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest("hex");

async function publishTree({ rest, files, branch, message = "chore(profile): refresh the generated profile [skip ci]", log = () => {} }) {
  if (!ALLOWED_BRANCHES.has(branch)) throw new Error(`Publication to branch "${branch}" is not allowed.`);
  if (files.size === 0 || files.size > MAX_FILES) throw new Error(`Unexpected number of files: ${files.size}.`);
  for (const [path, content] of files) validateFile(path, content); // nothing is written before everything is valid

  const base = `/repos/${OWNER}/${REPOSITORY}`;
  let ref = await rest.request("GET", `${base}/git/ref/heads/${branch}`, null, [404]);
  if (ref.status === 404) {
    const main = await rest.request("GET", `${base}/git/ref/heads/main`);
    await rest.request("POST", `${base}/git/refs`, { ref: `refs/heads/${branch}`, sha: main.data.object.sha });
    log(`Created branch ${branch} from main.`);
    ref = await rest.request("GET", `${base}/git/ref/heads/${branch}`);
  }
  const head = ref.data.object.sha;
  const commit = await rest.request("GET", `${base}/git/commits/${head}`);
  const tree = await rest.request("GET", `${base}/git/trees/${commit.data.tree.sha}?recursive=1`);
  if (tree.data.truncated) throw new Error("The repository tree is too large to compare safely.");
  const existing = new Map(tree.data.tree.filter(entry => entry.type === "blob").map(entry => [entry.path, entry.sha]));

  const changed = [...files].filter(([path, content]) => existing.get(path) !== blobSha(content));
  const removed = [...existing.keys()].filter(path => !files.has(path) && (DELETABLE.test(path) || (branch === "main" && LEGACY_FILES.has(path))));
  if (!changed.length && !removed.length) {
    log("Everything is already up to date; no commit needed.");
    return { committed: false, changed: 0, removed: 0 };
  }

  const entries = [];
  for (const [path, content] of changed) {
    const blob = await rest.request("POST", `${base}/git/blobs`, { content, encoding: "utf-8" });
    entries.push({ path, mode: "100644", type: "blob", sha: blob.data.sha });
  }
  for (const path of removed) entries.push({ path, mode: "100644", type: "blob", sha: null });
  const newTree = await rest.request("POST", `${base}/git/trees`, { base_tree: commit.data.tree.sha, tree: entries });
  const newCommit = await rest.request("POST", `${base}/git/commits`, { message, tree: newTree.data.sha, parents: [head], author: BOT, committer: BOT });
  await rest.request("PATCH", `${base}/git/refs/heads/${branch}`, { sha: newCommit.data.sha, force: false });
  log(`Published ${changed.length} changed and ${removed.length} removed file(s) to ${branch}.`);
  return { committed: true, changed: changed.length, removed: removed.length, sha: newCommit.data.sha };
}

module.exports = { publishTree, validateFile, blobSha, ALLOWED_BRANCHES, PATH_RULES, LEGACY_FILES };
