# VS Code docs MCP container

This directory contains the Docker/Compose deployment for the VS Code documentation MCP server. The image is built from the project source and lockfile; its runtime listens on Streamable HTTP at `/mcp` and keeps official-doc and filtered-knowledge caches in a named volume.

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

## Build from source

Run from `vscodeagent/`:

```sh
docker build -f deploy/vscode-docs-mcp/Dockerfile -t vscode-docs-mcp:dev .
```

To use this local image with Compose, set `MCP_IMAGE=vscode-docs-mcp:dev` in `.env`, then run `docker compose -f deploy/vscode-docs-mcp/compose.yaml up -d`.

## Release

After merging the desired source, create and push a semantic version tag from the repository root, for example:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The workflow runs `npm run check`, builds both supported architectures, and publishes the version, major/minor, and `latest` tags to GHCR. Consumers should pin the full version tag rather than `latest` for reproducible deployments.

The image includes no deployment token. `MCP_AUTH_TOKEN` is supplied only at runtime via the local `.env` file; `.env` is ignored by Git.
