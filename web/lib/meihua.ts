export type TrigramName = "乾" | "兌" | "離" | "震" | "巽" | "坎" | "艮" | "坤";
export type SourceType = "sweep_random" | "focused_true" | "distracted_random";

export type EarthlyBranchName = "子" | "丑" | "寅" | "卯" | "辰" | "巳" | "午" | "未" | "申" | "酉" | "戌" | "亥";

export type HexagramSummary = {
  n1: number;
  n2: number;
  timeBranchNum: number;
  timeBranchName: EarthlyBranchName;
  method: "standard" | "reversed";
  upperTrigramNum: number;
  lowerTrigramNum: number;
  upperTrigramName: TrigramName;
  lowerTrigramName: TrigramName;
  upperSymbol: string;
  lowerSymbol: string;
  movingLine: number;
  bodyTrigramName: TrigramName;
  useTrigramName: TrigramName;
  hexagramName: string;
  changedHexagramName: string;
  changedUseTrigramName: TrigramName;
  mutualHexagramName: string;
  mutualUpperTrigramName: TrigramName;
  mutualLowerTrigramName: TrigramName;
  bodyElement: string;
  useElement: string;
  elementRelation: string;
  allLines: number[];
};

const EARTHLY_BRANCHES: EarthlyBranchName[] = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

export const TRIGRAMS: Record<number, { name: TrigramName; symbol: string; nature: string; element: string; lines: number[]; keywords: string }> = {
  1: { name: "乾", symbol: "☰", nature: "天", element: "金", lines: [1, 1, 1], keywords: "主導、權威、剛健、領導" },
  2: { name: "兌", symbol: "☱", nature: "澤", element: "金", lines: [1, 1, 0], keywords: "口舌、交流、喜悅、缺口" },
  3: { name: "離", symbol: "☲", nature: "火", element: "火", lines: [1, 0, 1], keywords: "顯現、辨識、名聲、附著" },
  4: { name: "震", symbol: "☳", nature: "雷", element: "木", lines: [1, 0, 0], keywords: "啟動、突發、行動、驚動" },
  5: { name: "巽", symbol: "☴", nature: "風", element: "木", lines: [0, 1, 1], keywords: "滲透、協商、資訊、柔進" },
  6: { name: "坎", symbol: "☵", nature: "水", element: "水", lines: [0, 1, 0], keywords: "風險、隱憂、困局、流動" },
  7: { name: "艮", symbol: "☶", nature: "山", element: "土", lines: [0, 0, 1], keywords: "停止、邊界、阻隔、等待" },
  8: { name: "坤", symbol: "☷", nature: "地", element: "土", lines: [0, 0, 0], keywords: "承載、照顧、資源、順勢" }
};

const HEX: Record<TrigramName, Record<TrigramName, string>> = {
  乾: { 乾: "乾", 兌: "履", 離: "同人", 震: "無妄", 巽: "姤", 坎: "訟", 艮: "遯", 坤: "否" },
  兌: { 乾: "夬", 兌: "兌", 離: "革", 震: "隨", 巽: "大過", 坎: "困", 艮: "咸", 坤: "萃" },
  離: { 乾: "大有", 兌: "睽", 離: "離", 震: "噬嗑", 巽: "鼎", 坎: "未濟", 艮: "旅", 坤: "晉" },
  震: { 乾: "大壯", 兌: "歸妹", 離: "豐", 震: "震", 巽: "恆", 坎: "解", 艮: "小過", 坤: "豫" },
  巽: { 乾: "小畜", 兌: "中孚", 離: "家人", 震: "益", 巽: "巽", 坎: "渙", 艮: "漸", 坤: "觀" },
  坎: { 乾: "需", 兌: "節", 離: "既濟", 震: "屯", 巽: "井", 坎: "坎", 艮: "蹇", 坤: "比" },
  艮: { 乾: "大畜", 兌: "損", 離: "賁", 震: "頤", 巽: "蠱", 坎: "蒙", 艮: "艮", 坤: "剝" },
  坤: { 乾: "泰", 兌: "臨", 離: "明夷", 震: "復", 巽: "升", 坎: "師", 艮: "謙", 坤: "坤" }
};

const SHENG: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const KE: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

export function modOne(n: number, base: number) {
  const r = Math.abs(Math.trunc(n)) % base;
  return r === 0 ? base : r;
}

function numToName(n: number): TrigramName {
  return TRIGRAMS[n].name;
}

