import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  fetchOfficialDocument,
  listOfficialSources,
  readCachedOfficialDocument,
  searchCachedOfficialDocuments,
} from "../src/cache.js";
import {
  readCachedKnowledge,
  searchCachedKnowledge,
  storeKnowledgeResult,
} from "../src/knowledge-cache.js";

test("fetches an approved source once and serves its cached copy", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vscodeagent-cache-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  let requestCount = 0;

  const fetcher: typeof fetch = async (_url, init) => {
    requestCount += 1;
    assert.equal(new Headers(init?.headers).get("accept"), "text/plain");
    return new Response(
      "---\nContentId: example\n---\n# Cached VS Code Guide\n\nAgent settings guidance.",
      {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          etag: '"guide-v1"',
        },
      },
    );
  };

  const fetched = await fetchOfficialDocument("settings", false, root, fetcher);
  assert.equal(fetched.cacheStatus, "refreshed");
  assert.equal(fetched.title, "User and workspace settings in VS Code");
  assert.match(fetched.content, /# Cached VS Code Guide/);
  assert.equal(
    fetched.license,
    "Creative Commons Attribution 3.0 United States (CC BY 3.0 US)",
  );

  const cached = await fetchOfficialDocument("settings", false, root, fetcher);
  assert.equal(cached.cacheStatus, "fresh");
  assert.equal(requestCount, 1);

  const fromReadTool = await readCachedOfficialDocument("settings", root);
  assert.equal(fromReadTool.sha256, fetched.sha256);
  assert.match(fromReadTool.content, /Agent settings guidance/);

  const matches = await searchCachedOfficialDocuments(
    "settings guidance",
    5,
    root,
  );
  assert.equal(matches[0]?.path, "official:settings");

  const sources = await listOfficialSources(root);
  assert.equal(
    sources.find((source) => source.id === "settings")?.cached,
    true,
  );

  const cachedFile = path.join(root, "markdown", "settings.md");
  assert.match(await readFile(cachedFile, "utf8"), /Agent settings guidance/);
});

test("revalidates a stale cache and reports stale data when refresh fails", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vscodeagent-cache-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const initialFetcher: typeof fetch = async () =>
    new Response("# Remote Development\n\nRemote host guidance.", {
      headers: { "content-type": "text/plain", etag: '"remote-v1"' },
    });
  await fetchOfficialDocument(
    "remote-development",
    false,
    root,
    initialFetcher,
  );

  const metadataPath = path.join(root, "metadata", "remote-development.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    cachedAt: string;
  };
  metadata.cachedAt = new Date(
    Date.now() - 8 * 24 * 60 * 60 * 1000,
  ).toISOString();
  await writeFile(metadataPath, JSON.stringify(metadata), "utf8");

  let conditionalHeader: string | null = null;
  const notModifiedFetcher: typeof fetch = async (_url, init) => {
    conditionalHeader = new Headers(init?.headers).get("if-none-match");
    return new Response(null, { status: 304 });
  };
  const revalidated = await fetchOfficialDocument(
    "remote-development",
    false,
    root,
    notModifiedFetcher,
  );
  assert.equal(conditionalHeader, '"remote-v1"');
  assert.equal(revalidated.cacheStatus, "not-modified");

  metadata.cachedAt = new Date(
    Date.now() - 8 * 24 * 60 * 60 * 1000,
  ).toISOString();
  await writeFile(metadataPath, JSON.stringify(metadata), "utf8");
  const stale = await fetchOfficialDocument(
    "remote-development",
    false,
    root,
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(stale.cacheStatus, "stale");
  assert.match(stale.refreshError ?? "", /offline/);
});

test("rejects source identifiers outside the fixed catalog", async () => {
  await assert.rejects(
    fetchOfficialDocument("../../etc/passwd"),
    /Unknown official documentation source/,
  );
});

test("stores, canonicalizes, reads, and searches filtered knowledge locally", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vscodeagent-knowledge-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const url =
    "https://example.com/guides/extensions?utm_source=newsletter#setup";

  const missing = await readCachedKnowledge(url, root);
  assert.equal(missing.status, "miss");

  const stored = await storeKnowledgeResult(
    {
      url,
      source: "firecrawl_scrape",
      outcome: "cached",
      title: "Extension Setup",
      content:
        "Use the extension host appropriate to the workspace. Verify the VS Code version before changing settings.",
      tags: ["VS Code", "extensions"],
    },
    root,
  );
  assert.equal(stored.url, "https://example.com/guides/extensions");

  const cached = await readCachedKnowledge(
    "https://example.com/guides/extensions#other",
    root,
  );
  assert.equal(cached.status, "hit");
  if (cached.status === "hit" || cached.status === "stale") {
    assert.equal(cached.title, "Extension Setup");
    assert.match(cached.content, /appropriate to the workspace/);
    assert.deepEqual(cached.tags, ["vs code", "extensions"]);
  }

  const matches = await searchCachedKnowledge(
    "extension host workspace",
    5,
    root,
  );
  assert.equal(matches[0]?.url, "https://example.com/guides/extensions");
});

test("caches negative results and preserves a useful entry after a failed revisit", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vscodeagent-knowledge-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const brokenUrl = "https://broken.example/missing";
  await storeKnowledgeResult(
    {
      url: brokenUrl,
      source: "firecrawl_scrape",
      outcome: "broken",
      note: "The source returned HTTP 404.",
    },
    root,
  );
  const negative = await readCachedKnowledge(brokenUrl, root);
  assert.equal(negative.status, "negative-hit");
  if (
    negative.status === "negative-hit" ||
    negative.status === "negative-stale"
  ) {
    assert.equal(negative.outcome, "broken");
    assert.match(negative.note, /404/);
    assert.ok(Date.parse(negative.expiresAt) > Date.now());
  }

  const usefulUrl = "https://example.com/guide";
  await storeKnowledgeResult(
    {
      url: usefulUrl,
      source: "firecrawl_scrape",
      outcome: "cached",
      title: "Useful Guide",
      content: "A useful retained summary.",
    },
    root,
  );
  await storeKnowledgeResult(
    {
      url: usefulUrl,
      source: "firecrawl_scrape",
      outcome: "blocked",
      note: "A later refresh was blocked.",
    },
    root,
  );
  const retained = await readCachedKnowledge(usefulUrl, root);
  assert.equal(retained.status, "hit");
  if (retained.status === "hit" || retained.status === "stale") {
    assert.match(retained.content, /useful retained summary/);
    assert.equal(retained.lastFailure?.outcome, "blocked");
  }

  const concurrentUrl = "https://example.com/concurrent-guide";
  await Promise.all([
    storeKnowledgeResult(
      {
        url: concurrentUrl,
        source: "firecrawl_scrape",
        outcome: "cached",
        title: "Concurrent Guide A",
        content: "First concurrent write.",
      },
      root,
    ),
    storeKnowledgeResult(
      {
        url: concurrentUrl,
        source: "firecrawl_scrape",
        outcome: "cached",
        title: "Concurrent Guide B",
        content: "Second concurrent write.",
      },
      root,
    ),
  ]);
  const concurrent = await readCachedKnowledge(concurrentUrl, root);
  assert.equal(concurrent.status, "hit");
  if (concurrent.status === "hit" || concurrent.status === "stale") {
    assert.match(concurrent.content, /concurrent write/);
  }
});
