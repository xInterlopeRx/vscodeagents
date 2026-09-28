# Repository instructions

## Build, test, and run

Run commands from the repository root. The MCP server requires Node.js 22 or later.

```sh
npm ci
npm run build
npm test
npm run check
```

`npm run check` runs the TypeScript build followed by the full Node test suite. To run one test by name:

```sh
npx tsx --test --test-name-pattern='serves documentation tools over MCP stdio' mcp-server/test/protocol.test.ts
```

The available server entry points are `npm run mcp:stdio` and `npm run mcp:dev:stdio` for stdio, and `npm run mcp:http` and `npm run mcp:dev:http` for Streamable HTTP. The compiled stdio entry point requires `npm run build` first. There is no lint script in `package.json`.

## Architecture

This project combines shared Markdown agent/skill instructions with a TypeScript documentation MCP server. `.github/agents/vscode-specialist.agent.md` defines the reusable specialist; `.github/skills/` contains focused workflows. The root `.mcp.json` starts the server over stdio for Copilot CLI and VS Code.

`mcp-server/src/index.ts` selects stdio or HTTP transport, and `server.ts` registers the MCP tools. Local document listing, search, and reads are implemented in `docs.ts` and confined to Markdown under `docs/`. `sources.ts` is the fixed official-document catalog; `cache.ts` fetches only those sources and stores content with attribution, license, timestamps, and SHA-256 metadata in `.cache/vscodeagent-docs/`. HTTP transport lives in `http.ts`, with bind, token, and Origin checks in `http-security.ts`.

## Repository-specific conventions

- Keep the official documentation source set fixed; do not add arbitrary-URL fetching. `cache.ts` revalidates stale entries after seven days and preserves source/page URLs, attribution, license, hash, fetch time, and freshness metadata. Do not commit `.cache/` contents.
- Preserve path confinement in `docs.ts`: local reads must resolve to Markdown files inside the documentation root.
- Keep the root `.mcp.json` as the shared workspace configuration; do not add a duplicate `.vscode/mcp.json`. Copilot CLI loads project MCP configuration only in a trusted workspace.
- Stdio uses stdout for MCP protocol messages; send diagnostics to stderr so they cannot corrupt the protocol stream.
- HTTP binds to loopback by default. Non-loopback binds require `MCP_AUTH_TOKEN` with at least 32 characters. Origin checks allow the bind-host origin or an exact `MCP_ALLOWED_ORIGINS` entry. Never commit or log tokens.
- Before VS Code settings or extension changes, identify the exact instance, profile, workspace, and extension host. Preserve JSONC and unrelated settings; do not install, remove, upgrade, or change user/remote settings without approval.
- Keep remote deployment on `operatorx` and future ByteHarder/Hermes integration separate from local work. The latter is tracked in `TODO.md` and should begin only after MCP testing and an explicit user request.
- Read `README.md`, `TODO.md`, and task-relevant `docs/` material before project changes; check docs against source and configuration. Run `npm run check` after server or agent-supporting code changes. For documentation-only changes, inspect the changes and run `git diff --check`.

See [AGENTS.md](../AGENTS.md) for the full project safety and validation guidance, [README.md](../README.md) for setup, and [MCP architecture](../docs/mcp-architecture.md) for client formats and deployment boundaries.