export function currentEarthlyBranch(date = new Date()) {
  const hour = date.getHours();
  const index = hour === 23 ? 0 : Math.floor((hour + 1) / 2) % 12;
  return {
    num: index + 1,
    name: EARTHLY_BRANCHES[index]
  };
}

function linesToNum(lines: number[]) {
  return 8 - (lines[0] * 4 + lines[1] * 2 + lines[2]);
}

function changedTrigram(num: number, linePosition: number) {
  const lines = [...TRIGRAMS[num].lines];
  lines[linePosition - 1] = 1 - lines[linePosition - 1];
  return linesToNum(lines);
}

function relation(body: string, use: string) {
  if (body === use) return "體用比和";
  if (SHENG[use] === body) return "用生體";
  if (SHENG[body] === use) return "體生用";
  if (KE[body] === use) return "體剋用";
  if (KE[use] === body) return "用剋體";
  return "未知關係";
}

export function relationForTrigrams(bodyName: TrigramName, useName: TrigramName) {
  const body = Object.values(TRIGRAMS).find((trigram) => trigram.name === bodyName);
  const use = Object.values(TRIGRAMS).find((trigram) => trigram.name === useName);
  return body && use ? relation(body.element, use.element) : "未知關係";
}

function mutual(lines: number[]) {
  const lower = linesToNum([lines[1], lines[2], lines[3]]);
  const upper = linesToNum([lines[2], lines[3], lines[4]]);
  return { upper, lower };
}

export function numbersToHexagram(
  n1: number,
  n2: number,
  options: { timeBranchNum?: number; reversed?: boolean } = {}
): HexagramSummary {
  const branch = options.timeBranchNum ? {
    num: modOne(options.timeBranchNum, 12),
    name: EARTHLY_BRANCHES[modOne(options.timeBranchNum, 12) - 1]
  } : currentEarthlyBranch();
  const upper = options.reversed ? modOne(n2, 8) : modOne(n1, 8);
  const lower = options.reversed ? modOne(n1, 8) : modOne(n2, 8);
  const moving = modOne(n1 + n2 + branch.num, 6);
  const upperName = numToName(upper);
  const lowerName = numToName(lower);
  const allLines = [...TRIGRAMS[lower].lines, ...TRIGRAMS[upper].lines];

  let bodyNum: number;
  let useNum: number;
  let changedUpper = upper;
  let changedLower = lower;
  let changedUse: number;

  if (moving <= 3) {
    bodyNum = upper;
    useNum = lower;
    changedUse = changedTrigram(lower, moving);
    changedLower = changedUse;
  } else {
    bodyNum = lower;
    useNum = upper;
    changedUse = changedTrigram(upper, moving - 3);
    changedUpper = changedUse;
  }

  const changedUpperName = numToName(changedUpper);
  const changedLowerName = numToName(changedLower);
  const mutualNums = mutual(allLines);
  const mutualUpperName = numToName(mutualNums.upper);
  const mutualLowerName = numToName(mutualNums.lower);
  const bodyElement = TRIGRAMS[bodyNum].element;
  const useElement = TRIGRAMS[useNum].element;

  return {
    n1,
    n2,
    timeBranchNum: branch.num,
    timeBranchName: branch.name,
    method: options.reversed ? "reversed" : "standard",
    upperTrigramNum: upper,
    lowerTrigramNum: lower,
    upperTrigramName: upperName,
    lowerTrigramName: lowerName,
    upperSymbol: TRIGRAMS[upper].symbol,
    lowerSymbol: TRIGRAMS[lower].symbol,
    movingLine: moving,
    bodyTrigramName: numToName(bodyNum),
    useTrigramName: numToName(useNum),
    hexagramName: HEX[upperName][lowerName],
    changedHexagramName: HEX[changedUpperName][changedLowerName],
    changedUseTrigramName: numToName(changedUse),
    mutualHexagramName: HEX[mutualUpperName][mutualLowerName],
    mutualUpperTrigramName: mutualUpperName,
    mutualLowerTrigramName: mutualLowerName,
    bodyElement,
    useElement,
    elementRelation: relation(bodyElement, useElement),
    allLines
  };
}

export function sourceLabel(source: SourceType) {
  return {
    sweep_random: "掃地隨機卦",
    focused_true: "專注真卦",
    distracted_random: "分心隨機卦"
  }[source];
}
