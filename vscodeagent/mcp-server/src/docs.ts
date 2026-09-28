import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { win32 } from "node:path";

export interface LocalDocument {
  path: string;
  title: string;
  content: string;
}

export interface DocumentSummary {
  path: string;
  title: string;
}

export interface DocumentSearchResult extends DocumentSummary {
  excerpt: string;
  score: number;
}

function isWithinDirectory(root: string, target: string): boolean {
  const relativePath = path.relative(root, target);
  return relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath));
}

function titleFrom(content: string, filePath: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path.basename(filePath, path.extname(filePath));
}

async function markdownFiles(rootDirectory: string): Promise<string[]> {
  const root = await realpath(rootDirectory);
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (
        entry.isFile() &&
        path.extname(entry.name).toLocaleLowerCase() === ".md"
      ) {
        files.push(absolutePath);
      }
    }
  }

  await visit(root);
  return files;
}

async function loadDocuments(rootDirectory: string): Promise<LocalDocument[]> {
  const root = await realpath(rootDirectory);
  const files = await markdownFiles(root);
  return Promise.all(
    files.map(async (filePath) => {
      const content = await readFile(filePath, "utf8");
      const relativePath = path.relative(root, filePath).split(path.sep).join("/");
      return {
        path: relativePath,
        title: titleFrom(content, filePath),
        content,
      };
    }),
  );
}

export async function listDocuments(
  rootDirectory: string,
  limit = 100,
): Promise<DocumentSummary[]> {
  const documents = await loadDocuments(rootDirectory);
  return documents.slice(0, Math.max(1, Math.min(Math.trunc(limit), 100)))
    .map(({ path: documentPath, title }) => ({
      path: documentPath,
      title,
    }));
}

function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [],
    ),
  ];
}

function excerptFor(content: string, terms: string[]): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  const lowerContent = normalized.toLocaleLowerCase();
  const firstMatch = terms
    .map((term) => lowerContent.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, firstMatch - 90);
  const end = Math.min(normalized.length, start + 260);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

export async function searchDocuments(
  rootDirectory: string,
  query: string,
  limit = 5,
): Promise<DocumentSearchResult[]> {
  const terms = queryTerms(query);
  if (terms.length === 0) {
    throw new Error("Search query must contain at least one letter or number.");
  }

  const documents = await loadDocuments(rootDirectory);
  const matches: DocumentSearchResult[] = [];

  for (const document of documents) {
    const lowerTitle = document.title.toLocaleLowerCase();
    const lowerContent = document.content.toLocaleLowerCase();
    let score = 0;

    for (const term of terms) {
      if (lowerTitle.includes(term)) {
        score += 4;
      }

      let offset = 0;
      while ((offset = lowerContent.indexOf(term, offset)) !== -1) {
        score += 1;
        offset += term.length;
      }
    }

    if (score > 0) {
      matches.push({
        path: document.path,
        title: document.title,
        excerpt: excerptFor(document.content, terms),
        score,
      });
    }
  }

  matches.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  return matches.slice(0, Math.max(1, Math.min(Math.trunc(limit), 20)));
}

export async function readDocument(
  rootDirectory: string,
  requestedPath: string,
): Promise<LocalDocument> {
  const root = await realpath(rootDirectory);
  const normalizedPath = requestedPath.replaceAll("\\", "/");
  if (
    normalizedPath.length === 0 ||
    path.posix.isAbsolute(normalizedPath) ||
    win32.isAbsolute(normalizedPath)
  ) {
    throw new Error("Document path must be a relative Markdown path.");
  }

  const candidatePath = path.resolve(root, normalizedPath);
  if (!isWithinDirectory(root, candidatePath)) {
    throw new Error("Document path is outside the documentation directory.");
  }

  const resolvedPath = await realpath(candidatePath);
  if (
    !isWithinDirectory(root, resolvedPath) ||
    path.extname(resolvedPath).toLocaleLowerCase() !== ".md"
  ) {
    throw new Error("Only Markdown files inside the documentation directory can be read.");
  }

  const content = await readFile(resolvedPath, "utf8");
  return {
    path: path.relative(root, resolvedPath).split(path.sep).join("/"),
    title: titleFrom(content, resolvedPath),
    content,
  };
}
