---
name: vscode-settings-management
description: Inspect, edit, and verify VS Code user, profile, workspace, and remote settings across Windows, Linux, WSL, SSH, and containers. Use whenever a VS Code setting is requested or behaves unexpectedly.
---

# VS Code Settings Management

## Identify the target

1. Determine whether the setting belongs to the active VS Code profile, user, workspace, folder, or remote machine.
2. Identify the UI host and extension host separately. A Windows VS Code window connected to WSL or SSH can use Windows user settings while running extensions remotely.
3. Inspect the current effective setting and all applicable scopes before editing. Prefer VS Code's Settings UI/JSON commands where possible.
4. Verify the setting's current schema, supported values, platform restrictions, and deprecation status in official documentation or the installed product.

## Edit safely

- Preserve JSONC comments, formatting, and unrelated keys. Never replace an entire settings file to change one value.
- Back up the exact target file before direct edits and avoid writing into an assumed user-data directory.
- Do not translate Windows paths to WSL/Linux paths by guesswork. Confirm the authority and actual filesystem first.
- Ask before changing user-wide, remote, or shared workspace settings when the user has not explicitly authorized that scope.

## Verify

1. Reopen or refresh the relevant settings view and confirm the effective value and scope.
2. Confirm the affected feature or extension behavior on the intended host.
3. Report the exact settings file/scope changed and any additional policy or folder settings that override it.
