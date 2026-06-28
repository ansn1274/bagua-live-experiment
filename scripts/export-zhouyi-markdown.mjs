import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_PATH = path.join(PROJECT_ROOT, "web/data/zhouyi.json");
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "data/zhouyi-markdown");
const HEXAGRAM_DIR = path.join(OUTPUT_ROOT, "hexagrams");
const WING_DIR = path.join(OUTPUT_ROOT, "ten-wings");
const STANDALONE_WINGS = [
  ["06", "xiciUpper", "繫辭上"],
  ["07", "xiciLower", "繫辭下"],
  ["08", "shuogua", "說卦"],
  ["09", "xugua", "序卦"],
  ["10", "zagua", "雜卦"]
];

function yamlString(value) {
  return JSON.stringify(String(value));
}

function paragraphs(items) {
  return items.map((text) => `${text}\n`).join("\n");
}

function renderHexagram(hexagram) {
  const lines = [
    "---",
    `number: ${hexagram.number}`,
    `name: ${yamlString(hexagram.name)}`,
    `aliases: [${hexagram.aliases.map(yamlString).join(", ")}]`,
    `glyph: ${yamlString(hexagram.glyph)}`,
    `canon_section: ${yamlString(hexagram.canonSection)}`,
    `lower_trigram: ${yamlString(hexagram.composition.lowerTrigram)}`,
    `upper_trigram: ${yamlString(hexagram.composition.upperTrigram)}`,
    `source_url: ${yamlString(hexagram.source.url)}`,
    "---",
    "",
    `# ${String(hexagram.number).padStart(2, "0")} ${hexagram.name} ${hexagram.glyph}`,
    "",
    `- **卦序：** 第 ${hexagram.number} 卦`,
    `- **卦體：** ${hexagram.composition.text}`,
    `- **上下經：** ${hexagram.canonSection === "upper" ? "上經" : "下經"}`,
    "",
    "## 易經",
    "",
    "### 卦辭",
    "",
    paragraphs(hexagram.classic.judgment.paragraphs).trimEnd(),
    "",
    "### 爻辭",
    ""
  ];

  for (const line of hexagram.classic.lines) {
    lines.push(`#### 第 ${line.position} 爻・${line.label}`, "", line.text, "");
  }
  if (hexagram.classic.specialLine) {
    lines.push(
      `#### 特殊爻・${hexagram.classic.specialLine.label}`,
      "",
      hexagram.classic.specialLine.text,
      ""
    );
  }

  lines.push("## 彖傳", "", paragraphs(hexagram.wings.tuan.paragraphs).trimEnd(), "");
  lines.push("## 象傳", "", "### 大象", "", hexagram.wings.xiang.greatImage, "", "### 小象", "");
  for (const image of hexagram.wings.xiang.lineImages) {
    const heading = image.position ? `第 ${image.position} 爻・${image.forLabel}` : image.forLabel;
    lines.push(`#### ${heading}`, "", image.text, "");
  }

  if (hexagram.wings.wenyan) {
    lines.push("## 文言傳", "");
    hexagram.wings.wenyan.groups.forEach((group, groupIndex) => {
      if (hexagram.wings.wenyan.groups.length > 1) {
        lines.push(`### 第 ${groupIndex + 1} 組`, "");
      }
      for (const entry of group.entries) lines.push(entry.text, "");
    });
  }

  lines.push(
    "## 來源",
    "",
    `- [${hexagram.source.title}](${hexagram.source.url})`,
    `- 擷取方式：${hexagram.source.captureMethod || "MediaWiki API"}`,
    ""
  );
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function renderIndex(dataset) {
  const lines = [
    "# 周易六十四卦",
    "",
    "本目錄由 `web/data/zhouyi.json` 自動產生。每卦各有一個 Markdown 檔，內容包含卦辭、爻辭、彖傳、大象、小象，以及乾坤的文言傳。",
    "",
    `- 六十四卦：${dataset.stats.hexagramCount}`,
    `- 一般爻辭：${dataset.stats.regularLineCount}`,
    `- 特殊用九／用六：${dataset.stats.specialLineCount}`,
    "",
    "## 上經",
    ""
  ];
  for (const hexagram of dataset.hexagrams) {
    if (hexagram.number === 31) lines.push("## 下經", "");
    const filename = `${String(hexagram.number).padStart(2, "0")}-${hexagram.name}.md`;
    lines.push(`- [${String(hexagram.number).padStart(2, "0")} ${hexagram.name} ${hexagram.glyph}](./hexagrams/${filename})`);
  }
  lines.push(
    "",
    "## 十翼",
    "",
    "- 彖上、彖下、象上、象下及文言已依所屬卦收入各卦檔案。",
    "- [繫辭上、繫辭下、說卦、序卦、雜卦](./ten-wings/README.md)",
    "",
    `來源：[${dataset.source.title}](${dataset.source.url})`,
    ""
  );
  return lines.join("\n");
}

function renderStandaloneWing(wing) {
  const lines = [
    "---",
    `key: ${yamlString(wing.key)}`,
    `title: ${yamlString(wing.title)}`,
    `source_url: ${yamlString(wing.source.url)}`,
    "---",
    "",
    `# ${wing.title}`,
    ""
  ];
  for (const chapter of wing.chapters) {
    lines.push(`## ${chapter.title}`, "", paragraphs(chapter.paragraphs).trimEnd(), "");
  }
  lines.push(
    "## 來源",
    "",
    `- [${wing.source.title}](${wing.source.url})`,
    `- 擷取方式：${wing.source.captureMethod || "MediaWiki API"}`,
    ""
  );
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function renderWingsIndex(dataset) {
  const lines = [
    "# 十翼",
    "",
    "## 依六十四卦保存",
    "",
    "1. **彖上傳：** 第 1–30 卦的 `彖傳` 區段。",
    "2. **彖下傳：** 第 31–64 卦的 `彖傳` 區段。",
    "3. **象上傳：** 第 1–30 卦的 `大象` 與 `小象` 區段。",
    "4. **象下傳：** 第 31–64 卦的 `大象` 與 `小象` 區段。",
    "5. **文言傳：** 乾、坤兩卦的 `文言傳` 區段。",
    "",
    "## 獨立篇章",
    ""
  ];
  for (const [number, key, label] of STANDALONE_WINGS) {
    const wing = dataset.tenWings[key];
    lines.push(`${Number(number)}. [${wing.title}](./${number}-${label}.md)`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const dataset = JSON.parse(await readFile(INPUT_PATH, "utf8"));
  if (dataset.hexagrams?.length !== 64) throw new Error("Expected exactly 64 hexagrams");
  await mkdir(HEXAGRAM_DIR, { recursive: true });
  await mkdir(WING_DIR, { recursive: true });
  for (const hexagram of dataset.hexagrams) {
    const filename = `${String(hexagram.number).padStart(2, "0")}-${hexagram.name}.md`;
    await writeFile(path.join(HEXAGRAM_DIR, filename), renderHexagram(hexagram), "utf8");
  }
  for (const [number, key, label] of STANDALONE_WINGS) {
    await writeFile(path.join(WING_DIR, `${number}-${label}.md`), renderStandaloneWing(dataset.tenWings[key]), "utf8");
  }
  await writeFile(path.join(OUTPUT_ROOT, "README.md"), renderIndex(dataset), "utf8");
  await writeFile(path.join(WING_DIR, "README.md"), renderWingsIndex(dataset), "utf8");
  console.log(`Wrote 64 hexagram files, 5 standalone Wing files, and indexes to ${OUTPUT_ROOT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
