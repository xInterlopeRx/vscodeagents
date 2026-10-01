import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultOfficialDocsCacheDirectory } from "./cache.js";
import { searchDocuments } from "./docs.js";

const cacheVersion = 1;
const usefulTtlMilliseconds = 30 * 24 * 60 * 60 * 1000;
const negativeTtlMilliseconds = 24 * 60 * 60 * 1000;
const maxKnowledgeBytes = 512 * 1024;

export type NegativeKnowledgeOutcome = "broken" | "irrelevant" | "blocked";
export type KnowledgeSource = "firecrawl_search" | "firecrawl_scrape";

export interface StoreKnowledgeResult {
  url: string;
  source: KnowledgeSource;
  outcome: "cached" | NegativeKnowledgeOutcome;
  title?: string;
  content?: string;
  note?: string;
  tags?: string[];
}

export interface KnowledgeLastFailure {
  outcome: NegativeKnowledgeOutcome;
  attemptedAt: string;
  note: string;
}

interface MetadataBase {
  version: number;
  url: string;
  source: KnowledgeSource;
  cachedAt: string;
  expiresAt: string;
}

interface CachedKnowledgeMetadata extends MetadataBase {
  status: "cached";
  title: string;
  sha256: string;
  tags: string[];
  lastFailure?: KnowledgeLastFailure;
}

interface NegativeKnowledgeMetadata extends MetadataBase {
  status: "negative";
  outcome: NegativeKnowledgeOutcome;
  note: string;
}

type KnowledgeMetadata = CachedKnowledgeMetadata | NegativeKnowledgeMetadata;

export type KnowledgeLookup =
  | { status: "miss"; url: string }
  | (Omit<NegativeKnowledgeMetadata, "status"> & {
      status: "negative-hit" | "negative-stale";
    })
  | (Omit<CachedKnowledgeMetadata, "status"> & {
      status: "hit" | "stale";
      content: string;
    });

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function normalizeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Knowledge source URL must be a valid HTTP(S) URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Knowledge source URL must be HTTP(S) and must not contain credentials.",
    );
  }
  const sensitiveParameter = [...url.searchParams.keys()].find((key) =>
    /(?:^|[_-])(?:api[_-]?key|token|secret|password|signature|authorization|auth)(?:$|[_-])/i.test(
      key,
    ),
  );
  if (sensitiveParameter) {
    throw new Error(
      "Knowledge source URL must not contain credential-like query parameters.",
    );
  }

  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLocaleLowerCase().startsWith("utm_") ||
      ["fbclid", "gclid"].includes(key.toLocaleLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString();
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pathsFor(cacheDirectory: string, url: string) {
  const key = hash(url);
  const markdownDirectory = path.join(cacheDirectory, "markdown");
  const metadataDirectory = path.join(cacheDirectory, "metadata");
  return {
    markdownDirectory,
    metadataDirectory,
    contentPath: path.join(markdownDirectory, `${key}.md`),
    metadataPath: path.join(metadataDirectory, `${key}.json`),
  };
}

async function writeAtomically(
  filePath: string,
  content: string,
): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

const storeQueues = new Map<string, Promise<void>>();

async function serializeStore<T>(
  cacheDirectory: string,
  url: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `${path.resolve(cacheDirectory)}:${hash(url)}`;
  const previous = storeQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  storeQueues.set(key, pending);
  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (storeQueues.get(key) === pending) {
      storeQueues.delete(key);
    }
  }
}

function parseMetadata(value: unknown, expectedUrl: string): KnowledgeMetadata {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid cached knowledge metadata.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== cacheVersion ||
    record.url !== expectedUrl ||
    !["firecrawl_search", "firecrawl_scrape"].includes(String(record.source)) ||
    typeof record.cachedAt !== "string" ||
    !Number.isFinite(Date.parse(record.cachedAt)) ||
    typeof record.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(record.expiresAt))
  ) {
    throw new Error("Invalid cached knowledge metadata.");
  }

  if (record.status === "negative") {
    if (
      !["broken", "irrelevant", "blocked"].includes(String(record.outcome)) ||
      typeof record.note !== "string"
    ) {
      throw new Error("Invalid negative knowledge cache entry.");
    }
    return record as unknown as NegativeKnowledgeMetadata;
  }

  if (
    record.status !== "cached" ||
    typeof record.title !== "string" ||
    typeof record.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    !Array.isArray(record.tags) ||
    !record.tags.every((tag) => typeof tag === "string")
  ) {
    throw new Error("Invalid cached knowledge metadata.");
  }
  return record as unknown as CachedKnowledgeMetadata;
}

async function readEntry(
  url: string,
  cacheDirectory: string,
): Promise<{ metadata: KnowledgeMetadata; content?: string } | undefined> {
  const paths = pathsFor(cacheDirectory, url);
  let metadataText: string;
  try {
    metadataText = await readFile(paths.metadataPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }

  const metadata = parseMetadata(JSON.parse(metadataText), url);
  if (metadata.status === "negative") {
    return { metadata };
  }

  let content: string;
  try {
    content = await readFile(paths.contentPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error("Cached knowledge entry is missing its content file.");
    }
    throw error;
  }
  if (hash(content) !== metadata.sha256) {
    throw new Error(
      "Cached knowledge entry failed its SHA-256 integrity check.",
    );
  }
  return { metadata, content };
}

function normalizedTags(tags: string[] = []): string[] {
  return [
    ...new Set(
      tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean),
    ),
  ]
    .slice(0, 20)
    .map((tag) => tag.slice(0, 60));
}

