# Extension Workflow

## Inspect before installing or changing

Identify the exact extension publisher and identifier, current version, VS Code compatibility (`engines.vscode`), release history, license, repository, and requested install target. Confirm whether VS Code is connected to WSL, SSH, or a container; local and remote extension installations are separate.

Do not treat Marketplace downloads or display names as proof of trust. Prefer official or established publishers, inspect required permissions and dependencies, and get approval before installing, removing, or upgrading an extension.

## Debug an extension

Capture the VS Code and extension versions, extension host, workspace trust state, and reproduction steps. Inspect **Developer: Show Running Extensions**, the Extension Host log, the relevant Output channel, and Developer Tools console. Check activation events, commands, contributed settings, workspace trust, and remote host logs.

For extension code, use the existing launch configuration to start an Extension Development Host. Reduce the issue to a small reproduction, add a focused regression test, and verify the original failure no longer occurs.

## Develop and test

Use the official [Extension API](https://code.visualstudio.com/api) and [testing guidance](https://code.visualstudio.com/api/working-with-extensions/testing-extension). Before changing an extension, inspect its manifest, scripts, tests, activation events, contribution points, dependencies, and `engines.vscode`.

Prefer explicit activation events and declarative contributions. Test changed behavior, activation, error cases, compatibility, and package contents as applicable. Report separately any verification that requires an actual VS Code Extension Development Host.

## Agent-operated extension actions

The VS Code specialist can use client tools to inspect Marketplace entries, install extensions, invoke VS Code commands, and run extension tests. Before each action, identify the exact publisher/extension ID, version, target profile/extension host, command or test, and expected effects; obtain a separate explicit user approval before proceeding. The default target is the active WSL extension host, not the Windows-local host. For removal, re-check the exact ID and host; use a VS Code command or CLI only after verifying it targets that host. Extension tests execute extension code, so prefer a disposable Extension Development Host or test profile and obtain separate approval for the test run.
