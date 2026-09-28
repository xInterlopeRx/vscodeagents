---
name: vscode-extension-workflow
description: Install, inspect, debug, develop, package, and test Visual Studio Code extensions. Use for extension lifecycle tasks, Extension Host failures, API changes, and compatibility checks.
---

# VS Code Extension Workflow

## Before acting

1. Determine the VS Code version, operating system, profile, workspace, and extension host (local, WSL, SSH, or container).
2. For an existing extension, inspect its exact identifier, publisher, installed version, activation events, output channels, and workspace trust/permissions.
3. Read the extension's `package.json`, scripts, tests, and engine compatibility before changing its implementation.
4. Use the local docs tools when available and verify current details against official VS Code documentation.

## Installing or changing extensions

- Confirm the exact Marketplace publisher and extension identifier, compatibility, maintenance, and requested install target.
- Get approval before installation, removal, or upgrades. Preserve the current version unless the user approves changing it.
- Verify the result in the intended local or remote extension host; a local CLI listing is not proof of remote installation.

## Debugging

1. Reproduce the issue and record relevant VS Code version, extension version, host, and exact steps.
2. Inspect **Developer: Show Running Extensions**, Extension Host logs, the relevant Output channel, and Developer Tools console.
3. Check activation events, contributed commands/views/settings, workspace trust, dependencies, and host-side logs.
4. Reduce to a minimal reproduction. For extension code, use the repository's existing launch/test setup and an Extension Development Host.
5. Verify the fix with the focused test/build and a reproduction of the original behavior.

## Developing and testing

- Follow the current official Extension API and extension-manifest guidance; verify `engines.vscode` compatibility and avoid deprecated APIs.
- Prefer declarative contribution points and explicit activation events over broad activation.
- Add or update tests for behavior changes. Inspect the project's scripts before running commands; do not invent test commands.
- Test activation, commands, contributed settings, failure handling, and packaging as relevant. Report tests that require a real VS Code host separately from unit tests.
- Review packaged files and extension identity before publishing or distributing. Do not publish without explicit user approval.
