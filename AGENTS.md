# Repository guidance

- The project is in `vscodeagent/`; run Node/npm commands from that directory. It requires Node.js 22+.
- After server or agent-support code changes, run `npm run check` (TypeScript build, then the Node test suite). For one protocol test, use `npx tsx --test --test-name-pattern='serves documentation tools over MCP stdio' mcp-server/test/protocol.test.ts` from `vscodeagent/`.
- The `.mcp.json` stdio configuration launches `mcp-server/dist/index.js`; run `npm run build` before a client starts it after a clean checkout. `mcp-server/dist/` is generated and ignored.
- MCP documentation fetches must use the fixed catalog in `mcp-server/src/sources.ts`; do not add arbitrary-URL fetching. Local docs are confined to Markdown under `docs/`. Keep `.cache/` content untracked.
- HTTP mode binds to loopback by default. Non-loopback binds require `MCP_AUTH_TOKEN` (at least 32 characters); do not commit or log tokens.
- Read `vscodeagent/AGENTS.md` and relevant docs before changes involving VS Code settings/extensions, MCP security, or remote deployment. Remote deployment and ByteHarder/Hermes integration are separate work; the latter requires MCP testing and an explicit request.