async function storeKnowledgeResultUnlocked(
  input: StoreKnowledgeResult,
  url: string,
  cacheDirectory: string,
) {
  const paths = pathsFor(cacheDirectory, url);
  const existing = await readEntry(url, cacheDirectory);
  const now = new Date();
  const cachedAt = now.toISOString();

  if (input.outcome === "cached") {
    const content = input.content?.trim();
    if (!content) {
      throw new Error(
        "Useful knowledge results require filtered Markdown content.",
      );
    }
    if (Buffer.byteLength(content, "utf8") > maxKnowledgeBytes) {
      throw new Error(
        `Filtered knowledge content exceeds ${maxKnowledgeBytes} bytes.`,
      );
    }
    const title = (
      input.title?.replace(/\s+/g, " ").trim() || new URL(url).hostname
    ).slice(0, 300);
    const tags = normalizedTags(input.tags);
    const markdown = [
      `# ${title}`,
      ...(tags.length ? [`Tags: ${tags.join(", ")}`] : []),
      "",
      content,
    ].join("\n");
    const metadata: CachedKnowledgeMetadata = {
      version: cacheVersion,
      url,
      source: input.source,
      status: "cached",
      title,
      cachedAt,
      expiresAt: new Date(now.getTime() + usefulTtlMilliseconds).toISOString(),
      sha256: hash(markdown),
      tags,
    };
    await mkdir(paths.markdownDirectory, { recursive: true });
    await mkdir(paths.metadataDirectory, { recursive: true });
    await writeAtomically(paths.contentPath, markdown);
    await writeAtomically(
      paths.metadataPath,
      JSON.stringify(metadata, null, 2),
    );
    return {
      url,
      status: "cached" as const,
      title,
      cachedAt,
      expiresAt: metadata.expiresAt,
    };
  }

  if (input.content !== undefined) {
    throw new Error("Negative knowledge results must not include content.");
  }
  const note = input.note?.trim().slice(0, 2000);
  if (!note) {
    throw new Error("Negative knowledge results require a short reason.");
  }
  const lastFailure: KnowledgeLastFailure = {
    outcome: input.outcome,
    attemptedAt: cachedAt,
    note,
  };

  if (existing?.metadata.status === "cached") {
    const metadata: CachedKnowledgeMetadata = {
      ...existing.metadata,
      lastFailure,
    };
    await writeAtomically(
      paths.metadataPath,
      JSON.stringify(metadata, null, 2),
    );
    return {
      url,
      status: "cached" as const,
      title: metadata.title,
      cachedAt: metadata.cachedAt,
      expiresAt: metadata.expiresAt,
      lastFailure,
    };
  }

  const metadata: NegativeKnowledgeMetadata = {
    version: cacheVersion,
    url,
    source: input.source,
    status: "negative",
    outcome: input.outcome,
    note,
    cachedAt,
    expiresAt: new Date(now.getTime() + negativeTtlMilliseconds).toISOString(),
  };
  await mkdir(paths.metadataDirectory, { recursive: true });
  await writeAtomically(paths.metadataPath, JSON.stringify(metadata, null, 2));
  return {
    url,
    status: "negative" as const,
    outcome: metadata.outcome,
    cachedAt,
    expiresAt: metadata.expiresAt,
  };
}

export async function storeKnowledgeResult(
  input: StoreKnowledgeResult,
  cacheDirectory = path.join(defaultOfficialDocsCacheDirectory(), "knowledge"),
) {
  const url = normalizeUrl(input.url);
  return serializeStore(cacheDirectory, url, () =>
    storeKnowledgeResultUnlocked(input, url, cacheDirectory),
  );
}

export async function readCachedKnowledge(
  requestedUrl: string,
  cacheDirectory = path.join(defaultOfficialDocsCacheDirectory(), "knowledge"),
): Promise<KnowledgeLookup> {
  const url = normalizeUrl(requestedUrl);
  const entry = await readEntry(url, cacheDirectory);
  if (!entry) {
    return { status: "miss", url };
  }

  const fresh = Date.parse(entry.metadata.expiresAt) > Date.now();
  if (entry.metadata.status === "negative") {
    return {
      ...entry.metadata,
      status: fresh ? "negative-hit" : "negative-stale",
    };
  }
  return {
    ...entry.metadata,
    status: fresh ? "hit" : "stale",
    content: entry.content as string,
  };
}

export async function searchCachedKnowledge(
  query: string,
  limit = 5,
  cacheDirectory = path.join(defaultOfficialDocsCacheDirectory(), "knowledge"),
) {
  const markdownDirectory = path.join(cacheDirectory, "markdown");
  const matches = await searchDocuments(markdownDirectory, query, limit).catch(
    (error: unknown) => {
      if (isMissingFile(error)) {
        return [];
      }
      throw error;
    },
  );

  const results = [];
  for (const match of matches) {
    const id = path.basename(match.path, ".md");
    let metadataText: string;
    try {
      metadataText = await readFile(
        path.join(cacheDirectory, "metadata", `${id}.json`),
        "utf8",
      );
    } catch (error) {
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }
    const rawMetadata: unknown = JSON.parse(metadataText);
    if (
      typeof rawMetadata !== "object" ||
      rawMetadata === null ||
      !("url" in rawMetadata)
    ) {
      throw new Error("Invalid cached knowledge metadata.");
    }
    const cached = await readCachedKnowledge(
      String(rawMetadata.url),
      cacheDirectory,
    );
    if (cached.status !== "hit" && cached.status !== "stale") {
      continue;
    }
    results.push({
      url: cached.url,
      title: cached.title,
      excerpt: match.excerpt,
      score: match.score,
      cachedAt: cached.cachedAt,
      expiresAt: cached.expiresAt,
      cacheStatus: cached.status,
      tags: cached.tags,
    });
  }
  return results;
}
