import { createServer, type IncomingMessage } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createDocsServer } from "./server.js";
import {
  buildAllowedOrigins,
  isAllowedOrigin,
  isAuthorizedHeader,
  validateHttpConfig,
} from "./http-security.js";

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://localhost").pathname;
}

export async function startHttpServer(
  createServerInstance: () => McpServer = createDocsServer,
): Promise<void> {
  const host = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
  const port = Number(process.env.MCP_HTTP_PORT ?? "3100");
  const token = process.env.MCP_AUTH_TOKEN;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MCP_HTTP_PORT must be an integer from 1 to 65535.");
  }
  validateHttpConfig(host, token);
  const allowedOrigins = buildAllowedOrigins(
    host,
    port,
    process.env.MCP_ALLOWED_ORIGINS,
  );

  const httpServer = createServer(async (request, response) => {
    let pathname: string;
    try {
      pathname = requestPath(request);
    } catch {
      response.writeHead(400).end("Invalid request URL.");
      return;
    }

    if (request.method === "GET" && pathname === "/healthz") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("ok");
      return;
    }

    if (pathname === "/mcp" && request.method === "OPTIONS") {
      const origin = request.headers.origin;
      if (!isAllowedOrigin(origin, allowedOrigins)) {
        response.writeHead(403).end("Origin is not allowed.");
        return;
      }
      response.writeHead(204, {
        ...(origin ? { "access-control-allow-origin": origin } : {}),
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, accept",
        vary: "Origin",
      }).end();
      return;
    }

    if (pathname !== "/mcp") {
      response.writeHead(404).end("Not found.");
      return;
    }

    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" }).end("Only POST is supported on /mcp.");
      return;
    }

    const origin = request.headers.origin;
    if (!isAllowedOrigin(origin, allowedOrigins)) {
      response.writeHead(403).end("Origin is not allowed.");
      return;
    }

    if (!isAuthorizedHeader(request.headers.authorization, token)) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "www-authenticate": 'Bearer realm="vscodeagent-mcp"',
      }).end("Unauthorized.");
      return;
    }

    if (origin) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "Origin");
    }

    const mcpServer = createServerInstance();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    response.once("close", () => {
      void transport.close().catch((error: unknown) => {
        console.error("Failed to close MCP HTTP transport:", error);
      });
      void mcpServer.close().catch((error: unknown) => {
        console.error("Failed to close MCP server:", error);
      });
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error("MCP HTTP request failed:", error);
      if (!response.headersSent) {
        response.writeHead(500).end("MCP request failed.");
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  console.error(`VS Code documentation MCP listening on http://${host}:${port}/mcp`);
}
