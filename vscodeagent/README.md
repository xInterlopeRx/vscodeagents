# VS Code Agent

A portable VS Code specialist agent for GitHub Copilot in VS Code and Copilot CLI, with a read-only MCP server for local Markdown documentation.

## Project scope

The agent's workflows cover:

- Installing, diagnosing, developing, testing, and evaluating VS Code extensions.
- Inspecting and safely changing VS Code settings across local Windows/Linux, WSL, and remote extension hosts.
- Recommending tools and extensions based on compatibility, publisher, maintenance, permissions, and evidence.

The workspace custom agent lives in `.github/agents/`; reusable workflows live in `.github/skills/`. The same Markdown agent and skills are intended to work across supported Copilot clients.

## Documentation MCP and local cache

The MCP server searches Markdown under `docs/` and an untracked local cache of selected official VS Code documentation. It exposes `list_vscode_docs`, `search_vscode_docs`, `read_vscode_doc`, `list_official_vscode_doc_sources`, and `fetch_official_vscode_doc`.

The official source catalog is fixed to Microsoft’s public VS Code documentation repository. A cache miss fetches the selected source; fresh entries are served locally for seven days, then revalidated with ETag/Last-Modified when available. Cached entries retain the official page URL, upstream URL, attribution, license, fetch time, and SHA-256. Downloaded docs and cache metadata live under `.cache/` and are gitignored. The initial project-authored guides remain available offline.

Requirements: Node.js 22 or later.

```sh
npm install
npm run build
npm test
```

The root `.mcp.json` configures the server over stdio for VS Code and Copilot CLI. Build the project before the first client launch. For local manual testing, run `npm run mcp:stdio`. Use the `fetch_official_vscode_doc` tool to populate or refresh the local cache; it cannot fetch arbitrary URLs.

See the [local agent and MCP testing guide](docs/local-agent-and-mcp-testing.md) for setup, client smoke tests, troubleshooting, and security boundaries.

The server also supports Streamable HTTP for later remote use. It listens on `127.0.0.1:3100` by default. A non-loopback bind requires `MCP_AUTH_TOKEN` with at least 32 characters. Browser `Origin` headers are restricted to the bind host or exact origins in `MCP_ALLOWED_ORIGINS`. The HTTP endpoint is `/mcp`; `/healthz` is a minimal unauthenticated health check. Remote deployment and client configuration are tracked in `TODO.md`; no server is currently installed on `operatorx`.

## Container deployment

`deploy/vscode-docs-mcp/` contains a multi-stage Docker build and a dedicated Compose project for the HTTP server. The container runs as the unprivileged Node user with a read-only root filesystem, a 256 MiB memory limit, and a persistent volume only for the official-doc cache. Compose publishes to loopback by default; set `MCP_PUBLISHED_HOST` to a specific LAN interface only when remote access is intended, and provide a private `MCP_AUTH_TOKEN` of at least 32 characters. Put TLS or a protected VPN/tunnel in front of LAN access. Copy `.env.example` to `.env` for a deployment; never commit `.env`. See the [container deployment guide](deploy/vscode-docs-mcp/README.md) for versioned GHCR images and release instructions.

From this directory, build and run the isolated project with `docker compose -f deploy/vscode-docs-mcp/compose.yaml up -d --build`; inspect it with `docker compose -f deploy/vscode-docs-mcp/compose.yaml ps` and stop it with `docker compose -f deploy/vscode-docs-mcp/compose.yaml down`. The current Ansible DevTools MCP package is stdio-only; its packaged `--ws` option reports WebSocket support unavailable. A stdio-to-Streamable-HTTP gateway is required for remote HTTP clients.

## Project context

- `AGENTS.md` contains contributor and operational safety guidance.
- `TODO.md` tracks implementation, initial SSH testing on `192.168.100.200`, and the later separate ByteHarder/Hermes integration.
- `docs/` contains the initial local knowledge pack and its official source links.

Keep credentials out of the repository. Do not configure the future Hermes connection here; that belongs in the separate ByteHarder project after initial testing.
