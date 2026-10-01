# VS Code docs MCP container

This directory contains the Docker/Compose deployment for the VS Code documentation MCP server. The image is built from the project source and lockfile; its runtime listens on Streamable HTTP at `/mcp` and keeps official-doc and filtered-knowledge caches in a named volume.

## Install in WSL

After the repository is public, run these commands from WSL. The installer is downloaded over HTTPS to a local file, not piped directly into a shell. The installer uses the existing `v0.1.1` server image/source release; no new image version is required for this installer-only change.

```sh
curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error \
  --output install-wsl.sh \
  https://raw.githubusercontent.com/xInterlopeRx/vscodeagents/a247d388a0e1ea9af00b1443df2ec84a16f88228/vscodeagent/deploy/vscode-docs-mcp/install-wsl.sh
bash install-wsl.sh
rm -- install-wsl.sh
```

The installer uses the pinned GHCR image when pull access is available. If the package is still private, it downloads the tagged source archive over HTTPS and builds that release locally. It creates a per-install bearer token, preserves the cache volume on updates, backs up and merges the Windows VS Code user `mcp.json`, and verifies health plus authenticated MCP tool discovery. It binds to loopback by default. Set `VSCA_MCP_CONFIG` to the WSL-visible `mcp.json` path when using a non-default VS Code profile. Run `bash install-wsl.sh --help` for supported overrides.

GitHub repository visibility and GHCR package visibility are separate settings. Publishing the repository allows unauthenticated access to the installer and source archive; publishing the GHCR package is optional because the installer can build from source.

## Run a published image

Published images will be available at `ghcr.io/xinterloperx/vscode-docs-mcp`. Releases use semantic-version tags such as `0.1.0`; `latest` follows the most recent version tag. The GitHub Actions release workflow publishes `linux/amd64` and `linux/arm64` images when a `v*` Git tag is pushed. After the first image is published, set the GHCR package visibility to **Public** in the repository's package settings if other users should be able to pull it without authenticating.

From this directory:

```sh
cp .env.example .env
openssl rand -hex 32
```

Put the generated value into `.env` as `MCP_AUTH_TOKEN`. The example pins `MCP_IMAGE` to a version tag; update it deliberately when choosing a newer release, then run:

```sh
docker compose -f compose.yaml pull
docker compose -f compose.yaml up -d
docker compose -f compose.yaml ps
```

Compose publishes to `127.0.0.1:3100` by default. To accept connections on the server's LAN interface, set `MCP_PUBLISHED_HOST` to that specific interface address and use a protected VPN/tunnel or TLS proxy. Keep the bearer token private. Avoid `0.0.0.0` unless exposing on every interface is intentional.

## Enter the token in VS Code

The WSL installer generates a unique `MCP_AUTH_TOKEN` for each new installation and stores it in `~/.config/vscode-docs-mcp/.env` with owner-only permissions. Compose users store it in `deploy/vscode-docs-mcp/.env`. The token is not included in the GitHub repository or image. If `VSCA_CONFIG_DIR` or `VSCA_ENV_FILE` was overridden during installation, use that configured path instead.

When VS Code starts `vscodeagentDocs`, enter that installation's token in the masked password prompt. From WSL, copy it to the Windows clipboard without printing it in the terminal:

```sh
token_file="$HOME/.config/vscode-docs-mcp/.env"
awk -F= '$1 == "MCP_AUTH_TOKEN" { sub(/^[^=]*=/, ""); printf "%s", $0; exit }' "$token_file" | clip.exe
```

Paste into the masked VS Code prompt, then clear the clipboard:

```sh
printf '' | clip.exe
```

Each installation has its own token. A user connecting to someone else's running server needs that server's token, shared through a secure channel; do not commit it, put it in a URL, or paste it into chat.

## Build from source

Run from `vscodeagent/`:

```sh
docker build -f deploy/vscode-docs-mcp/Dockerfile -t vscode-docs-mcp:dev .
```

To use this local image with Compose, set `MCP_IMAGE=vscode-docs-mcp:dev` in `.env`, then run `docker compose -f deploy/vscode-docs-mcp/compose.yaml up -d`.

## Release

For a future server release, choose an unused semantic version and create its tag from the repository root, for example:

```sh
VERSION=0.1.2
git tag -a "v${VERSION}" -m "Release v${VERSION}"
git push origin "v${VERSION}"
```

The workflow runs `npm run check`, builds both supported architectures, and publishes the version, major/minor, and `latest` tags to GHCR. Consumers should pin the full version tag rather than `latest` for reproducible deployments.

The image includes no deployment token. `MCP_AUTH_TOKEN` is supplied only at runtime via the local `.env` file; `.env` is ignored by Git.
