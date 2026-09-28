import { timingSafeEqual } from "node:crypto";

export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLocaleLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1";
}

export function validateHttpConfig(host: string, token?: string): void {
  if (!isLoopbackHost(host) && !token) {
    throw new Error("MCP_AUTH_TOKEN is required when MCP_HTTP_HOST is not loopback.");
  }
  if (token && token.length < 32) {
    throw new Error("MCP_AUTH_TOKEN must contain at least 32 characters.");
  }
}

export function buildAllowedOrigins(
  host: string,
  port: number,
  configuredOrigins = "",
): Set<string> {
  const origins = new Set<string>();
  if (isLoopbackHost(host)) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    origins.add(`http://[::1]:${port}`);
  } else if (host !== "0.0.0.0" && host !== "::") {
    origins.add(`http://${host}:${port}`);
  }

  for (const configuredOrigin of configuredOrigins.split(",").map((item) => item.trim())) {
    if (!configuredOrigin) {
      continue;
    }
    const parsed = new URL(configuredOrigin);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      throw new Error(`MCP_ALLOWED_ORIGINS entries must be HTTP(S) origins without paths: "${configuredOrigin}".`);
    }
    origins.add(parsed.origin);
  }
  return origins;
}

export function isAllowedOrigin(
  origin: string | string[] | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (origin === undefined) {
    return true;
  }
  if (typeof origin !== "string") {
    return false;
  }
  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function isAuthorizedHeader(
  authorization: string | string[] | undefined,
  token?: string,
): boolean {
  if (!token) {
    return true;
  }
  if (typeof authorization !== "string") {
    return false;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }

  const provided = Buffer.from(match[1] ?? "");
  const expected = Buffer.from(token);
  return provided.length === expected.length &&
    timingSafeEqual(provided, expected);
}
