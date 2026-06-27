import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://zh.wikisource.org/w/api.php";
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "web/data/zhouyi.json");
const BROWSER_SNAPSHOT_PATH = path.join(PROJECT_ROOT, "data/raw/zhouyi-browser.json");
const USER_AGENT = "bagua-live-experiment/1.0 (educational data preparation)";

const HEXAGRAM_NAMES = [
  "乾", "坤", "屯", "蒙", "需", "訟", "師", "比", "小畜", "履",
  "泰", "否", "同人", "大有", "謙", "豫", "隨", "蠱", "臨", "觀",
  "噬嗑", "賁", "剝", "復", "无妄", "大畜", "頤", "大過", "坎", "離",
  "咸", "恒", "遯", "大壯", "晉", "明夷", "家人", "睽", "蹇", "解",
  "損", "益", "夬", "姤", "萃", "升", "困", "井", "革", "鼎",
  "震", "艮", "漸", "歸妹", "豐", "旅", "巽", "兌", "渙", "節",
  "中孚", "小過", "既濟", "未濟"
];

const STANDALONE_WINGS = [
  ["xiciUpper", "繫辭上", "繫辭上傳"],
  ["xiciLower", "繫辭下", "繫辭下傳"],
  ["shuogua", "說卦", "說卦傳"],
  ["xugua", "序卦", "序卦傳"],
  ["zagua", "雜卦", "雜卦傳"]
];

function resolveLanguageConversion(content) {
  if (!content.includes(":")) return content;
  const variants = content.split(";").map((part) => part.trim()).filter(Boolean);
  const preferred = variants.find((part) => /^(zh-hant|zh-tw):/i.test(part)) || variants[0];
  return preferred.replace(/^[^:]+:/, "");
}

function cleanWikiText(value) {
  let text = value || "";
  text = text.replace(/<!--[^]*?-->/g, "");
  text = text.replace(/-\{([^{}]+)\}-/g, (_, content) => resolveLanguageConversion(content));
  text = text.replace(/\{\{\*\|([^{}]+)\}\}/g, "（$1）");
  text = text.replace(/\{\{gap(?:\|[^{}]*)?\}\}/gi, "");
  for (let i = 0; i < 4; i += 1) text = text.replace(/\{\{[^{}]*\}\}/g, "");
  text = text.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1");
  text = text.replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, "$1");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/'{2,}/g, "");
  text = text.replace(/&nbsp;|&#160;/g, " ");
  text = text.replace(/&amp;/g, "&");
  return text.replace(/[ \t]+/g, " ").replace(/\s+([，。；：！？])/g, "$1").trim();
}

