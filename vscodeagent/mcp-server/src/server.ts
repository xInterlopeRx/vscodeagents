import { fileURLToPath } from "node:url";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fetchOfficialDocument,
  listCachedOfficialDocuments,
  listOfficialSources,
  readCachedOfficialDocument,
  searchCachedOfficialDocuments,
} from "./cache.js";
import { listDocuments, readDocument, searchDocuments } from "./docs.js";
import { OFFICIAL_DOC_SOURCES } from "./sources.js";

const defaultDocsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs",
);

export function createDocsServer(
  docsDirectory = process.env.VSCA_DOCS_DIR
    ? path.resolve(process.env.VSCA_DOCS_DIR)
    : defaultDocsDirectory,
): McpServer {
  const server = new McpServer({
    name: "vscodeagent-docs",
    version: "0.1.0",
  });

  server.registerTool(
    "list_vscode_docs",
    {
      title: "List local VS Code documentation",
      description: "List available Markdown documents in the local VS Code-agent documentation pack.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ limit }) => {
      const [localDocuments, cachedDocuments] = await Promise.all([
        listDocuments(docsDirectory, 100),
        listCachedOfficialDocuments(),
      ]);
      const documents = [
        ...localDocuments.map((document) => ({ ...document, source: "local" })),
        ...cachedDocuments,
      ]
        .sort((left, right) => left.path.localeCompare(right.path))
        .slice(0, limit ?? 100);
      return {
        content: [{ type: "text", text: JSON.stringify(documents, null, 2) }],
      };
    },
  );

  server.registerTool(
    "search_vscode_docs",
    {
      title: "Search local VS Code documentation",
      description: "Search local Markdown guidance about VS Code, extensions, settings, and MCP.",
      inputSchema: {
        query: z.string().trim().min(2).max(200),
        limit: z.number().int().min(1).max(20).optional(),
      },
    },
    async ({ query, limit }) => {
      const [localResults, cachedResults] = await Promise.all([
        searchDocuments(docsDirectory, query, limit),
        searchCachedOfficialDocuments(query, limit),
      ]);
      const results = [...localResults, ...cachedResults]
        .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
        .slice(0, limit ?? 5);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  server.registerTool(
    "read_vscode_doc",
    {
      title: "Read a local VS Code document",
      description: "Read a Markdown document by its relative path from list_vscode_docs or search_vscode_docs.",
      inputSchema: {
        path: z.string().min(1).max(500),
      },
    },
    async ({ path: requestedPath }) => {
      if (requestedPath.startsWith("official:")) {
        const sourceId = requestedPath.slice("official:".length);
        const document = await readCachedOfficialDocument(sourceId);
        return {
          content: [{
            type: "text",
            text: [
              `# ${document.title}`,
              `Source: ${document.pageUrl}`,
              `Cache status: ${document.cacheStatus} (${document.cachedAt})`,
              `Attribution: ${document.attribution}`,
              `License: ${document.license} (${document.licenseUrl})`,
              `SHA-256: ${document.sha256}`,
              "",
              document.content,
            ].join("\n"),
          }],
        };
      }
      const document = await readDocument(docsDirectory, requestedPath);
      return {
        content: [{
          type: "text",
          text: `# ${document.title}\n\nPath: ${document.path}\n\n${document.content}`,
        }],
      };
    },
  );

  server.registerTool(
    "list_official_vscode_doc_sources",
    {
      title: "List approved official VS Code documentation sources",
      description: "List the fixed allowlist of official documentation sources and their local cache status.",
      inputSchema: {
        cached_only: z.boolean().optional(),
      },
    },
    async ({ cached_only }) => {
      const sources = await listOfficialSources();
      const filteredSources = cached_only
        ? sources.filter((source) => source.cached)
        : sources;
      return {
        content: [{ type: "text", text: JSON.stringify(filteredSources, null, 2) }],
      };
    },
  );

  const sourceIds = OFFICIAL_DOC_SOURCES.map(({ id }) => id) as [
    (typeof OFFICIAL_DOC_SOURCES)[number]["id"],
    ...(typeof OFFICIAL_DOC_SOURCES)[number]["id"][],
  ];
  server.registerTool(
    "fetch_official_vscode_doc",
    {
      title: "Fetch or refresh a cached official VS Code document",
      description: "Fetch one document from the fixed official-source catalog, cache it locally, and return its source, license, freshness, and content. Arbitrary URLs are not accepted.",
      inputSchema: {
        source_id: z.enum(sourceIds),
        refresh: z.boolean().optional(),
      },
    },
    async ({ source_id, refresh }) => {
      const document = await fetchOfficialDocument(source_id, refresh);
      const warning = document.refreshError
        ? `Refresh failed; serving stale cached content. Error: ${document.refreshError}\n\n`
        : "";
      return {
        content: [{
          type: "text",
          text: [
            warning,
            `# ${document.title}`,
            `Source: ${document.pageUrl}`,
            `Cache status: ${document.cacheStatus} (${document.cachedAt})`,
            `Attribution: ${document.attribution}`,
            `License: ${document.license} (${document.licenseUrl})`,
            `SHA-256: ${document.sha256}`,
            "",
            document.content,
          ].join("\n"),
        }],
        ...(document.refreshError ? { isError: true } : {}),
      };
    },
  );

  return server;
}
