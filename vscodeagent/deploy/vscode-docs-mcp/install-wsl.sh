#!/usr/bin/env bash
set -euo pipefail

readonly repo_slug="xInterlopeRx/vscodeagents"
readonly server_name="vscodeagentDocs"
readonly token_input_id="vscodeagent-docs-token"
readonly cache_mount="/home/node/.cache/vscodeagent-docs"

release_tag="${VSCA_RELEASE_TAG:-v0.1.1}"
image_version="${release_tag#v}"
image="${VSCA_IMAGE:-ghcr.io/xinterloperx/vscode-docs-mcp:${image_version}}"
container_name="${VSCA_CONTAINER_NAME:-vscode-docs-mcp-wsl}"
cache_volume="${VSCA_CACHE_VOLUME:-vscode-docs-mcp-wsl-cache}"
http_port="${VSCA_HTTP_PORT:-3100}"
config_directory="${VSCA_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/vscode-docs-mcp}"
env_file="${VSCA_ENV_FILE:-$config_directory/.env}"
mcp_config="${VSCA_MCP_CONFIG:-}"
source_directory="${VSCA_SOURCE_DIR:-}"
work_directory=""
rollback_name="${container_name}.rollback.$$"
previous_container_renamed=0
replacement_attempted=0

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  local result=$?
  if (( result != 0 )); then
    if (( replacement_attempted )) && docker container inspect "$container_name" >/dev/null 2>&1; then
      docker rm -f "$container_name" >/dev/null 2>&1 || true
    fi
    if (( previous_container_renamed )); then
      docker rename "$rollback_name" "$container_name" >/dev/null 2>&1 || true
      docker start "$container_name" >/dev/null 2>&1 || true
    fi
  fi
  if [[ -n "$work_directory" ]]; then
    rm -rf -- "$work_directory"
  fi
  exit "$result"
}
trap cleanup EXIT

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Install or update the pinned VS Code documentation MCP server in WSL.

The installer preserves the knowledge-cache volume and auth token, writes the
token to a private file under ~/.config/vscode-docs-mcp, and merges the server
into the active Windows VS Code user mcp.json after health and MCP checks pass.

Optional environment overrides for testing or non-default profiles:
  VSCA_RELEASE_TAG       Release tag to install (default: v0.1.1)
  VSCA_IMAGE             Image name/tag to use
  VSCA_CONTAINER_NAME    Managed container name
  VSCA_CACHE_VOLUME      Persistent Docker volume name
  VSCA_HTTP_PORT         Loopback host port (default: 3100)
  VSCA_CONFIG_DIR        Directory for the private env file
  VSCA_ENV_FILE          Alternate env-file path
  VSCA_MCP_CONFIG        Windows mcp.json path as visible in WSL
  VSCA_SOURCE_DIR        Build source from this local vscodeagent/ directory
EOF
  exit 0
