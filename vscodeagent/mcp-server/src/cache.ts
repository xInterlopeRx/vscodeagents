import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listDocuments, readDocument, searchDocuments } from "./docs.js";
import { findOfficialDocSource, OFFICIAL_DOC_SOURCES, type OfficialDocSourceId } from "./sources.js";

const cacheVersion = 1;
const cacheTtlMilliseconds = 7 * 24 * 60 * 60 * 1000;
const maxDocumentBytes = 2 * 1024 * 1024;
const licenseName = "Creative Commons Attribution 3.0 United States (CC BY 3.0 US)";
const licenseUrl = "https://creativecommons.org/licenses/by/3.0/us/";

const defaultCacheDirectory = process.env.VSCA_CACHE_DIR
  ? path.resolve(process.env.VSCA_CACHE_DIR)
  : path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../.cache/vscodeagent-docs",
    );

export interface CachedOfficialDocument {
  sourceId: OfficialDocSourceId;
  title: string;
  pageUrl: string;
  upstreamUrl: string;
  attribution: string;
  license: string;
  licenseUrl: string;
  cachedAt: string;
  sha256: string;
  content: string;
  cacheStatus: "fresh" | "refreshed" | "not-modified" | "stale";
  refreshError?: string;
}

interface CacheMetadata {
  version: number;
  sourceId: OfficialDocSourceId;
  cachedAt: string;
  sha256: string;
  etag?: string;
  lastModified?: string;
}

type Fetcher = typeof fetch;

