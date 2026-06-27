import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BlindMapping, CloudSnapshot, EventState, ExperimentSession, Participant, QaQuestion, QuizLiveSession, QuizScore, RandomSource, RatingSummary, StagePreset, SweepResult } from "./types";

const STATE_KEY = "live-event";
const EVENT_EPOCH = "2026-01-01T00:00:00.000Z";
const VALID_SOURCES = new Set(["sweep_random", "focused_true", "distracted_random"]);
const VALID_BLINDS = new Set(["A", "B", "C"]);
const DEFAULT_SESSION_ID = "session-default";

function defaultSessions(): ExperimentSession[] {
  return [{
    id: DEFAULT_SESSION_ID,
    title: "預設場次",
    roundId: DEFAULT_SESSION_ID,
    roundIds: [],
    currentStage: "welcome",
    allowedPages: ["welcome", "qa"],
    showScreenPanel: false,
    activeWordCloudSessionId: undefined,
    wordCloudEnabled: false,
    wordCloudMaxEntriesPerParticipant: 3,
    sweepPlumDensity: 800,
    sweepPlumStdDev: 100,
    sweepLeafDensity: 330,
    sweepLeafStdDev: 45,
    quizQuestionSeconds: 15,
    practiceStep: 1,
    createdAt: EVENT_EPOCH
  }];
}

function defaultStagePresets(): StagePreset[] {
  return [
    {
      id: "preset-sweep",
      name: "Step 1 掃地",
      currentStage: "welcome",
      allowedPages: ["welcome", "qa", "sweep"],
      showScreenPanel: false,
      wordCloudEnabled: false,
      wordCloudMaxEntriesPerParticipant: 3,
      sweepPlumDensity: 800,
      sweepPlumStdDev: 100,
      sweepLeafDensity: 330,
      sweepLeafStdDev: 45,
      quizQuestionSeconds: 15,
      practiceStep: 1,
      createdAt: EVENT_EPOCH
    },
    {
      id: "preset-wordcloud",
      name: "Step 2 文字雲",
      currentStage: "wordcloud",
      allowedPages: ["welcome", "qa", "wordcloud"],
      showScreenPanel: false,
      wordCloudEnabled: true,
      wordCloudPrompt: "說到「易經」你會想到什麼？",
      wordCloudMaxEntriesPerParticipant: 3,
      sweepPlumDensity: 800,
      sweepPlumStdDev: 100,
      sweepLeafDensity: 330,
      sweepLeafStdDev: 45,
      quizQuestionSeconds: 15,
      practiceStep: 1,
      createdAt: EVENT_EPOCH
    },
    {
      id: "preset-casting",
      name: "Step 3 起卦",
      currentStage: "question",
      allowedPages: ["welcome", "qa", "question"],
      showScreenPanel: false,
      wordCloudEnabled: false,
      wordCloudMaxEntriesPerParticipant: 3,
      sweepPlumDensity: 800,
      sweepPlumStdDev: 100,
      sweepLeafDensity: 330,
      sweepLeafStdDev: 45,
      quizQuestionSeconds: 15,
      practiceStep: 1,
      createdAt: EVENT_EPOCH
    },
    {
      id: "preset-quiz",
      name: "Step 4 限時測驗",
      currentStage: "quiz",
      allowedPages: ["welcome", "qa", "quiz"],
      showScreenPanel: true,
      wordCloudEnabled: false,
      wordCloudMaxEntriesPerParticipant: 3,
      sweepPlumDensity: 800,
      sweepPlumStdDev: 100,
      sweepLeafDensity: 330,
      sweepLeafStdDev: 45,
      quizQuestionSeconds: 15,
      practiceStep: 1,
      createdAt: EVENT_EPOCH
    },
    {
      id: "preset-prompt-rating",
      name: "Step 5 My GPT + 三盲評分",
      currentStage: "prompt",
      allowedPages: ["welcome", "qa", "prompt", "rating"],
      showScreenPanel: false,
      wordCloudEnabled: false,
      wordCloudMaxEntriesPerParticipant: 3,
      sweepPlumDensity: 800,
      sweepPlumStdDev: 100,
      sweepLeafDensity: 330,
      sweepLeafStdDev: 45,
      quizQuestionSeconds: 15,
      practiceStep: 1,
      createdAt: EVENT_EPOCH
    },
    {
      id: "preset-practice",
      name: "Step 6 逐步起卦練習",
      currentStage: "practice",
      allowedPages: ["welcome", "qa", "practice"],
      showScreenPanel: false,
      wordCloudEnabled: false,
      wordCloudMaxEntriesPerParticipant: 3,
      sweepPlumDensity: 800,
      sweepPlumStdDev: 100,
      sweepLeafDensity: 330,
      sweepLeafStdDev: 45,
      quizQuestionSeconds: 15,
      practiceStep: 1,
      createdAt: EVENT_EPOCH
    },
    {
      id: "preset-reveal",
      name: "Step 7 揭曉",
      currentStage: "reveal",
      allowedPages: ["welcome", "qa", "reveal"],
      showScreenPanel: true,
      wordCloudEnabled: false,
      wordCloudMaxEntriesPerParticipant: 3,
      sweepPlumDensity: 800,
      sweepPlumStdDev: 100,
      sweepLeafDensity: 330,
      sweepLeafStdDev: 45,
      quizQuestionSeconds: 15,
      practiceStep: 14,
      createdAt: EVENT_EPOCH
    }
  ];
}