fi
if [[ $# -ne 0 ]]; then
  die "Unsupported argument: $1. Run with --help for supported environment overrides."
fi

[[ -n "${WSL_DISTRO_NAME:-}" ]] || die "Run this installer from a WSL distribution."
[[ "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Release tag must be a full semantic version such as v0.1.2."
[[ "$http_port" =~ ^[0-9]{1,5}$ ]] || die "VSCA_HTTP_PORT must be an integer from 1 to 65535."
(( 10#$http_port >= 1 && 10#$http_port <= 65535 )) || die "VSCA_HTTP_PORT must be an integer from 1 to 65535."

for command_name in docker python3 curl tar; do
  command -v "$command_name" >/dev/null 2>&1 || die "Required command not found: $command_name."
done
docker info >/dev/null 2>&1 || die "Docker is unavailable. Start Docker Desktop or the WSL Docker Engine, then retry."

if [[ -z "$mcp_config" ]]; then
  command -v powershell.exe >/dev/null 2>&1 || die "powershell.exe is required to locate the active Windows VS Code profile. Set VSCA_MCP_CONFIG to its WSL-visible mcp.json path to override."
  command -v wslpath >/dev/null 2>&1 || die "wslpath is required to resolve the Windows VS Code config path."
  windows_config_path="$(powershell.exe -NoLogo -NoProfile -NonInteractive -Command '$env:APPDATA + "\Code\User\mcp.json"' | tr -d '\r\n')"
  [[ -n "$windows_config_path" ]] || die "Could not resolve the Windows VS Code user config path."
  mcp_config="$(wslpath -u "$windows_config_path")"
fi

python3 - "$mcp_config" "$server_name" "$token_input_id" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
try:
    config = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
except (OSError, json.JSONDecodeError) as error:
    raise SystemExit(
        f"Cannot safely update {path}: expected strict JSON ({error}). "
        "The config was not changed. Convert comments to JSON or set VSCA_MCP_CONFIG."
    )
if not isinstance(config, dict):
    raise SystemExit(f"Cannot safely update {path}: the root must be a JSON object.")
servers = config.get("servers", {})
inputs = config.get("inputs", [])
if not isinstance(servers, dict) or not isinstance(inputs, list):
    raise SystemExit(f"Cannot safely update {path}: servers must be an object and inputs an array.")
if sys.argv[2] in servers and not isinstance(servers[sys.argv[2]], dict):
    raise SystemExit(f"Cannot safely update {path}: server {sys.argv[2]} is not an object.")
matching_inputs = [item for item in inputs if isinstance(item, dict) and item.get("id") == sys.argv[3]]
if len(matching_inputs) > 1:
    raise SystemExit(f"Cannot safely update {path}: duplicate input id {sys.argv[3]}.")
if matching_inputs and (
    matching_inputs[0].get("type") != "promptString"
    or matching_inputs[0].get("password") is not True
):
    raise SystemExit(f"Cannot safely update {path}: input id {sys.argv[3]} is already used incompatibly.")
PY

work_directory="$(mktemp -d "${TMPDIR:-/tmp}/vscode-docs-mcp-install.XXXXXX")"

source_image() {
  local build_context="$1"
  [[ -f "$build_context/deploy/vscode-docs-mcp/Dockerfile" ]] || die "Source directory does not contain the VS Code docs MCP Dockerfile."
  docker build \
    --file "$build_context/deploy/vscode-docs-mcp/Dockerfile" \
    --tag "$image" \
    "$build_context"
}

if [[ -n "$source_directory" ]]; then
  source_directory="$(cd "$source_directory" && pwd)"
  source_image "$source_directory"
elif ! docker pull "$image" >/dev/null 2>&1; then
  printf 'Published image is not pullable with the current Docker credentials; building the pinned release source.\n'
  archive="$work_directory/source.tar.gz"
  extracted_source="$work_directory/source"
  mkdir -p "$extracted_source"
  archive_url="https://github.com/$repo_slug/archive/refs/tags/${release_tag}.tar.gz"
  curl --fail --location --silent --show-error --output "$archive" "$archive_url" || die "Could not download source for $release_tag from GitHub over HTTPS."
  tar -xzf "$archive" -C "$extracted_source" || die "Could not unpack the pinned GitHub source archive."
  source_directory="$(find "$extracted_source" -mindepth 2 -maxdepth 2 -type d -name vscodeagent -print -quit)"
  [[ -n "$source_directory" ]] || die "The pinned source archive does not contain vscodeagent/."
  source_image "$source_directory"
else
  printf 'Pulled pinned image %s.\n' "$image"
fi

existing_container=0
existing_container_running=0
existing_token=""
if docker container inspect "$container_name" >/dev/null 2>&1; then
  existing_container=1
  existing_image="$(docker inspect --format '{{.Config.Image}}' "$container_name")"
  case "$existing_image" in
    ghcr.io/xinterloperx/vscode-docs-mcp:*|vscode-docs-mcp:*) ;;
    *) die "Container $container_name exists but does not use a recognized VS Code docs MCP image ($existing_image); it was left untouched." ;;
  esac
  existing_volume="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/home/node/.cache/vscodeagent-docs"}}{{.Name}}{{end}}{{end}}' "$container_name")"
  [[ "$existing_volume" == "$cache_volume" ]] || die "Container $container_name uses a different or missing cache volume ($existing_volume); it was left untouched. Set VSCA_CACHE_VOLUME to that exact volume to preserve its cache."
  if [[ "$(docker inspect --format '{{.State.Running}}' "$container_name")" == "true" ]]; then
    existing_container_running=1
  fi
  existing_token="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_name" | awk -F= '$1 == "MCP_AUTH_TOKEN" { sub(/^[^=]*=/, ""); print; exit }')"
fi

published_containers="$(docker ps --filter "publish=$http_port" --format '{{.Names}}')"
while IFS= read -r published_container; do
  [[ -z "$published_container" || "$published_container" == "$container_name" ]] || die "Port $http_port is already published by $published_container. Choose another VSCA_HTTP_PORT or stop that service first."
done <<< "$published_containers"
if command -v ss >/dev/null 2>&1; then
  listener="$(ss -ltnH "sport = :$http_port" 2>/dev/null || true)"
  if [[ -n "$listener" && $existing_container_running -eq 0 ]]; then
    die "Port $http_port is already in use by another process. Choose another VSCA_HTTP_PORT or stop that process first."
  fi
fi

umask 077
mkdir -p "$config_directory"
chmod 700 "$config_directory"
if [[ -e "$env_file" ]]; then
  [[ -f "$env_file" ]] || die "Env-file path exists but is not a regular file: $env_file"
  chmod 600 "$env_file"
fi
auth_token="$(awk -F= '$1 == "MCP_AUTH_TOKEN" { sub(/^[^=]*=/, ""); print; exit }' "$env_file" 2>/dev/null || true)"
if [[ -z "$auth_token" ]]; then
  auth_token="$existing_token"
fi
if [[ -z "$auth_token" ]]; then
  auth_token="${MCP_AUTH_TOKEN:-}"
fi
if [[ -z "$auth_token" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    auth_token="$(openssl rand -hex 32)"
  else
    auth_token="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  fi
fi
[[ ${#auth_token} -ge 32 && "$auth_token" != *$'\n'* && "$auth_token" != *$'\r'* ]] || die "MCP_AUTH_TOKEN must contain at least 32 characters and no line breaks."
if ! awk -F= '$1 == "MCP_AUTH_TOKEN" { found = 1 } END { exit !found }' "$env_file" 2>/dev/null; then
  printf '\nMCP_AUTH_TOKEN=%s\n' "$auth_token" >> "$env_file"
fi
chmod 600 "$env_file"
unset auth_token existing_token

docker volume create "$cache_volume" >/dev/null

if (( existing_container )); then
  docker stop "$container_name" >/dev/null 2>&1 || true
  docker rename "$container_name" "$rollback_name"
  previous_container_renamed=1
fi

replacement_attempted=1
docker run --detach \
  --name "$container_name" \
  --label "io.xinterlope.vscode-docs-mcp.managed=true" \
  --label "org.opencontainers.image.source=https://github.com/$repo_slug" \
  --restart unless-stopped \
  --init \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --cpus 0.50 \
  --memory 256m \
  --publish "127.0.0.1:${http_port}:3100" \
  --env-file "$env_file" \
  --env MCP_HTTP_HOST=0.0.0.0 \
  --env MCP_HTTP_PORT=3100 \
  --env VSCA_DOCS_DIR=/app/docs \
  --env VSCA_CACHE_DIR="$cache_mount" \
  --mount "type=volume,source=$cache_volume,target=$cache_mount" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  "$image" >/dev/null

if ! curl --fail --silent \
  --retry 15 --retry-delay 1 --retry-all-errors --max-time 3 \
  "http://127.0.0.1:${http_port}/healthz" >/dev/null 2>&1; then
  die "The container did not become healthy; the previous container will be restored if available."
fi

docker exec "$container_name" node --input-type=module -e '
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3100/mcp"), {
  requestInit: { headers: { authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` } },
});
const client = new Client({ name: "vscode-docs-mcp-installer", version: "1.0.0" });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.ok(tools.some(({ name }) => name === "store_vscode_knowledge"));
  console.log(`Authenticated MCP check passed (${tools.length} tools).`);
} finally {
  await client.close();
}
'

python3 - "$mcp_config" "$http_port" "$server_name" "$token_input_id" <<'PY'
import json
import os
import pathlib
import shutil
import stat
import sys
import tempfile
import time

path = pathlib.Path(sys.argv[1])
port, server_name, input_id = sys.argv[2:]
try:
    config = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
except (OSError, json.JSONDecodeError) as error:
    raise SystemExit(f"Cannot safely update {path}: expected strict JSON ({error}). The MCP config was not changed.")
if not isinstance(config, dict):
    raise SystemExit(f"Cannot safely update {path}: the root must be a JSON object.")
servers = config.setdefault("servers", {})
inputs = config.setdefault("inputs", [])
if not isinstance(servers, dict) or not isinstance(inputs, list):
    raise SystemExit(f"Cannot safely update {path}: servers must be an object and inputs an array.")
if server_name in servers and not isinstance(servers[server_name], dict):
    raise SystemExit(f"Cannot safely update {path}: server {server_name} is not an object.")

input_matches = [item for item in inputs if isinstance(item, dict) and item.get("id") == input_id]
if len(input_matches) > 1:
    raise SystemExit(f"Cannot safely update {path}: duplicate input id {input_id}.")
if input_matches and (
    input_matches[0].get("type") != "promptString"
    or input_matches[0].get("password") is not True
):
    raise SystemExit(f"Cannot safely update {path}: input id {input_id} is already used incompatibly.")

server = {
    "type": "http",
    "url": f"http://127.0.0.1:{port}/mcp",
    "headers": {"Authorization": "Bearer ${input:" + input_id + "}"},
}
changed = servers.get(server_name) != server
servers[server_name] = server
if not input_matches:
    inputs.append({
        "type": "promptString",
        "id": input_id,
        "description": "Bearer token for the local VS Code documentation MCP server",
        "password": True,
    })
    changed = True

if not changed:
    print(f"VS Code MCP config already points {server_name} to the installed server.")
    raise SystemExit(0)

path.parent.mkdir(parents=True, exist_ok=True)
mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
backup = None
if path.exists():
    backup = path.with_name(f"{path.name}.backup-{time.strftime('%Y%m%d-%H%M%S')}-{os.getpid()}")
    shutil.copy2(path, backup)

temporary = None
try:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.",
        suffix=".tmp", delete=False,
    ) as output:
        temporary = pathlib.Path(output.name)
        json.dump(config, output, indent=2, ensure_ascii=False)
        output.write("\n")
    os.chmod(temporary, mode)
    os.replace(temporary, path)
except Exception:
    if temporary is not None:
        temporary.unlink(missing_ok=True)
    if backup is not None:
        print(f"Original config backup retained at {backup}.", file=sys.stderr)
    raise

if backup is not None:
    print(f"Backed up the previous VS Code MCP config to {backup}.")
print(f"Added {server_name} to the Windows VS Code user MCP config.")
PY

if (( previous_container_renamed )); then
  docker rm "$rollback_name" >/dev/null
  previous_container_renamed=0
fi
replacement_attempted=0

printf '\nInstalled %s on WSL.\n' "$image"
printf 'HTTP endpoint: http://127.0.0.1:%s/mcp\n' "$http_port"
printf 'Private auth env file: %s (mode 600)\n' "$env_file"
printf 'Persistent cache volume: %s\n' "$cache_volume"
printf 'Run MCP: List Servers in VS Code, start %s, and enter the token in the masked prompt.\n' "$server_name"