function cachePaths(cacheDirectory: string, sourceId: OfficialDocSourceId) {
  const contentDirectory = path.join(cacheDirectory, "markdown");
  const metadataDirectory = path.join(cacheDirectory, "metadata");
  return {
    contentDirectory,
    contentPath: path.join(contentDirectory, `${sourceId}.md`),
    metadataDirectory,
    metadataPath: path.join(metadataDirectory, `${sourceId}.json`),
  };
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT";
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeMarkdown(content: string): string {
  return content
    .replace(/^---\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, "")
    .replaceAll("{% data variables.product.prodname_vscode_shortname %}", "VS Code")
    .replaceAll("{% data variables.product.prodname_vscode %}", "Visual Studio Code");
}

async function writeAtomically(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function readExistingCache(
  cacheDirectory: string,
  sourceId: OfficialDocSourceId,
): Promise<{ metadata: CacheMetadata; content: string } | undefined> {
  const paths = cachePaths(cacheDirectory, sourceId);
  let metadataText: string;
  try {
    metadataText = await readFile(paths.metadataPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }

  const metadata: unknown = JSON.parse(metadataText);
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("version" in metadata) ||
    metadata.version !== cacheVersion ||
    !("sourceId" in metadata) ||
    metadata.sourceId !== sourceId ||
    !("cachedAt" in metadata) ||
    typeof metadata.cachedAt !== "string" ||
    !("sha256" in metadata) ||
    typeof metadata.sha256 !== "string"
  ) {
    throw new Error(`Invalid cache metadata for official document "${sourceId}".`);
  }

  let content: string;
  try {
    content = await readFile(paths.contentPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(`Cached document "${sourceId}" is missing its content file.`);
    }
    throw error;
  }

  if (sha256(content) !== metadata.sha256) {
    throw new Error(`Cached document "${sourceId}" failed its SHA-256 integrity check.`);
  }

  return {
    metadata: metadata as CacheMetadata,
    content,
  };
}

function buildCachedDocument(
  sourceId: OfficialDocSourceId,
  content: string,
  metadata: CacheMetadata,
  cacheStatus: CachedOfficialDocument["cacheStatus"],
  refreshError?: string,
): CachedOfficialDocument {
  const source = findOfficialDocSource(sourceId);
  if (!source) {
    throw new Error(`Unknown official documentation source "${sourceId}".`);
  }

  return {
    sourceId,
    title: source.title,
    pageUrl: source.pageUrl,
    upstreamUrl: source.rawUrl,
    attribution: "Adapted from Microsoft, Visual Studio Code documentation; front matter removed and product template placeholders normalized.",
    license: licenseName,
    licenseUrl,
    cachedAt: metadata.cachedAt,
    sha256: metadata.sha256,
    content,
    cacheStatus,
    ...(refreshError ? { refreshError } : {}),
  };
}

async function readLimitedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxDocumentBytes) {
    throw new Error(`Official documentation response exceeds ${maxDocumentBytes} bytes.`);
  }
  if (!response.body) {
    throw new Error("Official documentation response had no body.");
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = Buffer.from(value);
    totalBytes += chunk.length;
    if (totalBytes > maxDocumentBytes) {
      await reader.cancel();
      throw new Error(`Official documentation response exceeds ${maxDocumentBytes} bytes.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const inFlightFetches = new Map<string, Promise<CachedOfficialDocument>>();

export async function fetchOfficialDocument(
  sourceId: string,
  refresh = false,
  cacheDirectory = defaultCacheDirectory,
  fetcher: Fetcher = fetch,
): Promise<CachedOfficialDocument> {
  const source = findOfficialDocSource(sourceId);
  if (!source) {
    throw new Error(`Unknown official documentation source "${sourceId}".`);
  }

  const existingFetch = inFlightFetches.get(`${cacheDirectory}:${sourceId}`);
  if (existingFetch) {
    return existingFetch;
  }

  const operation = (async (): Promise<CachedOfficialDocument> => {
    const existing = await readExistingCache(cacheDirectory, source.id);
    if (
      existing &&
      !refresh &&
      Date.now() - Date.parse(existing.metadata.cachedAt) < cacheTtlMilliseconds
    ) {
      return buildCachedDocument(source.id, existing.content, existing.metadata, "fresh");
    }

    const headers = new Headers({ accept: "text/plain" });
    if (existing?.metadata.etag) {
      headers.set("if-none-match", existing.metadata.etag);
    }
    if (existing?.metadata.lastModified) {
      headers.set("if-modified-since", existing.metadata.lastModified);
    }

    try {
      const response = await fetcher(source.rawUrl, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });

      if (response.status === 304 && existing) {
        const metadata: CacheMetadata = {
          ...existing.metadata,
          cachedAt: new Date().toISOString(),
          ...(response.headers.get("etag")
            ? { etag: response.headers.get("etag") as string }
            : {}),
          ...(response.headers.get("last-modified")
            ? { lastModified: response.headers.get("last-modified") as string }
            : {}),
        };
        const paths = cachePaths(cacheDirectory, source.id);
        await mkdir(paths.metadataDirectory, { recursive: true });
        await writeAtomically(paths.metadataPath, JSON.stringify(metadata, null, 2));
        return buildCachedDocument(source.id, existing.content, metadata, "not-modified");
      }

      if (!response.ok) {
        throw new Error(`Official documentation fetch returned HTTP ${response.status}.`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !/^text\/(plain|markdown)(?:;|$)/i.test(contentType)) {
        throw new Error(`Unexpected documentation content type "${contentType}".`);
      }

      const content = normalizeMarkdown(await readLimitedText(response));
      if (content.trim().length === 0) {
        throw new Error("Official documentation response was empty.");
      }

      const metadata: CacheMetadata = {
        version: cacheVersion,
        sourceId: source.id,
        cachedAt: new Date().toISOString(),
        sha256: sha256(content),
        ...(response.headers.get("etag")
          ? { etag: response.headers.get("etag") as string }
          : {}),
        ...(response.headers.get("last-modified")
          ? { lastModified: response.headers.get("last-modified") as string }
          : {}),
      };
      const paths = cachePaths(cacheDirectory, source.id);
      await mkdir(paths.contentDirectory, { recursive: true });
      await mkdir(paths.metadataDirectory, { recursive: true });
      await writeAtomically(paths.contentPath, content);
      await writeAtomically(paths.metadataPath, JSON.stringify(metadata, null, 2));
      return buildCachedDocument(source.id, content, metadata, "refreshed");
    } catch (error) {
      if (!existing) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      return buildCachedDocument(
        source.id,
        existing.content,
        existing.metadata,
        "stale",
        message,
      );
    }
  })();

  inFlightFetches.set(`${cacheDirectory}:${sourceId}`, operation);
  try {
    return await operation;
  } finally {
    inFlightFetches.delete(`${cacheDirectory}:${sourceId}`);
  }
}

export async function listOfficialSources(cacheDirectory = defaultCacheDirectory) {
  return Promise.all(OFFICIAL_DOC_SOURCES.map(async (source) => {
    const cached = await readExistingCache(cacheDirectory, source.id);
    const age = cached
      ? Date.now() - Date.parse(cached.metadata.cachedAt)
      : undefined;
    return {
      id: source.id,
      title: source.title,
      pageUrl: source.pageUrl,
      license: licenseName,
      cached: Boolean(cached),
      ...(cached
        ? {
            cachePath: `official:${source.id}`,
            cachedAt: cached.metadata.cachedAt,
            cacheStatus: age !== undefined && age < cacheTtlMilliseconds
              ? "fresh"
              : "stale",
            sha256: cached.metadata.sha256,
          }
        : {}),
    };
  }));
}

export async function searchCachedOfficialDocuments(
  query: string,
  limit = 5,
  cacheDirectory = defaultCacheDirectory,
) {
  const cachedRoot = path.join(cacheDirectory, "markdown");
  const matches = await searchDocuments(cachedRoot, query, limit).catch(
    (error: unknown) => {
      if (isMissingFile(error)) {
        return [];
      }
      throw error;
    },
  );
  return matches.map((match) => {
    const sourceId = path.basename(match.path, ".md");
    const source = findOfficialDocSource(sourceId);
    if (!source) {
      throw new Error(`Cached document "${match.path}" is not in the official source catalog.`);
    }
    return {
      ...match,
      path: `official:${source.id}`,
      title: source.title,
      sourceUrl: source.pageUrl,
    };
  });
}

export async function listCachedOfficialDocuments(cacheDirectory = defaultCacheDirectory) {
  const cachedRoot = path.join(cacheDirectory, "markdown");
  const documents = await listDocuments(cachedRoot).catch((error: unknown) => {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  });
  return documents.map((document) => {
    const sourceId = path.basename(document.path, ".md");
    const source = findOfficialDocSource(sourceId);
    if (!source) {
      throw new Error(`Cached document "${document.path}" is not in the official source catalog.`);
    }
    return {
      path: `official:${source.id}`,
      title: source.title,
      sourceUrl: source.pageUrl,
    };
  });
}

export async function readCachedOfficialDocument(
  sourceId: string,
  cacheDirectory = defaultCacheDirectory,
) {
  const source = findOfficialDocSource(sourceId);
  if (!source) {
    throw new Error(`Unknown official documentation source "${sourceId}".`);
  }

  const cached = await readExistingCache(cacheDirectory, source.id);
  if (!cached) {
    throw new Error(`Official document "${source.id}" is not cached; fetch it first.`);
  }

  const cacheStatus = Date.now() - Date.parse(cached.metadata.cachedAt) < cacheTtlMilliseconds
    ? "fresh"
    : "stale";
  return buildCachedDocument(source.id, cached.content, cached.metadata, cacheStatus);
}

export function defaultOfficialDocsCacheDirectory(): string {
  return defaultCacheDirectory;
}