const DEFAULT_STAGE_PRESET_IDS = new Set(defaultStagePresets().map((preset) => preset.id));
const LEGACY_STAGE_PRESET_IDS = new Set(["preset-opening", "preset-casting", "preset-quiz", "preset-prompt", "preset-rating"]);

function normalizeStagePresets(presets: StagePreset[] | undefined, basePresets = defaultStagePresets()) {
  const rows = presets?.length ? presets : basePresets;
  const hasLegacyPresets = rows.some((preset) => preset.id === "preset-opening" || preset.allowedPages?.includes("progress") || (preset.id === "preset-quiz" && preset.name.includes("Step 3")));
  if (!hasLegacyPresets) return rows.map((preset) => migrateBuiltInPreset({ ...preset, allowedPages: preset.allowedPages || [] }));
  const custom = rows.filter((preset) => !LEGACY_STAGE_PRESET_IDS.has(preset.id) && !DEFAULT_STAGE_PRESET_IDS.has(preset.id));
  return [...basePresets, ...custom].map((preset) => migrateBuiltInPreset({ ...preset, allowedPages: preset.allowedPages || [] }));
}

function migrateBuiltInPreset(preset: StagePreset): StagePreset {
  if (!DEFAULT_STAGE_PRESET_IDS.has(preset.id)) return preset;
  const migrated = {
    ...preset,
    sweepPlumDensity: preset.sweepPlumDensity === 260 ? 800 : preset.sweepPlumDensity,
    sweepPlumStdDev: preset.sweepPlumStdDev === 35 ? 100 : preset.sweepPlumStdDev
  };
  if (preset.id !== "preset-sweep") return migrated;
  return {
    ...migrated,
    currentStage: "welcome",
    allowedPages: Array.from(new Set(["welcome", "qa", "sweep", ...preset.allowedPages]))
  };
}

function emptySnapshot(): CloudSnapshot {
  return {
    event: {
      id: "live-event",
      title: "梅花易數三盲互動實驗",
      updatedAt: EVENT_EPOCH,
      activeSessionId: DEFAULT_SESSION_ID,
      activeRoundId: DEFAULT_SESSION_ID,
      currentStage: "welcome",
      allowedPages: ["welcome", "qa"],
      revealEnabled: false,
      sweepOpen: false,
      sweepPlumDensity: 800,
      sweepPlumStdDev: 100,
      sweepLeafDensity: 330,
      sweepLeafStdDev: 45,
      quizQuestionSeconds: 15,
      showScreenPanel: false,
      activeWordCloudSessionId: undefined,
      wordCloudEnabled: false,
      wordCloudMaxEntriesPerParticipant: 3,
      roundIndex: 1,
      practiceStep: 1
    },
    sessions: defaultSessions(),
    stagePresets: defaultStagePresets(),
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
    sessionVisits: [],
    ratings: [],
    parses: []
  };
}

