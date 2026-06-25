"use client";

import { currentEarthlyBranch, numbersToHexagram } from "./meihua";
import type {
  BlindId,
  BlindMapping,
  CloudSnapshot,
  EventState,
  ExperimentSession,
  LocalPrivateData,
  Participant,
  ParseSummary,
  PublicParticipantData,
  QaQuestion,
  QuizLiveAnswer,
  QuizLiveQuestion,
  QuizLiveSession,
  QuizScore,
  RandomSource,
  RatingSummary,
  StagePreset,
  StageKey,
  SweepResult,
  WordCloudEntry,
  WordCloudSession
} from "./types";
import type { SourceType } from "./meihua";

const CLOUD_KEY = "bagua_live_cloud_v1";
const PARTICIPANT_KEY = "bagua_live_participant_v1";
const PRIVATE_KEY = "bagua_live_private_v1";
let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;
const EVENT_EPOCH = "2026-01-01T00:00:00.000Z";
const VALID_SOURCES = new Set<SourceType>(["sweep_random", "focused_true", "distracted_random"]);
const VALID_BLINDS = new Set<BlindId>(["A", "B", "C"]);
const DEFAULT_SESSION_ID = "session-default";

export const STAGES: { key: StageKey; label: string }[] = [
  { key: "welcome", label: "進入 / 匿名 ID" },
  { key: "qa", label: "匿名 QA" },
  { key: "wordcloud", label: "文字雲" },
  { key: "sweep", label: "掃梅花樹葉" },
  { key: "question", label: "起卦" },
  { key: "quiz", label: "限時測驗" },
  { key: "prompt", label: "My GPT / JSON" },
  { key: "practice", label: "逐步起卦練習" },
  { key: "rating", label: "三盲評分" },
  { key: "reveal", label: "揭曉與回顧" },
  { key: "progress", label: "個人進度" }
];

export const DEFAULT_EVENT: EventState = {
  id: "live-event",
  title: "梅花易數三盲互動實驗",
  updatedAt: EVENT_EPOCH,
  activeSessionId: DEFAULT_SESSION_ID,
  activeRoundId: DEFAULT_SESSION_ID,
  currentStage: "qa",
  allowedPages: ["welcome", "qa", "wordcloud", "sweep"],
  revealEnabled: false,
  sweepOpen: false,
  sweepPlumDensity: 260,
  sweepPlumStdDev: 35,
  sweepLeafDensity: 330,
  sweepLeafStdDev: 45,
  quizQuestionSeconds: 15,
  showScreenPanel: false,
  activeWordCloudSessionId: undefined,
  wordCloudEnabled: false,
  wordCloudMaxEntriesPerParticipant: 3,
  roundIndex: 1,
  practiceStep: 1
};

export const DEFAULT_SESSIONS: ExperimentSession[] = [
  {
    id: DEFAULT_SESSION_ID,
    title: "預設場次",
    roundId: DEFAULT_SESSION_ID,
    roundIds: [],
    currentStage: DEFAULT_EVENT.currentStage,
    allowedPages: [...DEFAULT_EVENT.allowedPages],
    showScreenPanel: DEFAULT_EVENT.showScreenPanel,
    activeWordCloudSessionId: DEFAULT_EVENT.activeWordCloudSessionId,
    wordCloudEnabled: DEFAULT_EVENT.wordCloudEnabled,
    wordCloudMaxEntriesPerParticipant: DEFAULT_EVENT.wordCloudMaxEntriesPerParticipant,
    sweepPlumDensity: DEFAULT_EVENT.sweepPlumDensity,
    sweepPlumStdDev: DEFAULT_EVENT.sweepPlumStdDev,
    sweepLeafDensity: DEFAULT_EVENT.sweepLeafDensity,
    sweepLeafStdDev: DEFAULT_EVENT.sweepLeafStdDev,
    quizQuestionSeconds: DEFAULT_EVENT.quizQuestionSeconds,
    practiceStep: DEFAULT_EVENT.practiceStep,
    createdAt: EVENT_EPOCH
  }
];

