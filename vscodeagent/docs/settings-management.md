# Settings Management Across Hosts

VS Code settings can come from the active profile, user, workspace, folder, and remote scopes. A setting that appears in one JSON file may be overridden by another scope or restricted by policy.

## Identify the actual target

- Record the VS Code version, active profile, operating system, workspace, and remote authority.
- Distinguish the machine running the VS Code UI from the machine running a remote extension host. This is especially important for Windows-to-WSL and Windows-to-SSH sessions.
- Use the Settings UI or **Preferences: Open User Settings (JSON)** / **Preferences: Open Workspace Settings (JSON)** to identify the active file. Use **Preferences: Open Remote Settings (JSON)** when connected remotely.
- Do not infer Windows user-data paths from a WSL shell, or assume a Linux `code` command edits Windows settings.

## Edit and verify

Change only the requested key and preserve JSONC comments and unrelated settings. Back up a file before direct edits. For user-wide, remote, or shared workspace changes, confirm the exact scope before writing.

Afterward, verify the effective value in the Settings UI and test the affected behavior on the correct host. Report scope conflicts, policy restrictions, or platform limitations instead of claiming success from the file edit alone.

## Agent-operated settings changes

The VS Code specialist may use VS Code client tools to inspect or edit settings. Before each write, identify whether the target is workspace, user, or remote-user scope; name the setting key and proposed value; and state which profile and extension host it affects. Obtain explicit approval for each write. The default target is the active WSL workspace/extension host; do not infer that Windows-local settings are in scope from a WSL filesystem path.

See the current [VS Code settings documentation](https://code.visualstudio.com/docs/configure/settings) and [Remote Development overview](https://code.visualstudio.com/docs/remote/remote-overview).
