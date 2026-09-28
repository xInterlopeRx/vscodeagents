export const OFFICIAL_DOC_SOURCES = [
  {
    id: "custom-agents",
    title: "Custom agents in VS Code",
    pageUrl: "https://code.visualstudio.com/docs/agent-customization/custom-agents",
    rawUrl: "https://raw.githubusercontent.com/microsoft/vscode-docs/main/docs/agent-customization/custom-agents.md",
  },
  {
    id: "agent-skills",
    title: "Agent skills in VS Code",
    pageUrl: "https://code.visualstudio.com/docs/agent-customization/agent-skills",
    rawUrl: "https://raw.githubusercontent.com/microsoft/vscode-docs/main/docs/agent-customization/agent-skills.md",
  },
  {
    id: "mcp-servers",
    title: "MCP servers in VS Code",
    pageUrl: "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
    rawUrl: "https://raw.githubusercontent.com/microsoft/vscode-docs/main/docs/agent-customization/mcp-servers.md",
  },
  {
    id: "settings",
    title: "User and workspace settings in VS Code",
    pageUrl: "https://code.visualstudio.com/docs/configure/settings",
    rawUrl: "https://raw.githubusercontent.com/microsoft/vscode-docs/main/docs/configure/settings.md",
  },
  {
    id: "remote-development",
    title: "Remote Development in VS Code",
    pageUrl: "https://code.visualstudio.com/docs/remote/remote-overview",
    rawUrl: "https://raw.githubusercontent.com/microsoft/vscode-docs/main/docs/remote/remote-overview.md",
  },
] as const;

export type OfficialDocSource = (typeof OFFICIAL_DOC_SOURCES)[number];
export type OfficialDocSourceId = OfficialDocSource["id"];

export function findOfficialDocSource(
  sourceId: string,
): OfficialDocSource | undefined {
  return OFFICIAL_DOC_SOURCES.find((source) => source.id === sourceId);
}