export const DEFAULT_STAGE_PRESETS: StagePreset[] = [
  {
    id: "preset-opening",
    name: "Step 1 QA / 文字雲 / 掃地",
    currentStage: "qa",
    allowedPages: ["welcome", "qa", "wordcloud", "sweep"],
    showScreenPanel: false,
    wordCloudEnabled: true,
    wordCloudMaxEntriesPerParticipant: 3,
    sweepPlumDensity: 260,
    sweepPlumStdDev: 35,
    sweepLeafDensity: 330,
    sweepLeafStdDev: 45,
    quizQuestionSeconds: 15,
    practiceStep: 1,
    createdAt: EVENT_EPOCH
  },
  {
    id: "preset-casting",
    name: "Step 2 起卦",
    currentStage: "question",
    allowedPages: ["welcome", "qa", "question"],
    showScreenPanel: false,
    wordCloudEnabled: false,
    wordCloudMaxEntriesPerParticipant: 3,
    sweepPlumDensity: 260,
    sweepPlumStdDev: 35,
    sweepLeafDensity: 330,
    sweepLeafStdDev: 45,
    quizQuestionSeconds: 15,
    practiceStep: 1,
    createdAt: EVENT_EPOCH
  },
  {
    id: "preset-quiz",
    name: "Step 3 限時測驗",
    currentStage: "quiz",
    allowedPages: ["welcome", "quiz"],
    showScreenPanel: true,
    wordCloudEnabled: false,
    wordCloudMaxEntriesPerParticipant: 3,
    sweepPlumDensity: 260,
    sweepPlumStdDev: 35,
    sweepLeafDensity: 330,
    sweepLeafStdDev: 45,
    quizQuestionSeconds: 15,
    practiceStep: 1,
    createdAt: EVENT_EPOCH
  },
  {
    id: "preset-prompt",
    name: "Step 4 GPT / 練習",
    currentStage: "prompt",
    allowedPages: ["welcome", "prompt", "practice", "progress"],
    showScreenPanel: false,
    wordCloudEnabled: false,
    wordCloudMaxEntriesPerParticipant: 3,
    sweepPlumDensity: 260,
    sweepPlumStdDev: 35,
    sweepLeafDensity: 330,
    sweepLeafStdDev: 45,
    quizQuestionSeconds: 15,
    practiceStep: 1,
    createdAt: EVENT_EPOCH
  },
  {
    id: "preset-rating",
    name: "Step 5 評分 / 揭曉",
    currentStage: "rating",
    allowedPages: ["welcome", "rating", "reveal", "progress"],
    showScreenPanel: true,
    wordCloudEnabled: false,
    wordCloudMaxEntriesPerParticipant: 3,
    sweepPlumDensity: 260,
    sweepPlumStdDev: 35,
    sweepLeafDensity: 330,
    sweepLeafStdDev: 45,
    quizQuestionSeconds: 15,
    practiceStep: 14,
    createdAt: EVENT_EPOCH
  }
];

export const DEFAULT_PRIVATE: LocalPrivateData = {
  domain: "",
  supplement: "",
  gptPrompt: "",
  gptRaw: "",
  parsedCards: []
};

function normalizeSession(session: Partial<ExperimentSession>, fallbackEvent = DEFAULT_EVENT): ExperimentSession {
  const id = session.id || DEFAULT_SESSION_ID;
  const legacyRoundIds = Array.isArray(session.roundIds) ? session.roundIds : [];
  return {
    id,
    title: session.title || `Session ${id}`,
    roundId: session.roundId || id,
    roundIds: legacyRoundIds.filter((roundId) => roundId && roundId !== (session.roundId || id)),
    currentStage: session.currentStage || fallbackEvent.currentStage,
    allowedPages: session.allowedPages?.length ? [...session.allowedPages] : [...fallbackEvent.allowedPages],
    showScreenPanel: session.showScreenPanel ?? fallbackEvent.showScreenPanel,
    activeWordCloudSessionId: session.activeWordCloudSessionId ?? fallbackEvent.activeWordCloudSessionId,
    wordCloudEnabled: session.wordCloudEnabled ?? fallbackEvent.wordCloudEnabled ?? false,
    wordCloudMaxEntriesPerParticipant: session.wordCloudMaxEntriesPerParticipant ?? fallbackEvent.wordCloudMaxEntriesPerParticipant,
    sweepPlumDensity: session.sweepPlumDensity ?? fallbackEvent.sweepPlumDensity,
    sweepPlumStdDev: session.sweepPlumStdDev ?? fallbackEvent.sweepPlumStdDev,
    sweepLeafDensity: session.sweepLeafDensity ?? fallbackEvent.sweepLeafDensity,
    sweepLeafStdDev: session.sweepLeafStdDev ?? fallbackEvent.sweepLeafStdDev,
    quizQuestionSeconds: session.quizQuestionSeconds ?? fallbackEvent.quizQuestionSeconds,
    practiceStep: session.practiceStep ?? fallbackEvent.practiceStep,
    createdAt: session.createdAt || now()
  };
}

