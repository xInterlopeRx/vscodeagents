# Documentation MCP Architecture

The MCP server searches Markdown in this repository's `docs/` directory, caches selected official VS Code documentation, and maintains a local knowledge cache for filtered web research explicitly submitted by the agent. It provides tools to list, search, read, refresh approved official documents, and search, read, or store local knowledge entries. It does not install extensions, edit settings, run arbitrary commands, or fetch arbitrary URLs.

Official sources are selected from a fixed catalog. Cache entries retain their upstream URL, official page URL, attribution, license, SHA-256, fetch time, and conditional request headers. Fresh entries are served locally for seven days; stale entries are revalidated with ETag/Last-Modified where possible. The cache is kept under `.cache/` and is not committed. A failed refresh is reported, and an existing stale copy is clearly marked rather than presented as current.

## Local knowledge cache

The `search_cached_vscode_knowledge`, `read_cached_vscode_knowledge`, and `store_vscode_knowledge` tools operate only on local files under `.cache/vscodeagent-docs/knowledge/`; none of them access the network. The agent checks this cache before using the separate Firecrawl MCP for general web research, and checks a known URL before scraping it.

Entries are keyed by canonical HTTP(S) URL and retain the source URL, Firecrawl operation, title, filtered Markdown summary, topic tags, SHA-256, and timestamps. Useful entries are fresh for 30 days. Broken, blocked, and irrelevant URLs are retained as negative results for 24 hours to avoid immediate repeat attempts. A failed revisit to a useful page records the failure while preserving the last useful content. Expired entries are marked stale rather than silently treated as current.

Store concise, factual notes that answer the research question, not full scraped page dumps. Preserve source URLs for citations and exclude credentials, secrets, and personal data. Add topic/query synonyms as tags to improve future cache hits. This cache is a persistent local knowledge base, not model training or shared source documentation.

## Client formats

- The root `.mcp.json` uses the portable `mcpServers` format for stdio, supported by VS Code and Copilot CLI.
- VS Code's `.vscode/mcp.json` uses a different `servers` format; Copilot CLI does not read that file. Keep the portable project config as the shared baseline.
- Copilot CLI loads project MCP configuration only in a trusted workspace.

## Local and remote modes

Stdio is the default for local workspace use. Streamable HTTP is available for later remote deployment. HTTP mode binds to `127.0.0.1:3100` by default. A non-loopback bind requires `MCP_AUTH_TOKEN` with at least 32 characters and serves MCP at `/mcp`. Browser `Origin` headers must match the bind host or an exact `MCP_ALLOWED_ORIGINS` entry. `/healthz` returns only a basic readiness response.

Do not expose the service on a LAN or public interface without a protected network path and bearer authentication. Never commit a token or put it in a shared project config. Remote client configuration should be done in each client's secure configuration after deployment details are reviewed.

The server has not yet been installed on `operatorx`. Initial SSH deployment/testing and later ByteHarder/Hermes integration are separate TODO items.

References: [VS Code MCP configuration](https://code.visualstudio.com/docs/agent-customization/mcp-servers), [Copilot CLI MCP configuration](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers), and [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/).
