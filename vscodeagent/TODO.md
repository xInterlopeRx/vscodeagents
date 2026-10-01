# TODO

## Initial project

- [ ] Create the portable VS Code specialist agent and focused skills for extension and settings workflows.
- [ ] Build the local documentation MCP server and curate official VS Code, extension API, and MCP sources.
- [ ] Test the agent and MCP configuration with VS Code and GitHub Copilot CLI.
- [ ] Install the MCP server on `192.168.100.200` over SSH for initial testing, then verify remote client connectivity.

## After initial MCP testing

- [ ] Add MCP server deployment/configuration to the separate ByteHarder Ansible project.
- [ ] Configure the ByteHarder Hermes Agent role to connect to the MCP server during playbook runs.

## Ongoing

- [ ] Verify the specialist's write-capable VS Code tools and per-action approval flow in a real WSL-hosted VS Code Copilot session; the current Node/MCP checks do not validate VS Code built-in tool availability.
- [ ] Add tested workflows for extension installation/debugging/development and local/remote VS Code settings on Windows and Linux.
- [ ] Maintain evidence-based recommendations for extensions and developer tools.