function normalizeSession(session: Partial<ExperimentSession>, fallbackEvent: EventState): ExperimentSession {
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
    sweepPlumDensity: session.sweepPlumDensity === 260 ? 800 : (session.sweepPlumDensity ?? fallbackEvent.sweepPlumDensity),
    sweepPlumStdDev: session.sweepPlumStdDev === 35 ? 100 : (session.sweepPlumStdDev ?? fallbackEvent.sweepPlumStdDev),
    sweepLeafDensity: session.sweepLeafDensity ?? fallbackEvent.sweepLeafDensity,
    sweepLeafStdDev: session.sweepLeafStdDev ?? fallbackEvent.sweepLeafStdDev,
    quizQuestionSeconds: session.quizQuestionSeconds ?? fallbackEvent.quizQuestionSeconds,
    practiceStep: session.practiceStep ?? fallbackEvent.practiceStep,
    createdAt: session.createdAt || EVENT_EPOCH
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

export function getSnapshotClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function readSnapshot(client: SupabaseClient, timeoutMs = 10000): Promise<CloudSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data, error } = await client
      .from("app_state")
      .select("snapshot")
      .eq("key", STATE_KEY)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error) throw error;
    return normalizeSnapshot((data?.snapshot || emptySnapshot()) as CloudSnapshot);
  } finally {
    clearTimeout(timeout);
  }
}

export async function readSnapshotVersion(client: SupabaseClient, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data, error } = await client
      .from("app_state")
      .select("updated_at")
      .eq("key", STATE_KEY)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error) throw error;
    return typeof data?.updated_at === "string" ? data.updated_at : EVENT_EPOCH;
  } finally {
    clearTimeout(timeout);
  }
}