function eventFromSession(event: EventState, session: ExperimentSession): EventState {
  return {
    ...event,
    activeSessionId: session.id,
    activeRoundId: session.roundId,
    currentStage: session.currentStage,
    allowedPages: [...session.allowedPages],
    showScreenPanel: session.showScreenPanel,
    activeWordCloudSessionId: session.activeWordCloudSessionId,
    wordCloudEnabled: session.wordCloudEnabled,
    wordCloudMaxEntriesPerParticipant: session.wordCloudMaxEntriesPerParticipant,
    sweepPlumDensity: session.sweepPlumDensity,
    sweepPlumStdDev: session.sweepPlumStdDev,
    sweepLeafDensity: session.sweepLeafDensity,
    sweepLeafStdDev: session.sweepLeafStdDev,
    quizQuestionSeconds: session.quizQuestionSeconds,
    practiceStep: session.practiceStep,
    roundIndex: 1
  };
}

function syncEventToActiveSession(snapshot: CloudSnapshot) {
  const session = snapshot.sessions.find((item) => item.id === snapshot.event.activeSessionId);
  if (!session) return;
  session.roundId = session.roundId || session.id;
  session.currentStage = snapshot.event.currentStage;
  session.allowedPages = [...snapshot.event.allowedPages];
  session.showScreenPanel = snapshot.event.showScreenPanel;
  session.activeWordCloudSessionId = snapshot.event.activeWordCloudSessionId;
  session.wordCloudEnabled = snapshot.event.wordCloudEnabled;
  session.wordCloudMaxEntriesPerParticipant = snapshot.event.wordCloudMaxEntriesPerParticipant;
  session.sweepPlumDensity = snapshot.event.sweepPlumDensity;
  session.sweepPlumStdDev = snapshot.event.sweepPlumStdDev;
  session.sweepLeafDensity = snapshot.event.sweepLeafDensity;
  session.sweepLeafStdDev = snapshot.event.sweepLeafStdDev;
  session.quizQuestionSeconds = snapshot.event.quizQuestionSeconds;
  session.practiceStep = snapshot.event.practiceStep;
}

export function createEmptyCloud(): CloudSnapshot {
  return {
    event: { ...DEFAULT_EVENT, allowedPages: [...DEFAULT_EVENT.allowedPages] },
    sessions: DEFAULT_SESSIONS.map((session) => ({ ...session, allowedPages: [...session.allowedPages], roundIds: [...(session.roundIds || [])] })),
    stagePresets: DEFAULT_STAGE_PRESETS.map((preset) => ({ ...preset, allowedPages: [...preset.allowedPages] })),
    participants: [],
    qa: [],
    sweeps: [],
    randomSources: [],
    blindMappings: [],
    quizScores: [],
    quizSession: null,
    quizAnswers: [],
    wordCloudSessions: [],
    wordCloudEntries: [],
    ratings: [],
    parses: []
  };
}

function normalizeCloud(snapshot: CloudSnapshot): CloudSnapshot {
  const base = createEmptyCloud();
  const sessions = (snapshot.sessions?.length ? snapshot.sessions : base.sessions).map((session) => normalizeSession(session, snapshot.event || base.event));
  const activeSession = sessions.find((session) => session.id === snapshot.event?.activeSessionId) || sessions[0];
  const event = activeSession
    ? eventFromSession({ ...base.event, ...(snapshot.event || {}), allowedPages: snapshot.event?.allowedPages || [...base.event.allowedPages] }, activeSession)
    : { ...base.event, ...(snapshot.event || {}), allowedPages: snapshot.event?.allowedPages || [...base.event.allowedPages] };
  return {
    ...base,
    ...snapshot,
    event,
    sessions,
    stagePresets: (snapshot.stagePresets?.length ? snapshot.stagePresets : base.stagePresets).map((preset) => ({
      ...preset,
      allowedPages: preset.allowedPages || []
    })),
    participants: snapshot.participants || [],
    qa: (snapshot.qa || []).map((q) => ({
      ...q,
      anonymous: q.anonymous ?? true,
      likedBy: q.likedBy || []
    })),
    sweeps: snapshot.sweeps || [],
    randomSources: (snapshot.randomSources || []).filter((row) => VALID_SOURCES.has(row.sourceType)),
    blindMappings: (snapshot.blindMappings || []).filter((row) => VALID_SOURCES.has(row.sourceType) && VALID_BLINDS.has(row.blindId)),
    quizScores: snapshot.quizScores || [],
    quizSession: snapshot.quizSession || null,
    quizAnswers: snapshot.quizAnswers || [],
    wordCloudSessions: snapshot.wordCloudSessions || [],
    wordCloudEntries: snapshot.wordCloudEntries || [],
    ratings: snapshot.ratings || [],
    parses: snapshot.parses || []
  };
}

