"use strict";
// Minimal GitHub REST client (no dependency). Retries gateway errors like the GraphQL client does.

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 4;

function createRest(token, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  async function send(method, path, { body, accept = "application/vnd.github+json" } = {}) {
    for (let attempt = 1; ; attempt++) {
      let response;
      try {
        response = await fetchImpl(`https://api.github.com${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: accept,
            "User-Agent": "homelab-profile",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(60000),
        });
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) throw new Error(`GitHub request failed: ${error.message}`);
        await sleep(attempt * 3000);
        continue;
      }
      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 3000);
        continue;
      }
      return response;
    }
  }

  return {
    // JSON request: returns { status, data }. Statuses listed in `allow` are returned instead of thrown.
    async request(method, path, body, allow = []) {
      const response = await send(method, path, { body });
      if (!response.ok && !allow.includes(response.status)) {
        throw new Error(`GitHub ${method} ${path.split("?")[0]} failed with HTTP ${response.status}.`);
      }
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) : null };
    },
    // Response headers of a GET (used by the diagnostic to tell the kind of token, never its value).
    async headers(path) {
      const response = await send("GET", path);
      return Object.fromEntries(response.headers?.entries?.() ?? []);
    },
    // Raw text of a file, or null when it does not exist / is not readable.
    async text(path) {
      const response = await send("GET", path, { accept: "application/vnd.github.raw+json" });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new Error(`GitHub GET ${path.split("?")[0]} failed with HTTP ${response.status}.`);
      return response.text();
    },
  };
}

module.exports = { createRest };
