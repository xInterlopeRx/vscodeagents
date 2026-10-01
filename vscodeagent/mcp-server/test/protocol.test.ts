import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("serves documentation tools over MCP stdio", async (context) => {
  const projectRoot = process.cwd();
  const cacheDirectory = await mkdtemp(
    path.join(os.tmpdir(), "vscodeagent-protocol-cache-"),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, "mcp-server", "dist", "index.js"), "stdio"],
    cwd: projectRoot,
    env: { VSCA_CACHE_DIR: cacheDirectory },
    stderr: "pipe",
  });
  const client = new Client({
    name: "vscodeagent-mcp-test",
    version: "0.1.0",
  });
  context.after(async () => {
    await client.close();
    await rm(cacheDirectory, { recursive: true, force: true });
  });

  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "fetch_official_vscode_doc",
    "list_official_vscode_doc_sources",
    "list_vscode_docs",
    "read_cached_vscode_knowledge",
    "read_vscode_doc",
    "search_cached_vscode_knowledge",
    "search_vscode_docs",
    "store_vscode_knowledge",
  ]);

  const listResult = await client.callTool({
    name: "list_vscode_docs",
    arguments: {},
  });
  assert.equal(listResult.isError, undefined);
  assert.match(JSON.stringify(listResult), /mcp-architecture\.md/);

  const searchResult = await client.callTool({
    name: "search_vscode_docs",
    arguments: { query: "extension settings" },
  });
  assert.equal(searchResult.isError, undefined);
  assert.match(JSON.stringify(searchResult), /extension-workflow\.md/);

  const readResult = await client.callTool({
    name: "read_vscode_doc",
    arguments: { path: "mcp-architecture.md" },
  });
  assert.equal(readResult.isError, undefined);
  assert.match(JSON.stringify(readResult), /Documentation MCP Architecture/);

  const storeResult = await client.callTool({
    name: "store_vscode_knowledge",
    arguments: {
      url: "https://example.com/vscode-guide?utm_source=protocol",
      source: "firecrawl_scrape",
      outcome: "cached",
      title: "Cached VS Code Guide",
      content: "Workspace guides describe local settings and MCP tools.",
      tags: ["VS Code", "MCP"],
    },
  });
  assert.equal(storeResult.isError, undefined);

  const cachedRead = await client.callTool({
    name: "read_cached_vscode_knowledge",
    arguments: { url: "https://example.com/vscode-guide#section" },
  });
  assert.equal(cachedRead.isError, undefined);
  const cachedReadText = cachedRead.content.find(
    (item) => item.type === "text",
  );
  assert.ok(cachedReadText && cachedReadText.type === "text");
  const cachedEntry = JSON.parse(cachedReadText.text) as {
    status: string;
    content: string;
  };
  assert.equal(cachedEntry.status, "hit");
  assert.match(cachedEntry.content, /Workspace guides describe/);

  const cachedSearch = await client.callTool({
    name: "search_cached_vscode_knowledge",
    arguments: { query: "workspace guides MCP" },
  });
  assert.equal(cachedSearch.isError, undefined);
  assert.match(
    JSON.stringify(cachedSearch),
    /https:\/\/example\.com\/vscode-guide/,
  );

  const failureResult = await client.callTool({
    name: "store_vscode_knowledge",
    arguments: {
      url: "https://example.com/broken-guide",
      source: "firecrawl_scrape",
      outcome: "broken",
      note: "The source returned HTTP 404.",
    },
  });
  assert.equal(failureResult.isError, undefined);

  const negativeRead = await client.callTool({
    name: "read_cached_vscode_knowledge",
    arguments: { url: "https://example.com/broken-guide" },
  });
  assert.equal(negativeRead.isError, undefined);
  const negativeReadText = negativeRead.content.find(
    (item) => item.type === "text",
  );
  assert.ok(negativeReadText && negativeReadText.type === "text");
  const negativeEntry = JSON.parse(negativeReadText.text) as { status: string };
  assert.equal(negativeEntry.status, "negative-hit");
});