function now() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((b) => b.toString(36).padStart(2, "0")).join("")}`;
}

function recoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  bytes.forEach((b) => { out += alphabet[b % alphabet.length]; });
  return out;
}

export function loadCloud(): CloudSnapshot {
  if (typeof window === "undefined") return createEmptyCloud();
  const raw = localStorage.getItem(CLOUD_KEY);
  if (!raw) return createEmptyCloud();
  try {
    return normalizeCloud(JSON.parse(raw) as CloudSnapshot);
  } catch {
    return createEmptyCloud();
  }
}

export function saveCloudLocal(snapshot: CloudSnapshot) {
  localStorage.setItem(CLOUD_KEY, JSON.stringify(snapshot));
}

export function saveCloud(snapshot: CloudSnapshot) {
  saveCloudLocal(snapshot);
  queueRemoteCloudSave(snapshot);
}

function queueRemoteCloudSave(snapshot: CloudSnapshot) {
  if (typeof window === "undefined") return;
  if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
  const payload = cloneForRemote(snapshot);
  remoteSaveTimer = setTimeout(() => {
    void pushRemoteCloud(payload);
  }, 250);
}

function cloneForRemote(snapshot: CloudSnapshot): CloudSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as CloudSnapshot;
}

export async function fetchRemoteCloud(participantId?: string): Promise<CloudSnapshot | null> {
  try {
    const suffix = participantId ? `?pid=${encodeURIComponent(participantId)}` : "";
    const res = await fetch(`/api/snapshot${suffix}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json() as { ok?: boolean; snapshot?: CloudSnapshot };
    if (!json.ok) return null;
    if (!json.snapshot) return null;
    return normalizeCloud(json.snapshot);
  } catch {
    return null;
  }
}

export async function pushRemoteCloud(snapshot: CloudSnapshot) {
  try {
    const res = await fetch("/api/snapshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot })
    });
    await res.text();
  } catch {
    // Local-first: a failed remote sync must not break the on-site flow.
  }
}

export async function recoverRemoteParticipant(codeOrId: string): Promise<Participant | null> {
  try {
    const res = await fetch("/api/recover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codeOrId })
    });
    if (!res.ok) return null;
    const json = await res.json() as { ok?: boolean; participant?: Participant };
    return json.ok && json.participant ? json.participant : null;
  } catch {
    return null;
  }
}

export function loadParticipant(): Participant | null {
  const raw = localStorage.getItem(PARTICIPANT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Participant;
  } catch {
    return null;
  }
}

export function saveParticipant(participant: Participant) {
  localStorage.setItem(PARTICIPANT_KEY, JSON.stringify(participant));
  const url = new URL(location.href);
  url.searchParams.set("pid", participant.id);
  history.replaceState(null, "", url.toString());
}

export function ensureParticipant(snapshot: CloudSnapshot) {
  let participant = loadParticipant();
  const pidFromUrl = new URLSearchParams(location.search).get("pid");
  if (!participant && pidFromUrl) {
    participant = snapshot.participants.find((p) => p.id === pidFromUrl) || null;
    if (participant) saveParticipant(participant);
  }
  if (!participant) {
    participant = {
      id: randomId("p"),
      recoveryCode: recoveryCode(),
      nickname: "",
      consented: true,
      createdAt: now()
    };
    snapshot.participants.push(participant);
    saveParticipant(participant);
    saveCloudLocal(snapshot);
  }
  return participant;
}

export function updateParticipantNickname(snapshot: CloudSnapshot, participantId: string, nickname: string) {
  const clean = nickname.trim().slice(0, 24);
  const participant = snapshot.participants.find((p) => p.id === participantId);
  if (!participant) return;
  participant.nickname = clean;
  const local = loadParticipant();
  if (local?.id === participantId) saveParticipant({ ...local, nickname: clean });
}