export async function writeSnapshot(client: SupabaseClient, incoming: CloudSnapshot, mode: "participant" | "admin" = "participant") {
  const existing = await readSnapshot(client);
  const merged = compactSnapshot(mergeSnapshots(existing, normalizeSnapshot(incoming), mode));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const { error } = await client
      .from("app_state")
      .upsert({ key: STATE_KEY, snapshot: merged, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .abortSignal(controller.signal);
    if (error) throw error;
    return merged;
  } finally {
    clearTimeout(timeout);
  }
}

export function sanitizeSnapshot(snapshot: CloudSnapshot, participantId?: string | null): CloudSnapshot {
  const copy = compactSnapshot(normalizeSnapshot(JSON.parse(JSON.stringify(snapshot)) as CloudSnapshot));
  copy.publicMetrics = {
    participantCount: copy.participants.length,
    sweepCount: copy.sweeps.length,
    quizScoreCount: copy.quizScores.length,
    ratingParticipantCount: new Set(copy.ratings.map((rating) => rating.participantId)).size,
    quizJoinedCount: copy.quizSession
      ? new Set(copy.quizAnswers.filter((answer) => answer.sessionId === copy.quizSession?.id && answer.questionIndex === -1).map((answer) => answer.participantId)).size
      : 0
  };
  copy.participants = copy.participants.map((p) => p.id === participantId ? p : { ...p, recoveryCode: "" });
  if (participantId) {
    copy.participants = copy.participants.filter((participant) => participant.id === participantId);
    copy.stagePresets = [];
    copy.sweeps = copy.sweeps.filter((sweep) => sweep.participantId === participantId);
    copy.randomSources = copy.randomSources.filter((source) => source.participantId === participantId);
    copy.blindMappings = copy.blindMappings.filter((mapping) => mapping.participantId === participantId);
    copy.quizScores = copy.quizScores.filter((score) => score.participantId === participantId);
    copy.quizAnswers = copy.quizAnswers.filter((answer) => answer.participantId === participantId);
    copy.sessionVisits = copy.sessionVisits.filter((visit) => visit.participantId === participantId);
    copy.ratings = copy.ratings.filter((rating) => rating.participantId === participantId);
    copy.parses = copy.parses.filter((parse) => parse.participantId === participantId);
  }
  return copy;
}

function compactSnapshot(snapshot: CloudSnapshot): CloudSnapshot {
  snapshot.sweeps = snapshot.sweeps.map((sweep) => ({ ...sweep, boardItems: undefined }));
  return snapshot;
}

export function findParticipantByRecovery(snapshot: CloudSnapshot, codeOrId: string): Participant | null {
  const needle = codeOrId.trim();
  const code = needle.toUpperCase();
  return snapshot.participants.find((p) => p.id === needle || p.recoveryCode === code) || null;
}

function normalizeSnapshot(snapshot: CloudSnapshot): CloudSnapshot {
  const base = emptySnapshot();
  const sessions = (snapshot.sessions?.length ? snapshot.sessions : base.sessions).map((session) => normalizeSession(session, snapshot.event || base.event));
  const activeSession = sessions.find((session) => session.id === snapshot.event?.activeSessionId) || sessions[0];
  const event = activeSession ? eventFromSession({ ...base.event, ...snapshot.event }, activeSession) : { ...base.event, ...snapshot.event };
  return {
    ...base,
    ...snapshot,
    event,
    sessions,
    stagePresets: normalizeStagePresets(snapshot.stagePresets, base.stagePresets),
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
    sessionVisits: snapshot.sessionVisits || [],
    ratings: snapshot.ratings || [],
    parses: snapshot.parses || []
  };
}

function mergeSnapshots(existing: CloudSnapshot, incoming: CloudSnapshot, mode: "participant" | "admin") {
  const adminWrite = mode === "admin";
  const event = adminWrite
    ? { ...incoming.event, updatedAt: new Date().toISOString() }
    : existing.event;
  return {
    event,
    sessions: adminWrite ? incoming.sessions : existing.sessions,
    stagePresets: adminWrite ? incoming.stagePresets : existing.stagePresets,
    participants: mergeBy(existing.participants, incoming.participants, (x) => x.id, mergeParticipant),
    qa: mergeBy(existing.qa, incoming.qa, (x) => x.id, mergeQa),
    sweeps: mergeBy(existing.sweeps, incoming.sweeps, (x) => `${x.roundId}:${x.participantId}`, (_, next) => next),
    randomSources: mergeBy(existing.randomSources, incoming.randomSources, (x) => `${x.roundId}:${x.participantId}:${x.sourceType}`, (_, next) => next),
    blindMappings: mergeBy(existing.blindMappings, incoming.blindMappings, (x) => `${x.roundId}:${x.participantId}:${x.blindId}`, (_, next) => next),
    quizScores: mergeBy(existing.quizScores, incoming.quizScores, (x) => `${x.roundId}:${x.participantId}`, (_, next) => next),
    quizSession: adminWrite ? incoming.quizSession : existing.quizSession,
    quizAnswers: mergeBy(existing.quizAnswers, incoming.quizAnswers, (x) => `${x.sessionId}:${x.participantId}:${x.questionId}`, (_, next) => next),
    wordCloudSessions: adminWrite ? incoming.wordCloudSessions : existing.wordCloudSessions,
    wordCloudEntries: mergeBy(existing.wordCloudEntries, incoming.wordCloudEntries, (x) => x.id, (_, next) => next),
    sessionVisits: mergeBy(existing.sessionVisits, incoming.sessionVisits, (x) => `${x.sessionId}:${x.participantId}`, (_, next) => next),
    ratings: mergeBy(existing.ratings, incoming.ratings, (x) => `${x.roundId}:${x.participantId}:${x.blindId}`, (_, next) => next),
    parses: mergeBy(existing.parses, incoming.parses, (x) => `${x.roundId}:${x.participantId}`, (_, next) => next)
  };
}

function timestamp(value?: string) {
  return value ? Date.parse(value) || 0 : 0;
}

function latestEvent(existing: EventState, incoming: EventState): EventState {
  return timestamp(incoming.updatedAt) > timestamp(existing.updatedAt) ? incoming : existing;
}

function latestQuizSession(existing: QuizLiveSession | null, incoming: QuizLiveSession | null) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return timestamp(incoming.updatedAt || incoming.createdAt) > timestamp(existing.updatedAt || existing.createdAt) ? incoming : existing;
}

function mergeBy<T>(existing: T[], incoming: T[], keyOf: (item: T) => string, merge: (prev: T, next: T) => T) {
  const map = new Map<string, T>();
  existing.forEach((item) => map.set(keyOf(item), item));
  incoming.forEach((item) => {
    const key = keyOf(item);
    const prev = map.get(key);
    map.set(key, prev ? merge(prev, item) : item);
  });
  return [...map.values()];
}

function mergeParticipant(prev: Participant, next: Participant): Participant {
  return {
    ...prev,
    ...next,
    recoveryCode: next.recoveryCode || prev.recoveryCode
  };
}

function mergeQa(prev: QaQuestion, next: QaQuestion): QaQuestion {
  const likedBy = [...new Set([...(prev.likedBy || []), ...(next.likedBy || [])])];
  return {
    ...prev,
    ...next,
    likedBy,
    likes: likedBy.length || Math.max(prev.likes, next.likes)
  };
}
