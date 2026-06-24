import type { SourceType } from "./meihua";
import type { BlindMapping, CloudSnapshot, RatingSummary } from "./types";

export type SourceStats = {
  source: SourceType;
  choiceCount: number;
  meanHitRate: number | null;
  meanSubjective: number | null;
  bonusLikes: number;
};

export type StatsResult = {
  nParticipants: number;
  nCompleteForcedChoice: number;
  sourceStats: SourceStats[];
  chiSquare: number | null;
  chiSquareP: number | null;
  trueChoiceCount: number;
  trueChoiceRate: number | null;
  binomialP: number | null;
  alpha: number;
  assumedEffect: number;
  criticalK: number | null;
  power: number | null;
  beta: number | null;
  sampleNeeds: { effect: number; neededN: number | null }[];
  hitPairwise: { comparison: string; meanDiff: number | null }[];
};

const SOURCES: SourceType[] = ["sweep_random", "focused_true", "distracted_random"];
const ALPHA = 0.05;

function mean(values: number[]) {
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
}

function logFactorial(n: number) {
  let out = 0;
  for (let i = 2; i <= n; i += 1) out += Math.log(i);
  return out;
}

function logChoose(n: number, k: number) {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function binomialPmf(n: number, k: number, p: number) {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

export function binomialUpperTail(n: number, k: number, p: number) {
  let sum = 0;
  for (let i = Math.max(0, k); i <= n; i += 1) sum += binomialPmf(n, i, p);
  return Math.min(1, Math.max(0, sum));
}

function binomialLowerTail(n: number, k: number, p: number) {
  let sum = 0;
  for (let i = 0; i <= Math.min(n, k); i += 1) sum += binomialPmf(n, i, p);
  return Math.min(1, Math.max(0, sum));
}

function criticalKForOneTailed(n: number, p0: number, alpha: number) {
  for (let k = 0; k <= n; k += 1) {
    if (binomialUpperTail(n, k, p0) <= alpha) return k;
  }
  return null;
}

function powerFor(n: number, p0: number, p1: number, alpha: number) {
  const criticalK = criticalKForOneTailed(n, p0, alpha);
  if (criticalK === null) return { criticalK: null, power: null, beta: null };
  const beta = binomialLowerTail(n, criticalK - 1, p1);
  return { criticalK, power: 1 - beta, beta };
}

function neededNForPower(effect: number, p0 = 1 / 3, alpha = ALPHA, targetPower = 0.8) {
  for (let n = 10; n <= 500; n += 1) {
    const result = powerFor(n, p0, effect, alpha);
    if (result.power !== null && result.power >= targetPower) return n;
  }
  return null;
}

function chiSquareDf2Survival(x: number) {
  if (x <= 0) return 1;
  return Math.min(1, Math.max(0, Math.exp(-x / 2)));
}

function sourceFor(mapping: BlindMapping[], participantId: string, roundId: string, blindId: string) {
  return mapping.find((m) => m.participantId === participantId && m.roundId === roundId && m.blindId === blindId)?.sourceType || null;
}

function completeParticipantIds(ratings: RatingSummary[], mappings: BlindMapping[], roundIds: string[]) {
  const byParticipant = new Map<string, Set<string>>();
  ratings.forEach((r) => {
    if (!roundIds.includes(r.roundId)) return;
    const src = sourceFor(mappings, r.participantId, r.roundId, r.blindId);
    if (!src) return;
    const set = byParticipant.get(`${r.roundId}:${r.participantId}`) || new Set<string>();
    set.add(src);
    byParticipant.set(`${r.roundId}:${r.participantId}`, set);
  });
  return [...byParticipant.entries()].filter(([, set]) => SOURCES.every((s) => set.has(s))).map(([id]) => id);
}

export function computeStats(snapshot: CloudSnapshot, roundMode: "round1" | "round2" | "combined") : StatsResult {
  const roundIds = snapshot.event
    ? roundMode === "round1"
      ? ["round-1"]
      : roundMode === "round2"
        ? ["round-2"]
        : ["round-1", "round-2"]
    : [];

  const ratings = snapshot.ratings.filter((r) => roundIds.includes(r.roundId));
  const mappings = snapshot.blindMappings.filter((m) => roundIds.includes(m.roundId));
  const completeIds = completeParticipantIds(ratings, mappings, roundIds);
  const sourceStats = SOURCES.map((source) => {
    const rows = ratings.filter((r) => sourceFor(mappings, r.participantId, r.roundId, r.blindId) === source);
    return {
      source,
      choiceCount: rows.filter((r) => r.forcedChoice).length,
      meanHitRate: mean(rows.map((r) => r.checkedCount / Math.max(1, r.statementTotal))),
      meanSubjective: mean(rows.map((r) => r.subjectiveScore)),
      bonusLikes: rows.filter((r) => r.bonusLiked).length
    };
  });

  const totalChoices = sourceStats.reduce((sum, row) => sum + row.choiceCount, 0);
  let chiSquare: number | null = null;
  let chiSquareP: number | null = null;
  if (totalChoices > 0) {
    const expected = totalChoices / SOURCES.length;
    chiSquare = sourceStats.reduce((sum, row) => sum + ((row.choiceCount - expected) ** 2) / expected, 0);
    chiSquareP = chiSquareDf2Survival(chiSquare);
  }

  const trueChoiceCount = sourceStats.find((s) => s.source === "focused_true")?.choiceCount || 0;
  const binomialP = totalChoices ? binomialUpperTail(totalChoices, trueChoiceCount, 1 / SOURCES.length) : null;
  const powerInfo = totalChoices ? powerFor(totalChoices, 1 / SOURCES.length, 0.5, ALPHA) : { criticalK: null, power: null, beta: null };

  const pairwise = (a: SourceType, b: SourceType) => {
    const diffs: number[] = [];
    completeIds.forEach((key) => {
      const [roundId, participantId] = key.split(":");
      const rows = ratings.filter((r) => r.roundId === roundId && r.participantId === participantId);
      const rowA = rows.find((r) => sourceFor(mappings, participantId, roundId, r.blindId) === a);
      const rowB = rows.find((r) => sourceFor(mappings, participantId, roundId, r.blindId) === b);
      if (rowA && rowB) diffs.push(rowA.checkedCount / rowA.statementTotal - rowB.checkedCount / rowB.statementTotal);
    });
    return mean(diffs);
  };

  return {
    nParticipants: completeIds.length,
    nCompleteForcedChoice: totalChoices,
    sourceStats,
    chiSquare,
    chiSquareP,
    trueChoiceCount,
    trueChoiceRate: totalChoices ? trueChoiceCount / totalChoices : null,
    binomialP,
    alpha: ALPHA,
    assumedEffect: 0.5,
    criticalK: powerInfo.criticalK,
    power: powerInfo.power,
    beta: powerInfo.beta,
    sampleNeeds: [0.4, 0.45, 0.5].map((effect) => ({ effect, neededN: neededNForPower(effect, 1 / SOURCES.length) })),
    hitPairwise: [
      { comparison: "專注真卦 vs 掃地隨機卦", meanDiff: pairwise("focused_true", "sweep_random") },
      { comparison: "專注真卦 vs 分心隨機卦", meanDiff: pairwise("focused_true", "distracted_random") }
    ]
  };
}

export function percent(value: number | null, digits = 1) {
  return value === null ? "尚無" : `${(value * 100).toFixed(digits)}%`;
}

export function numberText(value: number | null, digits = 3) {
  return value === null || Number.isNaN(value) ? "尚無" : value.toFixed(digits);
}