export function recoverParticipant(snapshot: CloudSnapshot, codeOrId: string) {
  const needle = codeOrId.trim().toUpperCase();
  const found = snapshot.participants.find((p) => p.id === codeOrId.trim() || p.recoveryCode === needle);
  if (!found) return null;
  saveParticipant(found);
  return found;
}

export function loadPrivate(): LocalPrivateData {
  const raw = localStorage.getItem(PRIVATE_KEY);
  if (!raw) return DEFAULT_PRIVATE;
  try {
    return { ...DEFAULT_PRIVATE, ...JSON.parse(raw) } as LocalPrivateData;
  } catch {
    return DEFAULT_PRIVATE;
  }
}

export function savePrivate(data: LocalPrivateData) {
  localStorage.setItem(PRIVATE_KEY, JSON.stringify(data));
}

export function publicData(snapshot: CloudSnapshot, participantId: string, roundId = snapshot.event.activeRoundId): PublicParticipantData {
  return {
    participantId,
    sweepCompleted: snapshot.sweeps.some((s) => s.participantId === participantId && s.roundId === roundId),
    sweep: snapshot.sweeps.find((s) => s.participantId === participantId && s.roundId === roundId),
    distracted: snapshot.randomSources.find((s) => s.participantId === participantId && s.roundId === roundId && s.sourceType === "distracted_random"),
    focused: snapshot.randomSources.find((s) => s.participantId === participantId && s.roundId === roundId && s.sourceType === "focused_true"),
    blindMapping: snapshot.blindMappings.filter((m) => m.participantId === participantId && m.roundId === roundId),
    ratingSubmitted: snapshot.ratings.some((r) => r.participantId === participantId && r.roundId === roundId),
    quizScore: snapshot.quizScores.find((q) => q.participantId === participantId && q.roundId === roundId)
  };
}

export function upsertQa(snapshot: CloudSnapshot, participantId: string, text: string, authorName?: string, anonymous = true) {
  const item: QaQuestion = {
    id: randomId("qa"),
    participantId,
    authorName: authorName?.trim().slice(0, 24),
    anonymous,
    text,
    likes: 0,
    likedBy: [],
    hidden: false,
    pinned: false,
    answered: false,
    createdAt: now()
  };
  snapshot.qa.unshift(item);
}

export function likeQa(snapshot: CloudSnapshot, id: string, participantId: string) {
  const item = snapshot.qa.find((q) => q.id === id);
  if (!item) return;
  item.likedBy ||= [];
  if (item.likedBy.includes(participantId)) return;
  item.likedBy.push(participantId);
  item.likes = item.likedBy.length;
}

export function toggleQa(snapshot: CloudSnapshot, id: string, key: "hidden" | "pinned" | "answered") {
  const item = snapshot.qa.find((q) => q.id === id);
  if (item) item[key] = !item[key];
}

export function saveSweep(snapshot: CloudSnapshot, result: Omit<SweepResult, "hexagram" | "completedAt">) {
  snapshot.sweeps = snapshot.sweeps.filter((s) => !(s.participantId === result.participantId && s.roundId === result.roundId));
  const branch = currentEarthlyBranch();
  const full: SweepResult = {
    ...result,
    hexagram: numbersToHexagram(result.plumCount, result.leafCount, { timeBranchNum: branch.num }),
    completedAt: now()
  };
  snapshot.sweeps.push(full);
  upsertRandomSource(snapshot, result.participantId, result.roundId, "sweep_random", result.plumCount, result.leafCount, undefined, branch.num);
}

export function upsertRandomSource(snapshot: CloudSnapshot, participantId: string, roundId: string, sourceType: SourceType, n1: number, n2: number, note?: string, timeBranchNum?: number) {
  const branchNum = timeBranchNum || currentEarthlyBranch().num;
  const row: RandomSource = {
    participantId,
    roundId,
    sourceType,
    n1: Math.max(1, Math.trunc(n1)),
    n2: Math.max(1, Math.trunc(n2)),
    hexagram: numbersToHexagram(Math.max(1, Math.trunc(n1)), Math.max(1, Math.trunc(n2)), { timeBranchNum: branchNum }),
    note,
    createdAt: now()
  };
  snapshot.randomSources = snapshot.randomSources.filter((s) => !(s.participantId === participantId && s.roundId === roundId && s.sourceType === sourceType));
  snapshot.randomSources.push(row);
}

