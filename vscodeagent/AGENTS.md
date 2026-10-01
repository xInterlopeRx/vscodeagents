# VS Code Agent Project Guidance

## Project context

- Read `README.md`, `TODO.md`, and the task-relevant files under `docs/` before making project changes. Verify documentation against current source and configuration.
- This repository builds a portable VS Code specialist agent and a local documentation MCP server. It is separate from ByteHarder; do not edit the ByteHarder repository as part of this project.
- The future ByteHarder/Hermes integration is tracked in `TODO.md` and should happen only after the MCP server is tested and the user asks to begin that separate change.

## VS Code environment safety

- Before changing settings or extensions, identify the exact VS Code instance, profile, workspace, and extension host. Distinguish local Windows/Linux, WSL, SSH, Dev Container, and other remote authorities.
- Inspect the current setting value and its scope before proposing or editing it. Preserve unrelated settings and JSONC comments; back up files before direct edits and verify the effective value afterward.
- The VS Code specialist agent may use VS Code built-in tools and the integrated terminal for settings, extension management, and extension tests when those tools are available. Tool availability is not consent.
- For every individual settings write, extension install/removal/upgrade, side-effecting VS Code command, terminal mutation, or test run that executes extension code, explain the exact operation, scope/extension host, and likely effects, then obtain explicit user approval before invoking the tool. One approval does not cover a batch of distinct actions. Confirm an extension's publisher, identifier, version/compatibility, and install target before installation; confirm identifier and target before removal.
- Default target is the active WSL workspace and its WSL extension host. Verify it before acting; do not modify the Windows-local profile or another remote host unless the user explicitly selects it. Prefer a disposable Extension Development Host or test profile for extension-code tests. Never use sudo; ask the user to perform any step that requires elevated privileges.
- Never infer a Windows path from a WSL path or assume that a local VS Code CLI controls a remote extension host.
- Prefer current official VS Code documentation and validate platform- or version-specific instructions.

## MCP server safety

- Keep official-document fetching limited to the fixed source catalog; never add arbitrary-URL fetching to this MCP server. Its local knowledge-cache tools may search, read, and store concise filtered Firecrawl research explicitly provided by the agent, but must not fetch URLs themselves.
- Cache official documentation with its source URL, attribution, license, hash, fetch time, and freshness status. Do not commit downloaded documentation or cache files.
- Check local documentation and knowledge caches before Firecrawl. Preserve source URLs and freshness, summarize rather than copy full pages, and never cache secrets, credentials, or personal data. Negative URL results have a retry cooldown; a failed revisit must not replace useful cached content.
- Bind HTTP mode to loopback unless remote access is explicitly needed. Require a strong bearer token for non-loopback binds and restrict browser origins; never commit tokens or expose them in logs.
- Keep remote deployment on `operatorx` separate from this repository's local development until the deployment task is approved.

## Validation and reporting

- Run `npm run check` after changing server or agent-supporting code.
- For documentation-only edits, inspect the diff and run `git diff --check`.
- State which host/profile was affected, what was changed, and which validation was run. Do not claim a remote deployment worked without checking its health and MCP responses.
