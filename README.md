# vscodeagents

This repository contains portable GitHub Copilot agent resources for Visual Studio Code. The current project is [`vscodeagent/`](vscodeagent/README.md), which includes the VS Code specialist agent, reusable skills, and a local documentation MCP server.

## Requirements and quick start

Use Node.js 22 or later with npm:

```sh
cd vscodeagent
npm ci
npm run build
npm run check
```

See the [project README](vscodeagent/README.md), [local agent and MCP testing guide](vscodeagent/docs/local-agent-and-mcp-testing.md), and [repository Copilot instructions](vscodeagent/.github/copilot-instructions.md) for setup and development details.
