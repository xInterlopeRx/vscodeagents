# Local Documentation Pack

The MCP server indexes Markdown files under this directory and caches selected official source pages under `.cache/` at the project root. The initial pack contains concise, project-authored workflows and links to official sources; it is not a bundled mirror of those sources.

The approved upstream source set is the `microsoft/vscode-docs` repository. Its `LICENSE.md` states that documentation is licensed under CC BY 3.0 US. Cached pages retain their source URLs, attribution, license, retrieval time, and SHA-256; product template placeholders are normalized for search. This pack contains project-authored guides and links to official sources, not a bundled mirror of upstream documentation.

## Project guides

- [Local agent and MCP testing](./local-agent-and-mcp-testing.md) - install dependencies, build, test, and troubleshoot the workspace agent and documentation server in Copilot CLI and VS Code.
- [Documentation MCP architecture](./mcp-architecture.md) - server modes, cache behavior, and security boundaries.
- [Extension workflow](./extension-workflow.md) - inspect, develop, test, and troubleshoot VS Code extensions.
- [Settings management](./settings-management.md) - identify and safely verify settings across local and remote hosts.

## References

- [VS Code custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents)
- [VS Code agent skills](https://code.visualstudio.com/docs/agent-customization/agent-skills)
- [VS Code MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [VS Code settings](https://code.visualstudio.com/docs/configure/settings)
- [VS Code extension API overview](https://code.visualstudio.com/api)
- [VS Code extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [GitHub Copilot CLI custom agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)
- [GitHub Copilot CLI MCP servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/)

The source content is date-sensitive. Verify product-specific behavior against the linked official documentation before recommending or applying changes.
