import type { HexagramSummary, SourceType } from "./meihua";

export type StageKey =
  | "welcome"
  | "qa"
  | "wordcloud"
  | "sweep"
  | "question"
  | "focused"
  | "quiz"
  | "practice"
  | "prompt"
  | "parser"
  | "rating"
  | "reveal"
  | "progress";

export type BlindId = "A" | "B" | "C" | "D";

export type Participant = {
  id: string;
  recoveryCode: string;
  nickname?: string;
  consented: boolean;
  createdAt: string;
};

export type EventState = {
  id: string;
  title: string;
  activeRoundId: string;
  currentStage: StageKey;
  allowedPages: StageKey[];
  revealEnabled: boolean;
  sweepOpen: boolean;
  sweepPlumDensity: number;
  sweepLeafDensity: number;
  quizQuestionSeconds: number;
  showScreenPanel: boolean;
  activeWordCloudSessionId?: string;
  wordCloudMaxEntriesPerParticipant: number;
  roundIndex: 1 | 2;
  practiceStep: number;
};

export type PublicParticipantData = {
  participantId: string;
  sweepCompleted?: boolean;
  sweep?: SweepResult;
  distracted?: RandomSource;
  focused?: RandomSource;
  blindMapping?: BlindMapping[];
  ratingSubmitted?: boolean;
  quizScore?: QuizScore;
};

export type LocalPrivateData = {
  scenario: string;
  question: string;
  gptPrompt: string;
  gptRaw: string;
  parsedCards: ParsedCard[];
};

export type SweepResult = {
  participantId: string;
  roundId: string;
  plumCount: number;
  leafCount: number;
  foundTrigrams: string[];
  elapsedMs: number;
  hexagram: HexagramSummary;
  completedAt: string;
};

export type RandomSource = {
  participantId: string;
  roundId: string;
  sourceType: SourceType;
  n1: number;
  n2: number;
  hexagram: HexagramSummary;
  note?: string;
  createdAt: string;
};

export type BlindMapping = {
  participantId: string;
  roundId: string;
  blindId: BlindId;
  sourceType: SourceType;
};

export type QaQuestion = {
  id: string;
  participantId: string;
  authorName?: string;
  anonymous: boolean;
  text: string;
  likes: number;
  likedBy: string[];
  hidden: boolean;
  pinned: boolean;
  answered: boolean;
  createdAt: string;
};

export type QuizScore = {
  participantId: string;
  roundId: string;
  displayName: string;
  score: number;
  correctCount: number;
  totalCount: number;
  elapsedMs: number;
  createdAt: string;
};

export type QuizLiveQuestion = {
  id: string;
  kind: "choice" | "random_numbers";
  prompt: string;
  options?: string[];
  answer?: string;
};

export type QuizLiveSession = {
  id: string;
  roundId: string;
  questionCount: number;
  questions: QuizLiveQuestion[];
  currentIndex: number;
  acceptingJoin: boolean;
  started: boolean;
  finished: boolean;
  questionStartedAt?: string;
  createdAt: string;
};

export type QuizLiveAnswer = {
  sessionId: string;
  participantId: string;
  questionId: string;
  questionIndex: number;
  displayName: string;
  answer: string;
  correct: boolean;
  elapsedMs: number;
  score: number;
  n1?: number;
  n2?: number;
  createdAt: string;
};

export type WordCloudSession = {
  id: string;
  eventId: string;
  prompt: string;
  active: boolean;
  createdAt: string;
};

export type WordCloudEntry = {
  id: string;
  sessionId: string;
  participantId: string;
  text: string;
  createdAt: string;
};

export type ParsedStatement = {
  id: string;
  aspect: string;
  text: string;
};

export type ParsedCard = {
  blind_id: BlindId;
  hexagram_echo?: string;
  statements: ParsedStatement[];
  bonus_reading: string;
  caution?: string;
};

export type RatingSummary = {
  participantId: string;
  roundId: string;
  blindId: BlindId;
  checkedCount: number;
  statementTotal: number;
  subjectiveScore: number;
  bonusLiked: boolean;
  forcedChoice: boolean;
  preferenceRank?: number;
  createdAt: string;
};

export type ParseSummary = {
  participantId: string;
  roundId: string;
  parseOk: boolean;
  cardCount: number;
  statementCountEach: number[];
  errorCode?: string;
  createdAt: string;
};

export type CloudSnapshot = {
  event: EventState;
  participants: Participant[];
  qa: QaQuestion[];
  sweeps: SweepResult[];
  randomSources: RandomSource[];
  blindMappings: BlindMapping[];
  quizScores: QuizScore[];
  quizSession?: QuizLiveSession | null;
  quizAnswers: QuizLiveAnswer[];
  wordCloudSessions: WordCloudSession[];
  wordCloudEntries: WordCloudEntry[];
  ratings: RatingSummary[];
  parses: ParseSummary[];
};
