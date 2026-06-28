import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKDOWN_ROOT = path.join(PROJECT_ROOT, "data/zhouyi-markdown");
const OUTPUT_PATH = path.join(MARKDOWN_ROOT, "周易全文.md");

function stripFrontMatter(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "").trim();
}

async function markdownFiles(directory) {
  return (await readdir(directory))
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
}

async function main() {
  const hexagramDirectory = path.join(MARKDOWN_ROOT, "hexagrams");
  const wingDirectory = path.join(MARKDOWN_ROOT, "ten-wings");
  const hexagramFiles = await markdownFiles(hexagramDirectory);
  const wingFiles = await markdownFiles(wingDirectory);

  if (hexagramFiles.length !== 64) {
    throw new Error(`Expected 64 hexagram files, found ${hexagramFiles.length}`);
  }

  const sections = [
    "# 周易全文",
    "",
    "本檔由六十四卦與獨立十翼 Markdown 自動合併；原始單檔仍保留於相鄰目錄。"
  ];

  for (const filename of hexagramFiles) {
    sections.push(stripFrontMatter(await readFile(path.join(hexagramDirectory, filename), "utf8")));
  }

  sections.push("# 獨立十翼");
  for (const filename of wingFiles) {
    sections.push(stripFrontMatter(await readFile(path.join(wingDirectory, filename), "utf8")));
  }

  await writeFile(OUTPUT_PATH, `${sections.join("\n\n---\n\n")}\n`, "utf8");
  console.log(`Combined ${hexagramFiles.length} hexagrams and ${wingFiles.length} Wing files into ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
