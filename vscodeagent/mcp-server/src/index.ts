import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDocsServer } from "./server.js";
import { startHttpServer } from "./http.js";

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "stdio";

  if (mode === "stdio") {
    const server = createDocsServer();
    await server.connect(new StdioServerTransport());
    return;
  }
  if (mode === "http") {
    await startHttpServer(createDocsServer);
    return;
  }
  throw new Error(`Unsupported MCP transport "${mode}". Use "stdio" or "http".`);
}

main().catch((error: unknown) => {
  console.error("VS Code documentation MCP server failed:", error);
  process.exitCode = 1;
});
