import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BlindMapping, CloudSnapshot, Participant, QaQuestion, QuizScore, RandomSource, RatingSummary, SweepResult } from "./types";

const STATE_KEY = "live-event";

function emptySnapshot(): CloudSnapshot {
  return {
    event: {
      id: "live-event",
      title: "梅花易數三盲互動實驗",
      activeRoundId: "round-1",
      currentStage: "qa",
      allowedPages: ["welcome", "qa", "wordcloud", "sweep"],
      revealEnabled: false,
      sweepOpen: false,
      sweepPlumDensity: 260,
      sweepLeafDensity: 330,
      quizQuestionSeconds: 15,
      showScreenPanel: false,
      activeWordCloudSessionId: undefined,
      wordCloudMaxEntriesPerParticipant: 3,
      roundIndex: 1,
      practiceStep: 1
    },
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
  return {
    ...base,
    ...snapshot,
    event: { ...base.event, ...snapshot.event },
    participants: snapshot.participants || [],
    qa: (snapshot.qa || []).map((q) => ({
      ...q,
      anonymous: q.anonymous ?? true,
      likedBy: q.likedBy || []
    })),
    sweeps: snapshot.sweeps || [],
    randomSources: snapshot.randomSources || [],
    blindMappings: snapshot.blindMappings || [],
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
  return {
    event: incoming.event,
    participants: mergeBy(existing.participants, incoming.participants, (x) => x.id, mergeParticipant),
    qa: mergeBy(existing.qa, incoming.qa, (x) => x.id, mergeQa),
    sweeps: mergeBy(existing.sweeps, incoming.sweeps, (x) => `${x.roundId}:${x.participantId}`, (_, next) => next),
    randomSources: mergeBy(existing.randomSources, incoming.randomSources, (x) => `${x.roundId}:${x.participantId}:${x.sourceType}`, (_, next) => next),
    blindMappings: mergeBy(existing.blindMappings, incoming.blindMappings, (x) => `${x.roundId}:${x.participantId}:${x.blindId}`, (_, next) => next),
    quizScores: mergeBy(existing.quizScores, incoming.quizScores, (x) => `${x.roundId}:${x.participantId}`, (_, next) => next),
    quizSession: incoming.quizSession || existing.quizSession || null,
    quizAnswers: mergeBy(existing.quizAnswers, incoming.quizAnswers, (x) => `${x.sessionId}:${x.participantId}:${x.questionId}`, (_, next) => next),
    wordCloudSessions: mergeBy(existing.wordCloudSessions, incoming.wordCloudSessions, (x) => x.id, (_, next) => next),
    wordCloudEntries: mergeBy(existing.wordCloudEntries, incoming.wordCloudEntries, (x) => x.id, (_, next) => next),
    ratings: mergeBy(existing.ratings, incoming.ratings, (x) => `${x.roundId}:${x.participantId}:${x.blindId}`, (_, next) => next),
    parses: mergeBy(existing.parses, incoming.parses, (x) => `${x.roundId}:${x.participantId}`, (_, next) => next)
  };
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