export function saveQuiz(snapshot: CloudSnapshot, score: QuizScore) {
  snapshot.quizScores = snapshot.quizScores.filter((s) => !(s.participantId === score.participantId && s.roundId === score.roundId));
  snapshot.quizScores.push(score);
}

export function createWordCloudSession(snapshot: CloudSnapshot, prompt: string) {
  const session: WordCloudSession = {
    id: randomId("wc"),
    eventId: snapshot.event.id,
    experimentSessionId: snapshot.event.activeSessionId,
    prompt: prompt.trim() || "請輸入你現在想到的一個關鍵詞",
    active: false,
    createdAt: now()
  };
  snapshot.wordCloudSessions.unshift(session);
  touchEvent(snapshot);
}

export function activateWordCloudSession(snapshot: CloudSnapshot, sessionId: string) {
  snapshot.wordCloudSessions.forEach((s) => { s.active = s.id === sessionId; });
  snapshot.event.activeWordCloudSessionId = sessionId;
  snapshot.event.wordCloudEnabled = true;
  touchEvent(snapshot);
}

export function setWordCloudEnabled(snapshot: CloudSnapshot, enabled: boolean) {
  snapshot.event.wordCloudEnabled = enabled;
  if (!enabled) {
    snapshot.wordCloudSessions.forEach((s) => { s.active = false; });
  } else {
    const activeId = snapshot.event.activeWordCloudSessionId || snapshot.wordCloudSessions.find((s) => s.experimentSessionId === snapshot.event.activeSessionId || !s.experimentSessionId)?.id;
    if (activeId) {
      snapshot.event.activeWordCloudSessionId = activeId;
      snapshot.wordCloudSessions.forEach((s) => { s.active = s.id === activeId; });
    }
  }
  touchEvent(snapshot);
}

export function saveWordCloudEntry(snapshot: CloudSnapshot, entry: Omit<WordCloudEntry, "id" | "createdAt">) {
  snapshot.wordCloudEntries.push({
    ...entry,
    id: randomId("wce"),
    text: entry.text.trim(),
    createdAt: now()
  });
}

export function startQuizLobby(snapshot: CloudSnapshot, roundId: string, questionCount: number, questions: QuizLiveQuestion[]) {
  snapshot.quizSession = {
    id: randomId("quiz"),
    roundId,
    questionCount,
    questions,
    currentIndex: -1,
    acceptingJoin: true,
    started: false,
    finished: false,
    createdAt: now(),
    updatedAt: now()
  };
  snapshot.quizAnswers = snapshot.quizAnswers.filter((a) => a.sessionId !== snapshot.quizSession?.id);
}

export function joinQuiz(snapshot: CloudSnapshot, participantId: string, displayName: string) {
  if (!snapshot.quizSession || snapshot.quizSession.started) return;
  snapshot.quizAnswers = snapshot.quizAnswers.filter((a) => !(a.sessionId === snapshot.quizSession?.id && a.participantId === participantId && a.questionIndex === -1));
  snapshot.quizAnswers.push({
    sessionId: snapshot.quizSession.id,
    participantId,
    questionId: "join",
    questionIndex: -1,
    displayName: displayName.trim() || "匿名",
    answer: "",
    correct: true,
    elapsedMs: 0,
    score: 0,
    createdAt: now()
  });
}

export function advanceQuiz(snapshot: CloudSnapshot) {
  const session = snapshot.quizSession;
  if (!session || session.finished) return;
  session.started = true;
  session.acceptingJoin = false;
  session.currentIndex += 1;
  if (session.currentIndex >= session.questions.length) {
    finishQuiz(snapshot);
    return;
  }
  session.questionStartedAt = now();
  session.updatedAt = now();
}

export function finishQuiz(snapshot: CloudSnapshot) {
  const session = snapshot.quizSession;
  if (!session) return;
  session.finished = true;
  session.acceptingJoin = false;
  session.updatedAt = now();
  const totals = new Map<string, QuizScore>();
  const answers = snapshot.quizAnswers.filter((a) => a.sessionId === session.id && a.questionIndex >= 0);
  answers.forEach((a) => {
    const prev = totals.get(a.participantId) || {
      participantId: a.participantId,
      roundId: session.roundId,
      displayName: a.displayName,
      score: 0,
      correctCount: 0,
      totalCount: session.questions.length,
      elapsedMs: 0,
      createdAt: now()
    };
    prev.score += a.score;
    prev.correctCount += a.correct ? 1 : 0;
    prev.elapsedMs += a.elapsedMs;
    totals.set(a.participantId, prev);
  });
  totals.forEach((score) => saveQuiz(snapshot, score));
}

