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
    currentStage: "qa",
    allowedPages: ["welcome", "qa", "wordcloud", "sweep"],
    showScreenPanel: false,
    activeWordCloudSessionId: undefined,
    wordCloudEnabled: false,
    wordCloudMaxEntriesPerParticipant: 3,
    sweepPlumDensity: 260,
    sweepPlumStdDev: 35,
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
}

function emptySnapshot(): CloudSnapshot {
  return {
    event: {
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
    sweepPlumDensity: session.sweepPlumDensity ?? fallbackEvent.sweepPlumDensity,
    sweepPlumStdDev: session.sweepPlumStdDev ?? fallbackEvent.sweepPlumStdDev,
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function readSnapshot(client: SupabaseClient): Promise<CloudSnapshot> {
  const { data, error } = await client
    .from("app_state")
    .select("snapshot")
    .eq("key", STATE_KEY)
    .maybeSingle();
  if (error) throw error;
  return normalizeSnapshot((data?.snapshot || emptySnapshot()) as CloudSnapshot);
}

export async function writeSnapshot(client: SupabaseClient, incoming: CloudSnapshot) {
  const existing = await readSnapshot(client);
  const merged = mergeSnapshots(existing, normalizeSnapshot(incoming));
  const { error } = await client
    .from("app_state")
    .upsert({ key: STATE_KEY, snapshot: merged, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
  return merged;
}

export function sanitizeSnapshot(snapshot: CloudSnapshot, participantId?: string | null): CloudSnapshot {
  const copy = normalizeSnapshot(JSON.parse(JSON.stringify(snapshot)) as CloudSnapshot);
  copy.participants = copy.participants.map((p) => p.id === participantId ? p : { ...p, recoveryCode: "" });
  return copy;
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

function mergeSnapshots(existing: CloudSnapshot, incoming: CloudSnapshot): CloudSnapshot {
  const incomingEventIsNewer = timestamp(incoming.event.updatedAt) > timestamp(existing.event.updatedAt);
  return {
    event: latestEvent(existing.event, incoming.event),
    sessions: mergeBy(existing.sessions, incoming.sessions, (x) => x.id, (prev, next) => incomingEventIsNewer ? next : prev),
    stagePresets: incomingEventIsNewer ? incoming.stagePresets : existing.stagePresets,
    participants: mergeBy(existing.participants, incoming.participants, (x) => x.id, mergeParticipant),
    qa: mergeBy(existing.qa, incoming.qa, (x) => x.id, mergeQa),
    sweeps: mergeBy(existing.sweeps, incoming.sweeps, (x) => `${x.roundId}:${x.participantId}`, (_, next) => next),
    randomSources: mergeBy(existing.randomSources, incoming.randomSources, (x) => `${x.roundId}:${x.participantId}:${x.sourceType}`, (_, next) => next),
    blindMappings: mergeBy(existing.blindMappings, incoming.blindMappings, (x) => `${x.roundId}:${x.participantId}:${x.blindId}`, (_, next) => next),
    quizScores: mergeBy(existing.quizScores, incoming.quizScores, (x) => `${x.roundId}:${x.participantId}`, (_, next) => next),
    quizSession: latestQuizSession(existing.quizSession || null, incoming.quizSession || null),
    quizAnswers: mergeBy(existing.quizAnswers, incoming.quizAnswers, (x) => `${x.sessionId}:${x.participantId}:${x.questionId}`, (_, next) => next),
    wordCloudSessions: mergeBy(existing.wordCloudSessions, incoming.wordCloudSessions, (x) => x.id, (prev, next) => incomingEventIsNewer ? next : prev),
    wordCloudEntries: mergeBy(existing.wordCloudEntries, incoming.wordCloudEntries, (x) => x.id, (_, next) => next),
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
