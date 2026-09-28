import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listDocuments, readDocument, searchDocuments } from "../src/docs.js";

async function createDocsDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "vscodeagent-docs-"));
  await mkdir(path.join(root, "guides"));
  await writeFile(
    path.join(root, "guides", "extensions.md"),
    "# Extension Testing\n\nUse an Extension Development Host to debug and test extensions.",
  );
  await writeFile(path.join(root, "settings.md"), "# Settings\n\nVerify the active profile and remote scope.");
  return root;
}

test("lists and searches local Markdown documentation", async (context) => {
  const root = await createDocsDirectory();
  context.after(() => rm(root, { recursive: true, force: true }));

  const documents = await listDocuments(root);
  assert.deepEqual(
    documents.map((document) => document.path),
    ["guides/extensions.md", "settings.md"],
  );

  const matches = await searchDocuments(root, "extension testing");
  assert.equal(matches[0]?.path, "guides/extensions.md");
  assert.match(matches[0]?.excerpt ?? "", /Extension Development Host/);
});

test("reads a requested local document and rejects traversal", async (context) => {
  const root = await createDocsDirectory();
  context.after(() => rm(root, { recursive: true, force: true }));

  const document = await readDocument(root, "guides\\extensions.md");
  assert.equal(document.title, "Extension Testing");
  assert.match(document.content, /debug and test extensions/);

  await assert.rejects(
    readDocument(root, "../outside.md"),
    /relative Markdown path|outside the documentation directory/,
  );
});

test("rejects non-Markdown paths", async (context) => {
  const root = await createDocsDirectory();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "secret.txt"), "not documentation");

  await assert.rejects(readDocument(root, "secret.txt"), /Only Markdown files/);
  assert.equal(await readFile(path.join(root, "secret.txt"), "utf8"), "not documentation");
});
