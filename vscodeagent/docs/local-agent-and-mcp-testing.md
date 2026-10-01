# Using and Testing the VS Code Specialist Agent

This guide covers setup and local testing of the workspace agent, its skills, and the documentation MCP server in GitHub Copilot CLI and VS Code. It is written for contributors and users opening this project locally. Remote deployment is a separate task; see [MCP architecture](./mcp-architecture.md).

## What is included

| Component                    | Location                                    | Purpose                                                                                                                     |
| ---------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| VS Code specialist agent     | `.github/agents/vscode-specialist.agent.md` | Reusable instructions for extension, settings, and developer-tool workflows.                                                |
| Project skills               | `.github/skills/`                           | Detailed extension workflow, settings management, and tool evaluation procedures.                                           |
| Workspace MCP configuration  | `.mcp.json`                                 | Starts the local documentation server over stdio for supported clients.                                                     |
| MCP implementation           | `mcp-server/src/`                           | Lists, searches, and reads local guides, approved cached VS Code documentation, and locally retained filtered web research. |
| Local guides                 | `docs/`                                     | Project-authored guidance, available offline.                                                                               |
| Official documentation cache | `.cache/vscodeagent-docs/`                  | Untracked cache of documents from the fixed official-source catalog.                                                        |

The agent is not a VS Code extension and does not need to be installed from the Marketplace. The workspace configuration starts a local Node.js process; that documentation MCP server does not install extensions or edit VS Code settings. Separately, when the specialist runs in VS Code with its built-in tools available, it can inspect/edit files, run terminal commands, manage extensions, and invoke VS Code commands.

### Approval boundary for VS Code actions

The specialist's default target is the active WSL workspace and its WSL extension host. Verify the active VS Code instance, profile, and extension host before changing anything. Ask for separate explicit approval before each settings write, extension install/removal/upgrade, side-effecting command, terminal mutation, or extension test run. Report the setting scope/key/value or extension publisher/ID/version, target host, and expected effects. Tool availability does not bypass VS Code's own approval prompts. Prefer a disposable Extension Development Host or test profile for tests that execute extension code; never silently use the Windows-local extension host or another remote host.

## Requirements

- Node.js 22 or later and npm.
- A trusted checkout of this workspace.
- GitHub Copilot CLI for CLI testing, or a compatible VS Code installation with GitHub Copilot Chat for VS Code testing.
- Copilot authentication and available usage for tests that send a prompt to a model.

For a fresh checkout, install dependencies and build the MCP server:

```sh
npm ci
npm run build
```

The generated `mcp-server/dist/` directory is ignored and should not be committed. To run the build and automated test suite together:

```sh
npm run check
```

The protocol test starts the stdio server as an MCP client would, checks the advertised tools, and exercises list, search, and read requests. A passing build or protocol test verifies the server independently; it does not prove that a particular VS Code profile or Copilot CLI session has loaded the workspace configuration.

## Workspace configuration and tools

The root `.mcp.json` configures the server using the portable `mcpServers` format:

```json
{
  "mcpServers": {
    "vscodeagent-docs": {
      "type": "stdio",
      "command": "node",
      "args": ["./mcp-server/dist/index.js", "stdio"]
    }
  }
}
```

Clients start the process when needed and exchange MCP messages over standard input/output. Build first so the configured JavaScript entry point exists. This project uses the root `.mcp.json`; do not create a duplicate `.vscode/mcp.json` for this setup. VS Code and Copilot CLI have different configuration options, but both support this portable workspace file.

The server exposes these tools:

| Tool                               | Use                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `list_vscode_docs`                 | List local guides and cached official documents. An optional `limit` is from 1 to 100.                                                 |
| `search_vscode_docs`               | Search local and cached Markdown. `query` must be 2-200 characters; optional `limit` is from 1 to 20.                                  |
| `read_vscode_doc`                  | Read a document by the relative path returned from list/search, or a cached official document identifier using the `official:` prefix. |
| `list_official_vscode_doc_sources` | List the fixed approved official-source catalog and cache status.                                                                      |
| `fetch_official_vscode_doc`        | Fetch or refresh a selected catalog entry. This may access the network and update the local cache. Arbitrary URLs are not accepted.    |
| `search_cached_vscode_knowledge`   | Search local filtered Firecrawl summaries. This tool never accesses the network.                                                       |
| `read_cached_vscode_knowledge`     | Look up a URL and report fresh, stale, negative, or missing cache status. This tool never accesses the network.                        |
| `store_vscode_knowledge`           | Store a concise filtered result or a negative URL outcome locally. This tool never fetches the URL.                                    |

For a basic local smoke test, use `list_vscode_docs`, `search_vscode_docs`, and `read_vscode_doc`. To exercise the knowledge cache, store a short test summary, read it by URL, search for its text, and record a negative test URL; the protocol test covers both positive and negative entries. Avoid `fetch_official_vscode_doc` unless you specifically intend to refresh an approved source.

## Test in GitHub Copilot CLI

Run CLI commands from the workspace root:

```sh
copilot mcp list
copilot mcp get vscodeagent-docs
copilot skill list
```

These commands check configuration and skill discovery. They do not, by themselves, prove that a server process started or that its tools are available in a particular prompt session.