export function saveQuizAnswer(snapshot: CloudSnapshot, answer: QuizLiveAnswer) {
  snapshot.quizAnswers = snapshot.quizAnswers.filter((a) => !(a.sessionId === answer.sessionId && a.participantId === answer.participantId && a.questionId === answer.questionId));
  snapshot.quizAnswers.push(answer);
}

export function ensureBlindMappings(snapshot: CloudSnapshot, participantId: string, roundId: string) {
  const existing = snapshot.blindMappings.filter((m) => m.participantId === participantId && m.roundId === roundId);
  if (existing.length === 3 && existing.every((m) => VALID_SOURCES.has(m.sourceType) && VALID_BLINDS.has(m.blindId))) return existing;
  const ids: BlindId[] = ["A", "B", "C"];
  const sources: SourceType[] = ["sweep_random", "focused_true", "distracted_random"];
  for (let i = sources.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [sources[i], sources[j]] = [sources[j], sources[i]];
  }
  const rows = ids.map((blindId, i) => ({ participantId, roundId, blindId, sourceType: sources[i] }));
  snapshot.blindMappings = snapshot.blindMappings.filter((m) => !(m.participantId === participantId && m.roundId === roundId));
  snapshot.blindMappings.push(...rows);
  return rows;
}

export function saveParseSummary(snapshot: CloudSnapshot, summary: ParseSummary) {
  snapshot.parses = snapshot.parses.filter((p) => !(p.participantId === summary.participantId && p.roundId === summary.roundId));
  snapshot.parses.push(summary);
}

export function saveRatings(snapshot: CloudSnapshot, rows: RatingSummary[]) {
  if (!rows.length) return;
  const { participantId, roundId } = rows[0];
  snapshot.ratings = snapshot.ratings.filter((r) => !(r.participantId === participantId && r.roundId === roundId));
  snapshot.ratings.push(...rows);
}

export function activeSession(snapshot: CloudSnapshot) {
  return snapshot.sessions.find((session) => session.id === snapshot.event.activeSessionId) || snapshot.sessions[0] || DEFAULT_SESSIONS[0];
}

export function sessionRoundIds(snapshot: CloudSnapshot, sessionIds: string[]) {
  const ids = new Set(sessionIds);
  return snapshot.sessions.filter((session) => ids.has(session.id)).flatMap((session) => [session.roundId || session.id, ...(session.roundIds || [])]);
}

export function createExperimentSession(snapshot: CloudSnapshot, title: string) {
  const id = randomId("session");
  const session: ExperimentSession = {
    id,
    title: title.trim() || `新場次 ${snapshot.sessions.length + 1}`,
    roundId: id,
    roundIds: [],
    currentStage: DEFAULT_EVENT.currentStage,
    allowedPages: [...DEFAULT_EVENT.allowedPages],
    showScreenPanel: DEFAULT_EVENT.showScreenPanel,
    activeWordCloudSessionId: undefined,
    wordCloudEnabled: false,
    wordCloudMaxEntriesPerParticipant: snapshot.event.wordCloudMaxEntriesPerParticipant,
    sweepPlumDensity: snapshot.event.sweepPlumDensity,
    sweepPlumStdDev: snapshot.event.sweepPlumStdDev,
    sweepLeafDensity: snapshot.event.sweepLeafDensity,
    sweepLeafStdDev: snapshot.event.sweepLeafStdDev,
    quizQuestionSeconds: snapshot.event.quizQuestionSeconds,
    practiceStep: 1,
    createdAt: now()
  };
  snapshot.sessions.unshift(session);
  snapshot.event = eventFromSession(snapshot.event, session);
  snapshot.event.roundIndex = 1;
  snapshot.quizSession = null;
  touchEvent(snapshot);
  return session;
}

export function activateExperimentSession(snapshot: CloudSnapshot, sessionId: string) {
  const session = snapshot.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  snapshot.event = eventFromSession(snapshot.event, normalizeSession(session, snapshot.event));
  snapshot.quizSession = null;
  touchEvent(snapshot);
}

