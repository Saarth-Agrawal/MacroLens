import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta = /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("renders the complete competition result surface", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /Evidence-Linked Causal Intelligence/i);
  assert.match(html, /Curated demo · pre-verified/i);
  assert.match(html, /Extracted claims/i);
  assert.match(html, /Interactive causal map/i);
  assert.match(html, /Stress Test/i);
  assert.match(html, /Evidence ledger/i);
  assert.match(html, /Limitations/i);
  assert.match(html, /METADATA ONLY RETRIEVED/i);
  assert.match(html, /Character confidence and headline-selection confidence remain separate/i);
  assert.doesNotMatch(html, /Original English analysis/i);
  assert.match(html, /rbi\.org\.in\/Scripts\/BS_PressReleaseDisplay\.aspx\?prid=63287/i);
  assert.doesNotMatch(html, /\d{1,3}% evidence confidence/i);
});

test("rejects an empty retrieval query instead of returning a fabricated result", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/news", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "" }),
  }), env, context);
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.deepEqual(payload.articles, []);
  assert.match(payload.limitation, /required/i);
});

test("any non-empty headline reaches the optional economic synthesis boundary", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ headline: "The Moon is made of cheese" }),
  }), env, context);
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.available, false);
  assert.match(payload.reason, /not configured/i);
});
