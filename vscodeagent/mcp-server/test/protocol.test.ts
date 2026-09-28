import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("serves documentation tools over MCP stdio", async (context) => {
  const projectRoot = process.cwd();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, "mcp-server", "dist", "index.js"), "stdio"],
    cwd: projectRoot,
    stderr: "pipe",
  });
  const client = new Client({
    name: "vscodeagent-mcp-test",
    version: "0.1.0",
  });
  context.after(() => client.close());

  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    [
      "fetch_official_vscode_doc",
      "list_official_vscode_doc_sources",
      "list_vscode_docs",
      "read_vscode_doc",
      "search_vscode_docs",
    ],
  );

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
});