For an interactive test:

1. Review `.mcp.json` and the server entry point before trusting the workspace. Local MCP servers execute commands on the machine running the client.
2. Start Copilot CLI in this workspace. If the workspace is untrusted, follow the CLI's trust flow only after reviewing the configuration.
3. Run `/env` and verify that the expected project agent, skills, and `vscodeagent-docs` server are loaded. Run `/mcp` to inspect MCP server configuration and controls.
4. Select the `vscode-specialist` agent with `/agent vscode-specialist`, or start a session with `copilot --agent vscode-specialist`.
5. Ask a cache-first question, for example:

> Search the local VS Code guides and cached knowledge for extension-host settings first. If there is no suitable fresh result, explain what source needs checking before using any web tool. Do not fetch official documents or scrape pages for this check.

6. Confirm in the session that the MCP tool was actually invoked and returned the expected path. A model response that merely describes the tools is not a successful MCP test.

For non-interactive use, consult `copilot --help` for the installed CLI version. `--available-tools` can restrict which tools the model sees, and `--allow-tool` can pre-approve specific tools. Prefer an explicit tool allowlist over broad permissions such as `--allow-all-tools`, `--allow-all`, or `--yolo`. Credit limits, authentication, and permission behavior depend on the installed CLI and account.

If `copilot mcp list` shows the server but `/env` or a prompt does not, treat that as a runtime/loading issue rather than proof of a working connection. Confirm the CLI was launched in this workspace, verify workspace trust and server enablement, inspect `/mcp` and `/env`, and check that `npm run build` succeeded. Do not change global MCP configuration merely to work around a workspace issue.

## Test in VS Code

No user-level or remote settings change is required for the workspace configuration. Before testing, identify the exact VS Code version, active profile, workspace folder, operating system, and extension host. In WSL, SSH, and Dev Container windows, distinguish the machine running the UI from the machine running the workspace/server process.

1. Open this project folder in the intended VS Code instance and profile.
2. Review `.mcp.json` and trust the workspace only if you are comfortable running its local Node.js server.
3. Run `npm run build` if `mcp-server/dist/index.js` is missing.
4. In the Command Palette, run **MCP: List Servers**. Select `vscodeagent-docs`, start it if needed, and use **Show Output** to inspect startup errors.
5. Open Copilot Chat or the Agent view and select `vscode-specialist` from the agent picker.
6. Ask the same read-only list/search/read question used for the CLI test and verify that the expected MCP tool call and document path appear.

For a remote workspace, verify that Node.js is installed on the host where VS Code starts the workspace MCP server, and inspect that host's MCP output. Do not assume a local terminal's Node installation, VS Code CLI, or settings control a remote extension host. Do not install, remove, or upgrade extensions as part of this workspace smoke test.

## Troubleshooting

| Symptom                                                  | Checks                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build reports a missing dependency or Node version       | Confirm Node.js is 22 or newer. On a fresh checkout, run `npm ci`, then `npm run build`.                                                                                                                                     |
| MCP server does not start                                | Confirm the workspace root is open, `mcp-server/dist/index.js` exists, and `node` is available on the process host. In VS Code, inspect **MCP: List Servers** > **Show Output**.                                             |
| CLI does not list `vscodeagent-docs`                     | Run the CLI from the workspace root and inspect `.mcp.json`; check workspace trust and `copilot mcp list`.                                                                                                                   |
| CLI lists the server but a session cannot call its tools | Inspect `/env` and `/mcp` in that session. Configuration discovery is not the same as a successful server start or tool call. Check the exact tool allowlist, workspace trust, and CLI output before changing configuration. |
| Agent is missing from a picker                           | Confirm `.github/agents/vscode-specialist.agent.md` is in the opened workspace and select the expected agent harness/profile. In CLI, try `/agent vscode-specialist`.                                                        |
| Local documentation is missing or stale                  | Local project guides should work offline. Check the selected path and server output. Cached official documents can be revalidated only through the fixed source catalog; a fetch may require network access.                 |
| Results differ between local and remote windows          | Record the active profile and extension host, then verify files, Node.js, trust, and MCP output on the machine that runs the workspace server.                                                                               |

## Security and scope

- Review the command in `.mcp.json` and the MCP implementation before trusting or starting a local server.
- Local docs and knowledge search/read/store tools operate only on local files. The official-document fetch tool makes network requests only to the fixed allowlist. Firecrawl search/scrape are separate network tools; use the local cache first and store only filtered summaries or factual negative outcomes under the ignored `.cache/` directory.
- Do not put credentials in `.mcp.json`, commit cache contents, or add arbitrary-URL fetching.
- This guide covers local stdio use only. HTTP deployment, non-loopback access, tokens, and remote-client configuration require separate review; see [MCP architecture](./mcp-architecture.md).
- ByteHarder/Hermes integration belongs to the separate ByteHarder project and is not part of local testing.

## Official references

- [VS Code MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [VS Code custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents)
- [VS Code agent skills](https://code.visualstudio.com/docs/agent-customization/agent-skills)
- [GitHub Copilot CLI custom agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)
- [GitHub Copilot CLI MCP servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