export function createStagePreset(snapshot: CloudSnapshot, name: string) {
  const preset: StagePreset = {
    id: randomId("preset"),
    name: name.trim() || `Step ${snapshot.stagePresets.length + 1}`,
    currentStage: snapshot.event.currentStage,
    allowedPages: [...snapshot.event.allowedPages],
    showScreenPanel: snapshot.event.showScreenPanel,
    wordCloudEnabled: snapshot.event.wordCloudEnabled,
    wordCloudMaxEntriesPerParticipant: snapshot.event.wordCloudMaxEntriesPerParticipant,
    sweepPlumDensity: snapshot.event.sweepPlumDensity,
    sweepPlumStdDev: snapshot.event.sweepPlumStdDev,
    sweepLeafDensity: snapshot.event.sweepLeafDensity,
    sweepLeafStdDev: snapshot.event.sweepLeafStdDev,
    quizQuestionSeconds: snapshot.event.quizQuestionSeconds,
    practiceStep: snapshot.event.practiceStep,
    createdAt: now()
  };
  snapshot.stagePresets.push(preset);
  touchEvent(snapshot);
}

export function applyStagePreset(snapshot: CloudSnapshot, presetId: string) {
  const preset = snapshot.stagePresets.find((item) => item.id === presetId);
  if (!preset) return;
  snapshot.event.currentStage = preset.currentStage;
  snapshot.event.allowedPages = [...preset.allowedPages];
  if (!snapshot.event.allowedPages.includes(preset.currentStage)) snapshot.event.allowedPages.push(preset.currentStage);
  snapshot.event.showScreenPanel = preset.showScreenPanel;
  snapshot.event.wordCloudEnabled = preset.wordCloudEnabled;
  snapshot.event.wordCloudMaxEntriesPerParticipant = preset.wordCloudMaxEntriesPerParticipant;
  snapshot.event.sweepPlumDensity = preset.sweepPlumDensity;
  snapshot.event.sweepPlumStdDev = preset.sweepPlumStdDev;
  snapshot.event.sweepLeafDensity = preset.sweepLeafDensity;
  snapshot.event.sweepLeafStdDev = preset.sweepLeafStdDev;
  snapshot.event.quizQuestionSeconds = preset.quizQuestionSeconds;
  snapshot.event.practiceStep = preset.practiceStep;
  if (!snapshot.event.wordCloudEnabled) {
    snapshot.wordCloudSessions.forEach((session) => { session.active = false; });
  } else {
    const target = snapshot.event.activeWordCloudSessionId || snapshot.wordCloudSessions.find((s) => s.experimentSessionId === snapshot.event.activeSessionId || !s.experimentSessionId)?.id;
    if (target) activateWordCloudSession(snapshot, target);
  }
  touchEvent(snapshot);
}

export function deleteStagePreset(snapshot: CloudSnapshot, presetId: string) {
  snapshot.stagePresets = snapshot.stagePresets.filter((preset) => preset.id !== presetId);
  touchEvent(snapshot);
}

export function setStage(snapshot: CloudSnapshot, stage: StageKey) {
  snapshot.event.currentStage = stage;
  if (!snapshot.event.allowedPages.includes(stage)) snapshot.event.allowedPages.push(stage);
  touchEvent(snapshot);
}

export function toggleAllowed(snapshot: CloudSnapshot, stage: StageKey) {
  const set = new Set(snapshot.event.allowedPages);
  if (set.has(stage)) set.delete(stage);
  else set.add(stage);
  snapshot.event.allowedPages = [...set];
  touchEvent(snapshot);
}

export function touchEvent(snapshot: CloudSnapshot) {
  syncEventToActiveSession(snapshot);
  snapshot.event.updatedAt = now();
}

export function resetParticipantRound(snapshot: CloudSnapshot, participantId: string, roundId: string) {
  snapshot.sweeps = snapshot.sweeps.filter((x) => !(x.participantId === participantId && x.roundId === roundId));
  snapshot.randomSources = snapshot.randomSources.filter((x) => !(x.participantId === participantId && x.roundId === roundId));
  snapshot.blindMappings = snapshot.blindMappings.filter((x) => !(x.participantId === participantId && x.roundId === roundId));
  snapshot.ratings = snapshot.ratings.filter((x) => !(x.participantId === participantId && x.roundId === roundId));
  snapshot.parses = snapshot.parses.filter((x) => !(x.participantId === participantId && x.roundId === roundId));
}