function stripListPrefix(line) {
  return line.replace(/^[*#:;]+\s*/, "");
}

function contentLine(line) {
  return cleanWikiText(stripListPrefix(line));
}

async function fetchPage(requestedTitle) {
  const params = new URLSearchParams({
    action: "parse",
    page: requestedTitle,
    redirects: "1",
    prop: "wikitext|revid",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  let response;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetch(`${API_URL}?${params}`, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) break;
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`${requestedTitle}: HTTP ${response.status}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 1000 * (attempt + 1) ** 2;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  if (!response?.ok) throw new Error(`${requestedTitle}: HTTP ${response?.status || "network error"}`);
  const payload = await response.json();
  if (payload.error || !payload.parse?.wikitext) {
    throw new Error(`${requestedTitle}: ${payload.error?.info || "missing wikitext"}`);
  }
  return {
    requestedTitle,
    resolvedTitle: payload.parse.title,
    revisionId: payload.parse.revid,
    wikitext: payload.parse.wikitext,
    url: `https://zh.wikisource.org/wiki/${encodeURIComponent(payload.parse.title).replace(/%2F/g, "/")}`
  };
}

function markerIndex(lines, marker) {
  return lines.findIndex((line) => cleanWikiText(line).includes(marker));
}

function sectionLines(lines, startMarker, endMarkers) {
  const start = markerIndex(lines, startMarker);
  if (start < 0) return [];
  const endCandidates = endMarkers.map((marker) => markerIndex(lines, marker)).filter((index) => index > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : lines.length;
  return lines.slice(start + 1, end);
}

function parseLabeledStatement(text, index) {
  const separatorCandidates = [text.indexOf("："), text.indexOf("，")].filter((position) => position >= 0);
  const separator = separatorCandidates.length ? Math.min(...separatorCandidates) : -1;
  const label = separator >= 0 ? text.slice(0, separator).trim() : `第${index + 1}爻`;
  return {
    position: index + 1,
    label,
    text: separator >= 0 ? text.slice(separator + 1).trim() : text
  };
}

function parseHexagram(page, expectedNumber, expectedName) {
  const lines = page.wikitext.split(/\r?\n/);
  const numberMatch = cleanWikiText(page.wikitext).match(/第\s*(\d+)\s*卦/);
  const glyphMatch = page.wikitext.match(/alt=([^\]|]+)/);
  const compositionLine = lines.find((line) => /\]\].+下.+上/.test(line));
  const compositionText = compositionLine ? cleanWikiText(compositionLine.replace(/^.*?\]\]\s*/, "")) : "";
  const compositionMatch = compositionText.match(/^(.+?)下(.+?)上$/);

  const classicLines = sectionLines(lines, "易經：", ["彖曰："]);
  const judgmentParagraphs = classicLines
    .filter((line) => /^\*{2,}/.test(line) && !/^\*#/.test(line))
    .map(contentLine)
    .filter(Boolean);
  const allStatements = classicLines
    .filter((line) => /^\*#/.test(line))
    .map(contentLine)
    .filter(Boolean)
    .map(parseLabeledStatement);
  const regularLines = allStatements.slice(0, 6).map((line, index) => ({ ...line, position: index + 1 }));
  const specialLine = allStatements.length > 6
    ? { label: allStatements[6].label, text: allStatements[6].text }
    : null;

  const tuanParagraphs = sectionLines(lines, "彖曰：", ["象曰："])
    .map(contentLine)
    .filter(Boolean);

  const xiangLines = sectionLines(lines, "象曰：", ["文言曰："]);
  const greatImage = xiangLines.find((line) => /^\*{2,}/.test(line) && !/^\*#/.test(line));
  const lineImages = xiangLines
    .filter((line) => /^\*#/.test(line))
    .map(contentLine)
    .filter(Boolean)
    .map((text, index) => ({
      position: index < 6 ? index + 1 : null,
      forLabel: allStatements[index]?.label || null,
      text
    }));

  const wenyanLines = sectionLines(lines, "文言曰：", []);
  const wenyanGroups = [];
  let currentGroup = [];
  for (const line of wenyanLines) {
    if (/^\*:\s*$/.test(line.trim())) {
      if (currentGroup.length) wenyanGroups.push({ entries: currentGroup });
      currentGroup = [];
      continue;
    }
    const text = contentLine(line);
    if (!text) continue;
    currentGroup.push({
      kind: /^\*#/.test(line) ? "line_commentary" : "paragraph",
      text
    });
  }
  if (currentGroup.length) wenyanGroups.push({ entries: currentGroup });

  const sourceName = judgmentParagraphs[0]?.split("：")[0] || expectedName;
  const aliases = new Set([sourceName, expectedName]);
  if (expectedName === "无妄") aliases.add("無妄");
  if (expectedName === "恒") aliases.add("恆");

  return {
    number: Number(numberMatch?.[1] || expectedNumber),
    name: expectedName,
    aliases: [...aliases],
    glyph: glyphMatch?.[1] || String.fromCodePoint(0x4dc0 + expectedNumber - 1),
    canonSection: expectedNumber <= 30 ? "upper" : "lower",
    composition: {
      lowerTrigram: compositionMatch?.[1] || null,
      upperTrigram: compositionMatch?.[2] || null,
      text: compositionText
    },
    classic: {
      judgment: {
        paragraphs: judgmentParagraphs,
        text: judgmentParagraphs.join("\n")
      },
      lines: regularLines,
      specialLine
    },
    wings: {
      tuan: {
        paragraphs: tuanParagraphs,
        text: tuanParagraphs.join("\n")
      },
      xiang: {
        greatImage: greatImage ? contentLine(greatImage) : "",
        lineImages
      },
      wenyan: wenyanGroups.length ? {
        groups: wenyanGroups,
        text: wenyanGroups.flatMap((group) => group.entries.map((entry) => entry.text)).join("\n")
      } : null
    },
    source: {
      title: page.resolvedTitle,
      url: page.url,
      revisionId: page.revisionId
    }
  };
}

function parseStandaloneWing(page, key, shortTitle, title) {
  const lines = page.wikitext.split(/\r?\n/);
  const chapters = [];
  let current = null;
  for (const rawLine of lines) {
    const headingMatch = rawLine.match(/^==\s*(.*?)\s*==\s*$/);
    if (headingMatch) {
      current = { title: cleanWikiText(headingMatch[1]), paragraphs: [] };
      chapters.push(current);
      continue;
    }
    if (!current) continue;
    const text = contentLine(rawLine);
    if (text) current.paragraphs.push(text);
  }
  return {
    key,
    shortTitle,
    title,
    kind: "standalone",
    chapters,
    text: chapters.flatMap((chapter) => chapter.paragraphs).join("\n"),
    source: {
      requestedTitle: page.requestedTitle,
      title: page.resolvedTitle,
      url: page.url,
      revisionId: page.revisionId
    }
  };
}

function browserLines(text) {
  return text.replace(/\r/g, "").split("\n").map((line) => line.trim());
}

function browserSection(lines, startMarker, endMarkers) {
  const start = lines.findIndex((line) => line === startMarker);
  if (start < 0) return [];
  const ends = endMarkers.map((marker) => lines.findIndex((line, index) => index > start && line === marker)).filter((index) => index > start);
  const end = ends.length ? Math.min(...ends) : lines.length;
  return lines.slice(start + 1, end).filter(Boolean);
}

function parseBrowserHexagram(row, expectedNumber, expectedName) {
  const lines = browserLines(row.text);
  const compositionText = lines.find((line) => /^.+下.+上$/.test(line)) || "";
  const compositionMatch = compositionText.match(/^(.+?)下(.+?)上$/);
  const classic = browserSection(lines, "易經：", ["彖曰："]);
  const statementPattern = /^(初[六九]|[六九][二三四五]|上[六九]|用[六九])[：，]/;
  const firstStatement = classic.findIndex((line) => statementPattern.test(line));
  const judgmentParagraphs = classic.slice(0, firstStatement < 0 ? classic.length : firstStatement);
  const allStatements = classic
    .slice(firstStatement < 0 ? classic.length : firstStatement)
    .filter((line) => statementPattern.test(line))
    .map(parseLabeledStatement);
  const regularLines = allStatements.slice(0, 6).map((line, index) => ({ ...line, position: index + 1 }));
  const specialLine = allStatements.length > 6
    ? { label: allStatements[6].label, text: allStatements[6].text }
    : null;
  const tuanParagraphs = browserSection(lines, "彖曰：", ["象曰："]);
  const xiang = browserSection(lines, "象曰：", ["文言曰："]);
  const wenyanParagraphs = browserSection(lines, "文言曰：", []);
  const aliases = new Set([expectedName]);
  if (expectedName === "无妄") aliases.add("無妄");
  if (expectedName === "恒") aliases.add("恆");

  return {
    number: expectedNumber,
    name: expectedName,
    aliases: [...aliases],
    glyph: String.fromCodePoint(0x4dc0 + expectedNumber - 1),
    canonSection: expectedNumber <= 30 ? "upper" : "lower",
    composition: {
      lowerTrigram: compositionMatch?.[1] || null,
      upperTrigram: compositionMatch?.[2] || null,
      text: compositionText
    },
    classic: {
      judgment: {
        paragraphs: judgmentParagraphs,
        text: judgmentParagraphs.join("\n")
      },
      lines: regularLines,
      specialLine
    },
    wings: {
      tuan: {
        paragraphs: tuanParagraphs,
        text: tuanParagraphs.join("\n")
      },
      xiang: {
        greatImage: xiang[0] || "",
        lineImages: xiang.slice(1).map((text, index) => ({
          position: index < 6 ? index + 1 : null,
          forLabel: allStatements[index]?.label || null,
          text
        }))
      },
      wenyan: wenyanParagraphs.length ? {
        groups: [{ entries: wenyanParagraphs.map((text) => ({ kind: "paragraph", text })) }],
        text: wenyanParagraphs.join("\n")
      } : null
    },
    source: {
      title: row.title,
      url: row.url,
      revisionId: null,
      captureMethod: "mcp_router_browser_bridge"
    }
  };
}

function parseBrowserStandaloneWing(row, key, shortTitle, title) {
  const lines = browserLines(row.text);
  const headingPattern = /^(第[一二三四五六七八九十百]+章|上篇|下篇|一篇)編輯$/;
  const chapters = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(headingPattern);
    if (match) {
      current = { title: match[1], paragraphs: [] };
      chapters.push(current);
      continue;
    }
    if (line.endsWith("編輯")) {
      current = null;
      continue;
    }
    if (current && line && line !== "'") current.paragraphs.push(line);
  }
  return {
    key,
    shortTitle,
    title,
    kind: "standalone",
    chapters,
    text: chapters.flatMap((chapter) => chapter.paragraphs).join("\n"),
    source: {
      title: row.title,
      url: row.url,
      revisionId: null,
      captureMethod: "mcp_router_browser_bridge"
    }
  };
}

function assertDataset(dataset) {
  const errors = [];
  if (dataset.hexagrams.length !== 64) errors.push(`expected 64 hexagrams, got ${dataset.hexagrams.length}`);
  const numbers = new Set(dataset.hexagrams.map((hexagram) => hexagram.number));
  if (numbers.size !== 64 || [...numbers].some((number) => number < 1 || number > 64)) errors.push("hexagram numbers are incomplete or duplicated");

  for (const hexagram of dataset.hexagrams) {
    if (!hexagram.classic.judgment.text) errors.push(`${hexagram.name}: missing judgment`);
    if (hexagram.classic.lines.length !== 6) errors.push(`${hexagram.name}: expected 6 lines, got ${hexagram.classic.lines.length}`);
    if (!hexagram.wings.tuan.text) errors.push(`${hexagram.name}: missing tuan`);
    if (!hexagram.wings.xiang.greatImage) errors.push(`${hexagram.name}: missing great image`);
    const expectedLineImages = hexagram.classic.specialLine ? 7 : 6;
    if (hexagram.wings.xiang.lineImages.length !== expectedLineImages) {
      errors.push(`${hexagram.name}: expected ${expectedLineImages} line images, got ${hexagram.wings.xiang.lineImages.length}`);
    }
    if (!hexagram.composition.lowerTrigram || !hexagram.composition.upperTrigram) errors.push(`${hexagram.name}: missing composition`);
  }

  const specialNames = dataset.hexagrams.filter((hexagram) => hexagram.classic.specialLine).map((hexagram) => hexagram.name);
  if (specialNames.join(",") !== "乾,坤") errors.push(`unexpected special lines: ${specialNames.join(",")}`);
  const wenyanNames = dataset.hexagrams.filter((hexagram) => hexagram.wings.wenyan).map((hexagram) => hexagram.name);
  if (wenyanNames.join(",") !== "乾,坤") errors.push(`unexpected Wenyan coverage: ${wenyanNames.join(",")}`);

  const expectedChapterCounts = { xiciUpper: 12, xiciLower: 9, shuogua: 11, xugua: 2, zagua: 1 };
  for (const [key, expectedCount] of Object.entries(expectedChapterCounts)) {
    if (!dataset.tenWings[key]?.chapters.length) errors.push(`${key}: missing chapters`);
    else if (dataset.tenWings[key].chapters.length !== expectedCount) {
      errors.push(`${key}: expected ${expectedCount} chapters, got ${dataset.tenWings[key].chapters.length}`);
    }
  }

  const serialized = JSON.stringify(dataset);
  for (const residue of ["{{", "[[", "<span", "-{", "'''" ]) {
    if (serialized.includes(residue)) errors.push(`unstripped wiki markup remains: ${residue}`);
  }
  if (errors.length) throw new Error(`Dataset validation failed:\n- ${errors.join("\n- ")}`);
}

async function fetchInBatches(items, worker, batchSize = 2) {
  const results = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    results.push(...await Promise.all(batch.map(worker)));
    if (index + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return results;
}

async function main() {
  const retrievedAt = new Date().toISOString();
  const fromBrowser = process.argv.includes("--from-browser");
  let hexagrams;
  let standaloneWings;
  let source;

  if (fromBrowser) {
    const rows = JSON.parse(await readFile(BROWSER_SNAPSHOT_PATH, "utf8"));
    const hexagramRows = rows.filter((row) => row.kind === "hexagram");
    const wingRows = rows.filter((row) => row.kind === "wing");
    hexagrams = HEXAGRAM_NAMES.map((name, index) => {
      const row = hexagramRows.find((candidate) => candidate.name === name);
      if (!row) throw new Error(`Browser snapshot is missing 周易/${name}`);
      return parseBrowserHexagram(row, index + 1, name);
    });
    standaloneWings = Object.fromEntries(STANDALONE_WINGS.map(([key, shortTitle, title]) => {
      const row = wingRows.find((candidate) => candidate.name === shortTitle);
      if (!row) throw new Error(`Browser snapshot is missing 易傳/${shortTitle}`);
      return [key, parseBrowserStandaloneWing(row, key, shortTitle, title)];
    }));
    source = {
      project: "中文維基文庫",
      title: "周易",
      url: "https://zh.wikisource.org/wiki/周易",
      revisionId: null,
      retrievedAt,
      captureMethod: "mcp_router_browser_bridge"
    };
  } else {
    const indexPage = await fetchPage("周易");
    const hexagramPages = await fetchInBatches(
      HEXAGRAM_NAMES,
      (name) => fetchPage(`周易/${name}`)
    );
    hexagrams = hexagramPages.map((page, index) => parseHexagram(page, index + 1, HEXAGRAM_NAMES[index]));
    const standalonePages = await fetchInBatches(
      STANDALONE_WINGS,
      ([, pageName]) => fetchPage(`周易/${pageName}`),
      2
    );
    standaloneWings = Object.fromEntries(standalonePages.map((page, index) => {
      const [key, shortTitle, title] = STANDALONE_WINGS[index];
      return [key, parseStandaloneWing(page, key, shortTitle, title)];
    }));
    source = {
      project: "中文維基文庫",
      title: indexPage.resolvedTitle,
      url: indexPage.url,
      revisionId: indexPage.revisionId,
      retrievedAt,
      captureMethod: "mediawiki_api"
    };
  }

  const upperNumbers = Array.from({ length: 30 }, (_, index) => index + 1);
  const lowerNumbers = Array.from({ length: 34 }, (_, index) => index + 31);
  const dataset = {
    schemaVersion: 1,
    title: "周易經傳結構化資料",
    language: "zh-Hant",
    source,
    stats: {
      hexagramCount: 64,
      regularLineCount: hexagrams.reduce((sum, hexagram) => sum + hexagram.classic.lines.length, 0),
      specialLineCount: hexagrams.filter((hexagram) => hexagram.classic.specialLine).length,
      tenWingPartCount: 10
    },
    hexagrams,
    tenWings: {
      tuanUpper: {
        title: "彖上傳",
        kind: "embedded_by_hexagram",
        hexagramNumbers: upperNumbers,
        fieldPath: "hexagrams[].wings.tuan"
      },
      tuanLower: {
        title: "彖下傳",
        kind: "embedded_by_hexagram",
        hexagramNumbers: lowerNumbers,
        fieldPath: "hexagrams[].wings.tuan"
      },
      xiangUpper: {
        title: "象上傳（大象、小象）",
        kind: "embedded_by_hexagram",
        hexagramNumbers: upperNumbers,
        fieldPath: "hexagrams[].wings.xiang"
      },
      xiangLower: {
        title: "象下傳（大象、小象）",
        kind: "embedded_by_hexagram",
        hexagramNumbers: lowerNumbers,
        fieldPath: "hexagrams[].wings.xiang"
      },
      wenyan: {
        title: "文言傳",
        kind: "embedded_by_hexagram",
        hexagramNumbers: [1, 2],
        fieldPath: "hexagrams[].wings.wenyan"
      },
      ...standaloneWings
    }
  };

  assertDataset(dataset);
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(JSON.stringify(dataset.stats));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
