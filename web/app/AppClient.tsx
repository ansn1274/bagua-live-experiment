"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import cloud from "d3-cloud";
import {
  BarChart3,
  Check,
  Copy,
  Eye,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound
} from "lucide-react";
import { currentEarthlyBranch, numbersToHexagram, sourceLabel, TRIGRAMS, type SourceType } from "../lib/meihua";
import { buildMyGptUserPrompt, parseGptJson } from "../lib/prompt";
import { computeStats, numberText, percent } from "../lib/statistics";
import {
  DEFAULT_PRIVATE,
  STAGES,
  activateWordCloudSession,
  advanceQuiz,
  createEmptyCloud,
  createWordCloudSession,
  ensureBlindMappings,
  ensureParticipant,
  fetchRemoteCloud,
  finishQuiz,
  joinQuiz,
  likeQa,
  loadCloud,
  loadParticipant,
  loadPrivate,
  publicData,
  recoverParticipant,
  recoverRemoteParticipant,
  resetParticipantRound,
  saveCloud,
  saveCloudLocal,
  saveParseSummary,
  saveParticipant,
  savePrivate,
  saveQuizAnswer,
  saveQuiz,
  saveRatings,
  saveSweep,
  saveWordCloudEntry,
  setStage,
  startQuizLobby,
  toggleAllowed,
  toggleQa,
  updateParticipantNickname,
  upsertQa,
  upsertRandomSource
} from "../lib/store";
import type {
  BlindId,
  CloudSnapshot,
  LocalPrivateData,
  Participant,
  ParsedCard,
  QuizLiveQuestion,
  QuizLiveAnswer,
  RatingSummary,
  StageKey
} from "../lib/types";

type StatsMode = "round1" | "round2" | "combined";
type AdminTab = "session" | "qa" | "wordcloud" | "sweep" | "quiz" | "stats" | "export";

const SOURCE_ORDER: SourceType[] = ["sweep_random", "focused_true", "distracted_random", "focused_reversed"];

const QUIZ = [
  { q: "☲ 是哪一卦？", options: ["乾", "離", "坎", "艮"], answer: "離" },
  { q: "震卦五行屬什麼？", options: ["木", "火", "土", "水"], answer: "木" },
  { q: "坎卦常象徵什麼？", options: ["顯現", "風險", "承載", "喜悅"], answer: "風險" },
  { q: "動爻在下卦時，下卦是？", options: ["體卦", "用卦", "互卦", "變卦"], answer: "用卦" },
  { q: "火剋哪一個五行？", options: ["金", "木", "水", "土"], answer: "金" },
  { q: "乾卦五行屬什麼？", options: ["金", "木", "火", "土"], answer: "金" },
  { q: "坤卦常象徵什麼？", options: ["天", "地", "雷", "風"], answer: "地" },
  { q: "兌卦常象徵什麼？", options: ["喜悅", "險陷", "停止", "入伏"], answer: "喜悅" },
  { q: "艮卦常象徵什麼？", options: ["動", "止", "麗", "順"], answer: "止" },
  { q: "巽卦五行屬什麼？", options: ["木", "土", "金", "水"], answer: "木" },
  { q: "兩數起卦中，動爻母數現在怎麼算？", options: ["第一數", "第二數", "兩數相加", "兩數相加加時間地支數"], answer: "兩數相加加時間地支數" },
  { q: "餘數為 0 時，mod 8 作幾？", options: ["0", "1", "8", "重新抽"], answer: "8" }
];

function buildQuizQuestions(count: number): QuizLiveQuestion[] {
  const shuffled = [...QUIZ].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.max(5, Math.min(10, count)));
  return [
    ...picked.map((q, i) => ({
      id: `q${i + 1}_${Math.random().toString(36).slice(2, 8)}`,
      kind: "choice" as const,
      prompt: q.q,
      options: q.options,
      answer: q.answer
    })),
    {
      id: `random_${Math.random().toString(36).slice(2, 8)}`,
      kind: "random_numbers" as const,
      prompt: "立刻輸入兩個三位數，越快越高分"
    }
  ];
}

function liveQuizScore(correct: boolean, elapsedMs: number) {
  if (!correct) return 0;
  return Math.max(120, 1000 - Math.floor(elapsedMs / 35));
}

const PRACTICE_STEPS = [
  "輸入兩個隨機數",
  "計算第一數 mod 8",
  "計算第二數 mod 8",
  "選擇上卦與下卦",
  "計算動爻",
  "指出動爻位置",
  "判斷體卦與用卦",
  "判斷五行生剋",
  "顯示本卦、變卦、互卦",
  "閱讀卦辭、爻辭",
  "分析體用與五行",
  "分析變卦與體卦",
  "綜合互卦、體用、變卦",
  "回顧真卦 GPT response"
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function now() {
  return new Date().toISOString();
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function getRoundId(snapshot: CloudSnapshot) {
  return snapshot.event.activeRoundId;
}

function eligibleSources(snapshot: CloudSnapshot, participantId: string, roundId = getRoundId(snapshot)) {
  const current = snapshot.randomSources.filter((s) => s.participantId === participantId && s.roundId === roundId);
  const firstRoundDistracted = snapshot.randomSources.find((s) => s.participantId === participantId && s.roundId === "round-1" && s.sourceType === "distracted_random");
  const rows = SOURCE_ORDER.map((source) => {
    const found = current.find((s) => s.sourceType === source);
    if (found) return found;
    if (source === "distracted_random" && firstRoundDistracted) return { ...firstRoundDistracted, roundId };
    if (source === "focused_reversed") {
      const focused = current.find((s) => s.sourceType === "focused_true");
      if (focused) {
        return {
          ...focused,
          sourceType: "focused_reversed" as const,
          hexagram: numbersToHexagram(focused.n1, focused.n2, { timeBranchNum: focused.hexagram.timeBranchNum, reversed: true }),
          note: "derived_from_focused_true_reversed_upper_lower"
        };
      }
    }
    return null;
  });
  return rows.filter(Boolean) as NonNullable<(typeof rows)[number]>[];
}

function currentPageAllowed(snapshot: CloudSnapshot, page: StageKey) {
  return page === "welcome" || snapshot.event.allowedPages.includes(page);
}

function useExperimentState() {
  const [snapshot, setSnapshot] = useState<CloudSnapshot>(() => createEmptyCloud());
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [privateData, setPrivateData] = useState<LocalPrivateData>(DEFAULT_PRIVATE);

  useEffect(() => {
    const cloud = loadCloud();
    const person = ensureParticipant(cloud);
    setSnapshot(loadCloud());
    setParticipant(person);
    setPrivateData(loadPrivate());

    let active = true;
    void fetchRemoteCloud(person.id).then((remote) => {
      if (!active || !remote) return;
      const merged = clone(remote);
      const existing = merged.participants.find((p) => p.id === person.id);
      if (!existing) merged.participants.push(person);
      else if (!existing.recoveryCode) existing.recoveryCode = person.recoveryCode;
      saveCloudLocal(merged);
      setSnapshot(merged);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const sync = () => setSnapshot(loadCloud());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!participant) return;
    let active = true;
    const syncRemote = async () => {
      const remote = await fetchRemoteCloud(participant.id);
      if (!active || !remote) return;
      const merged = clone(remote);
      const localParticipant = loadParticipant();
      if (localParticipant) {
        const existing = merged.participants.find((p) => p.id === localParticipant.id);
        if (!existing) merged.participants.push(localParticipant);
        else if (!existing.recoveryCode) existing.recoveryCode = localParticipant.recoveryCode;
      }
      saveCloudLocal(merged);
      setSnapshot(merged);
    };
    const timer = window.setInterval(syncRemote, 2000);
    void syncRemote();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [participant]);

  const updateCloud = (fn: (draft: CloudSnapshot) => void) => {
    setSnapshot((prev) => {
      const draft = clone(prev);
      fn(draft);
      saveCloud(draft);
      return draft;
    });
  };

  const updatePrivate = (fn: (draft: LocalPrivateData) => void) => {
    const draft = { ...loadPrivate() };
    fn(draft);
    savePrivate(draft);
    setPrivateData(draft);
  };

  return { snapshot, participant, privateData, setParticipant, updateCloud, updatePrivate };
}

function HexMini({ hex }: { hex: ReturnType<typeof numbersToHexagram> }) {
  return (
    <div className="hex-mini">
      <div className="hex-symbols">
        <span>{hex.upperSymbol}</span>
        <span>{hex.lowerSymbol}</span>
      </div>
      <div>
        <strong>{hex.hexagramName} → {hex.changedHexagramName}</strong>
        <p>{hex.upperTrigramName}上{hex.lowerTrigramName}下，{hex.timeBranchName}時={hex.timeBranchNum}，動爻 {hex.movingLine}</p>
        <p>體 {hex.bodyTrigramName}（{hex.bodyElement}） / 用 {hex.useTrigramName}（{hex.useElement}）：{hex.elementRelation}</p>
      </div>
    </div>
  );
}

function WelcomePanel({
  snapshot,
  participant,
  onRecover,
  onNicknameSave
}: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  onRecover: (value: string) => void;
  onNicknameSave: (value: string) => void;
}) {
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState(participant?.nickname || "");
  useEffect(() => {
    setNickname(participant?.nickname || "");
  }, [participant?.nickname]);
  return (
    <section className="panel-card">
      <div className="section-head">
        <UserRound />
        <div>
          <p className="eyebrow">Welcome</p>
          <h2>匿名進入與恢復</h2>
        </div>
      </div>
      <div className="id-card">
        <p>你的匿名 ID</p>
        <strong>{participant?.id || "建立中"}</strong>
        <p>恢復碼</p>
        <strong>{participant?.recoveryCode || "------"}</strong>
      </div>
      <p className="muted">請不要用無痕模式。若瀏覽器資料消失，但 URL 還有 pid 或你記得恢復碼，網站可以取回掃地、測驗、卦象與統計摘要；起卦問題與 GPT 回覆仍只在你自己的裝置。</p>
      <div className="inline-form">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="輸入匿名 ID 或恢復碼" />
        <button onClick={() => onRecover(code)}>恢復</button>
      </div>
      <div className="inline-form">
        <input value={nickname} maxLength={24} onChange={(e) => setNickname(e.target.value)} placeholder="暱稱，可留空" />
        <button disabled={!participant} onClick={() => onNicknameSave(nickname)}>儲存暱稱</button>
      </div>
      <div className="status-line">目前場次：{snapshot.event.title} / Round {snapshot.event.roundIndex}</div>
    </section>
  );
}

function QaPanel({ snapshot, participant, updateCloud, admin = false }: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
  admin?: boolean;
}) {
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const questions = [...snapshot.qa].filter((q) => admin || !q.hidden).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.likes - a.likes);
  return (
    <section className="panel-card">
      <div className="section-head">
        <Send />
        <div>
          <p className="eyebrow">Anonymous QA</p>
          <h2>匿名提問牆</h2>
        </div>
      </div>
      {!admin && (
        <>
          <div className="inline-form">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="輸入想問講者的問題" />
            <button onClick={() => {
              if (!participant || !text.trim()) return;
              const author = anonymous ? undefined : (participant.nickname || participant.id);
              updateCloud((draft) => upsertQa(draft, participant.id, text.trim(), author, anonymous));
              setText("");
            }}>送出</button>
          </div>
          <label className="check-line compact-check">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            <span>匿名留言{participant?.nickname ? `（取消後顯示：${participant.nickname}）` : "（取消後顯示你的 ID）"}</span>
          </label>
        </>
      )}
      <div className="qa-list">
        {questions.map((q) => (
          <div className={`qa-item ${q.pinned ? "pinned" : ""}`} key={q.id}>
            <small>{q.anonymous ? `匿名 ${q.participantId.slice(-4)}` : (q.authorName || q.participantId)}</small>
            <p>{q.text}</p>
            <div className="qa-actions">
              {!admin && participant && <button disabled={(q.likedBy || []).includes(participant.id)} onClick={() => updateCloud((draft) => likeQa(draft, q.id, participant.id))}>讚 {q.likes}</button>}
              {admin && <span>讚 {q.likes}</span>}
              {admin && <button onClick={() => updateCloud((draft) => toggleQa(draft, q.id, "pinned"))}>{q.pinned ? "取消置頂" : "置頂"}</button>}
              {admin && <button onClick={() => updateCloud((draft) => toggleQa(draft, q.id, "hidden"))}>{q.hidden ? "取消隱藏" : "隱藏"}</button>}
              {admin && <button onClick={() => updateCloud((draft) => toggleQa(draft, q.id, "answered"))}>{q.answered ? "未回答" : "已回答"}</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function wordCloudRows(texts: string[]) {
  const stop = new Set(["的", "了", "是", "我", "你", "他", "她", "它", "和", "與", "在", "有", "想", "會", "要", "很", "也", "就"]);
  const counts = new Map<string, number>();
  texts.forEach((text) => {
    const words = text
      .replace(/[^\p{Script=Han}a-zA-Z0-9_\s]/gu, " ")
      .match(/[\p{Script=Han}]{1,4}|[a-zA-Z0-9_]{2,}/gu) || [];
    words.forEach((raw) => {
      const word = raw.trim().toLowerCase();
      if (!word || stop.has(word)) return;
      counts.set(word, (counts.get(word) || 0) + 1);
    });
  });
  const max = Math.max(1, ...counts.values());
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 48)
    .map(([word, count]) => ({ word, count, weight: 0.85 + (count / max) * 2.4 }));
}

type WordCloudRow = ReturnType<typeof wordCloudRows>[number];
type LaidOutWord = WordCloudRow & { text: string; size: number; x?: number; y?: number; rotate?: number };

function WordCloudViz({ rows, compact = false }: { rows: WordCloudRow[]; compact?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [words, setWords] = useState<LaidOutWord[]>([]);
  const height = compact ? 300 : 420;

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!rows.length) {
      setWords([]);
      return;
    }
    const max = Math.max(1, ...rows.map((r) => r.count));
    const layoutWords: LaidOutWord[] = rows.map((row) => ({
      ...row,
      text: row.word,
      size: 16 + Math.sqrt(row.count / max) * (compact ? 42 : 58)
    }));
    const layout = cloud<LaidOutWord>()
      .size([width, height])
      .words(layoutWords)
      .padding(4)
      .rotate((_, i) => (i % 7 === 0 ? -18 : i % 5 === 0 ? 18 : 0))
      .font("Noto Sans TC, Microsoft JhengHei, Arial, sans-serif")
      .fontWeight(800)
      .fontSize((d) => d.size)
      .random(() => 0.5)
      .on("end", (laid) => setWords(laid));
    layout.start();
    return () => {
      layout.stop();
    };
  }, [rows, width, height, compact]);

  return (
    <div ref={ref} className="word-cloud d3-word-cloud">
      {rows.length ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="文字雲">
          <g transform={`translate(${width / 2}, ${height / 2})`}>
            {words.map((word, i) => (
              <text
                key={`${word.text}-${i}`}
                textAnchor="middle"
                transform={`translate(${word.x || 0}, ${word.y || 0}) rotate(${word.rotate || 0})`}
                style={{ fontSize: word.size, fontWeight: 800 }}
              >
                {word.text}
              </text>
            ))}
          </g>
        </svg>
      ) : (
        <p className="muted">等待輸入。</p>
      )}
    </div>
  );
}

function WordCloudPanel({ snapshot, participant, updateCloud }: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
}) {
  const activeId = snapshot.event.activeWordCloudSessionId;
  const session = snapshot.wordCloudSessions.find((s) => s.id === activeId && s.active);
  const [text, setText] = useState("");
  const entries = session ? snapshot.wordCloudEntries.filter((e) => e.sessionId === session.id) : [];
  const myCount = participant ? entries.filter((e) => e.participantId === participant.id).length : 0;
  const limit = Math.max(1, snapshot.event.wordCloudMaxEntriesPerParticipant || 1);
  const remaining = Math.max(0, limit - myCount);
  return (
    <section className="panel-card">
      <div className="section-head">
        <Sparkles />
        <div>
          <p className="eyebrow">Word Cloud</p>
          <h2>文字雲</h2>
        </div>
      </div>
      {!session ? (
        <p className="warn">講者尚未開啟文字雲題目。</p>
      ) : (
        <>
          <h3>{session.prompt}</h3>
          {remaining <= 0 ? (
            <div className="done-box"><Check /><div><strong>已達本題輸入上限</strong><p>等講者開放全場資訊時會顯示文字雲。</p></div></div>
          ) : (
            <>
              <p className="status-line">你還可以送出 {remaining} 次。</p>
              <div className="inline-form">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="輸入一小段文字或關鍵詞" />
                <button disabled={!participant || !text.trim()} onClick={() => {
                  if (!participant || !session || !text.trim()) return;
                  updateCloud((draft) => saveWordCloudEntry(draft, { sessionId: session.id, participantId: participant.id, text }));
                  setText("");
                }}>送出</button>
              </div>
            </>
          )}
          <p className="muted">已收到 {entries.length} 則回覆。</p>
        </>
      )}
    </section>
  );
}

function WordCloudAdminPanel({ snapshot, updateCloud }: {
  snapshot: CloudSnapshot;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
}) {
  const [prompt, setPrompt] = useState("你現在對梅花易數最直覺想到的關鍵詞是什麼？");
  const activeId = snapshot.event.activeWordCloudSessionId;
  const active = snapshot.wordCloudSessions.find((s) => s.id === activeId) || snapshot.wordCloudSessions[0];
  const entries = active ? snapshot.wordCloudEntries.filter((e) => e.sessionId === active.id) : [];
  const rows = wordCloudRows(entries.map((e) => e.text));
  return (
    <section className="panel-card wide">
      <div className="section-head">
        <Sparkles />
        <div>
          <p className="eyebrow">Word Cloud</p>
          <h2>文字雲控制</h2>
        </div>
      </div>
      <div className="inline-form">
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="定義這次文字雲題目" />
        <button onClick={() => updateCloud((draft) => createWordCloudSession(draft, prompt))}>新建並啟用</button>
      </div>
      <div className="inline-form">
        <label>每人可輸入次數
          <input type="number" min={1} max={20} value={snapshot.event.wordCloudMaxEntriesPerParticipant || 1} onChange={(e) => updateCloud((draft) => { draft.event.wordCloudMaxEntriesPerParticipant = Math.max(1, Math.min(20, Number(e.target.value) || 1)); })} />
        </label>
      </div>
      <div className="word-session-list">
        {snapshot.wordCloudSessions.map((s) => (
          <button key={s.id} className={s.id === active?.id ? "selected" : ""} onClick={() => updateCloud((draft) => activateWordCloudSession(draft, s.id))}>
            {s.prompt}<span>{snapshot.wordCloudEntries.filter((e) => e.sessionId === s.id).length}</span>
          </button>
        ))}
      </div>
      <WordCloudViz rows={rows} />
    </section>
  );
}

type SweepItem = { id: string; type: "plum" | "leaf" | "trigram"; x: number; y: number; label?: string };

function makeSweepItems(plumDensity: number, leafDensity: number) {
  const items: SweepItem[] = [];
  for (let i = 0; i < plumDensity; i += 1) items.push({ id: `p${i}`, type: "plum", x: Math.random() * 96 + 2, y: Math.random() * 90 + 5 });
  for (let i = 0; i < leafDensity; i += 1) items.push({ id: `l${i}`, type: "leaf", x: Math.random() * 96 + 2, y: Math.random() * 90 + 5 });
  Object.values(TRIGRAMS).forEach((t, i) => items.push({ id: `t${i}`, type: "trigram", x: Math.random() * 86 + 7, y: Math.random() * 78 + 10, label: `${t.symbol} ${t.name}` }));
  return items;
}

function SweepPanel({ snapshot, participant, updateCloud }: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
}) {
  const [found, setFound] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [sweeping, setSweeping] = useState(false);
  const [startedAt] = useState<number>(() => Date.now());
  const roundId = getRoundId(snapshot);
  const plumDensity = Math.max(20, Math.min(900, snapshot.event.sweepPlumDensity || 260));
  const leafDensity = Math.max(20, Math.min(900, snapshot.event.sweepLeafDensity || 330));
  const items = useMemo(() => makeSweepItems(plumDensity, leafDensity), [plumDensity, leafDensity, roundId, participant?.id]);
  const existing = participant ? publicData(snapshot, participant.id, roundId).sweep : null;
  const plumCount = [...found].filter((id) => id.startsWith("p")).length;
  const leafCount = [...found].filter((id) => id.startsWith("l")).length;
  const foundTrigrams = items.filter((item) => found.has(item.id) && item.type === "trigram").map((item) => item.label || "");
  const complete = !!existing;
  const displayPlum = existing?.plumCount ?? plumCount;
  const displayLeaf = existing?.leafCount ?? leafCount;
  const displayTrigrams = existing?.foundTrigrams.length ?? foundTrigrams.length;
  const collectAt = (clientX: number, clientY: number, el: HTMLDivElement) => {
    if (complete) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    const next = new Set(found);
    const nextRevealed = new Set(revealed);
    items.forEach((item) => {
      const dx = item.x - x;
      const dy = item.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (item.type === "trigram") {
        if (distance < 9) {
          nextRevealed.add(item.id);
          next.add(item.id);
        }
      } else if (distance < 5.7) {
        next.add(item.id);
      }
    });
    setFound(next);
    setRevealed(nextRevealed);
  };
  const finishSweep = () => {
    if (!participant || complete) return;
    updateCloud((draft) => saveSweep(draft, {
      participantId: participant.id,
      roundId,
      plumCount: Math.max(1, plumCount),
      leafCount: Math.max(1, leafCount),
      foundTrigrams,
      elapsedMs: Date.now() - startedAt
    }));
  };
  useEffect(() => {
    if (!complete && foundTrigrams.length === 8) finishSweep();
  }, [complete, foundTrigrams.length]);
  return (
    <section className="panel-card">
      <div className="section-head">
        <Sparkles />
        <div>
          <p className="eyebrow">Sweep Game</p>
          <h2>掃梅花與樹葉，找八個基本卦</h2>
        </div>
      </div>
      {complete && existing && (
        <div className="done-box">
            <Check />
            <div>
              <strong>你已完成掃地，結果已保存。</strong>
              <p>梅花 {existing.plumCount}，樹葉 {existing.leafCount}，找到 {existing.foundTrigrams.length}/8 個八卦。</p>
            </div>
          </div>
      )}
        <>
          <div className="sweep-stats">
            <span>梅花 {displayPlum}</span>
            <span>樹葉 {displayLeaf}</span>
            <span>八卦 {displayTrigrams}/8</span>
          </div>
          <div
            className={`sweep-board ${sweeping ? "sweeping" : ""} ${complete ? "complete" : ""}`}
            onPointerDown={(e) => {
              if (complete) return;
              setSweeping(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              collectAt(e.clientX, e.clientY, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (!complete && sweeping) collectAt(e.clientX, e.clientY, e.currentTarget);
            }}
            onPointerUp={() => setSweeping(false)}
            onPointerCancel={() => setSweeping(false)}
          >
            {items.map((item) => {
              const swept = found.has(item.id);
              const isRevealed = item.type === "trigram" && revealed.has(item.id);
              const visible = item.type === "trigram" ? isRevealed || swept : !swept;
              return (
                visible && (
                  <button
                    key={item.id}
                    type="button"
                    className={`sweep-item ${item.type} ${swept ? "found" : ""} ${isRevealed ? "revealed" : ""}`}
                    style={{ left: `${item.x}%`, top: `${item.y}%` }}
                  >
                    {item.type === "plum" ? "✿" : item.type === "leaf" ? "🍃" : item.label}
                  </button>
                )
              );
            })}
            <div className="brush-hint">{complete ? "掃地已完成，畫面保留供回看" : "按住掃開花葉；八卦露出就會自動收集"}</div>
          </div>
          {!complete && <button className="ghost" onClick={finishSweep}>結束掃地</button>}
          <p className="muted">找齊八個基本卦後會自動完成；梅花與葉子數會作為掃地隨機數。</p>
        </>
    </section>
  );
}

function CastingPanel({ snapshot, participant, privateData, updatePrivate, updateCloud }: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  privateData: LocalPrivateData;
  updatePrivate: (fn: (draft: LocalPrivateData) => void) => void;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
}) {
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const roundId = getRoundId(snapshot);
  const existing = participant ? publicData(snapshot, participant.id, roundId).focused : null;
  return (
    <section className="panel-card">
      <div className="privacy-note">
        <ShieldCheck />
        <div>
          <strong>起卦隱私提醒</strong>
          <p>你的占卜問題、prompt、My GPT 回覆只存在自己的裝置；講者與其他人看不到。My GPT 也會在你自己的帳號中執行。</p>
          <p>請不要使用無痕模式；若 localStorage 消失，私密內容無法恢復。</p>
        </div>
      </div>
      <div className="section-head">
        <ShieldCheck />
        <div>
          <p className="eyebrow">Casting</p>
          <h2>起卦：問題與專注隨機數</h2>
        </div>
      </div>
      <label>大概場景
        <textarea value={privateData.scenario} onChange={(e) => updatePrivate((draft) => { draft.scenario = e.target.value; })} rows={4} placeholder="例如：最近在想要不要參加校隊選拔，但段考快到了，家人也希望我先顧成績。" />
      </label>
      <label>你真正想問的問題
        <textarea value={privateData.question} onChange={(e) => updatePrivate((draft) => { draft.question = e.target.value; })} rows={4} placeholder="例如：我該不該報名這次校隊選拔？這段文字只存在你的裝置，不會上傳。" />
      </label>
      {existing ? (
        <div className="done-box">
          <Check />
          <div>
            <strong>本輪起卦已完成</strong>
            <p>專注數字已保存。卦象不在這一步顯示，後面教學流程再一起推導。</p>
          </div>
        </div>
      ) : (
        <>
          <div className="two-col">
            <label>第一個專注隨機數
              <input inputMode="numeric" value={n1} onChange={(e) => setN1(e.target.value.replace(/\D/g, ""))} />
            </label>
            <label>第二個專注隨機數
              <input inputMode="numeric" value={n2} onChange={(e) => setN2(e.target.value.replace(/\D/g, ""))} />
            </label>
          </div>
          <button className="primary" disabled={!participant || !n1 || !n2 || !privateData.question.trim()} onClick={() => {
            if (!participant) return;
            const branch = currentEarthlyBranch();
            updateCloud((draft) => {
              upsertRandomSource(draft, participant.id, roundId, "focused_true", Number(n1), Number(n2), undefined, branch.num);
              upsertRandomSource(draft, participant.id, roundId, "focused_reversed", Number(n1), Number(n2), "same_focused_numbers_reversed_upper_lower", branch.num);
            });
          }}>保存起卦資料</button>
        </>
      )}
    </section>
  );
}

function QuizPanel({ snapshot, participant, updateCloud }: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
}) {
  const [name, setName] = useState("");
  const [randomPair, setRandomPair] = useState({ n1: "", n2: "" });
  const session = snapshot.quizSession;
  const roundId = getRoundId(snapshot);
  const join = participant && session ? snapshot.quizAnswers.find((a) => a.sessionId === session.id && a.participantId === participant.id && a.questionIndex === -1) : null;
  const currentQuestion = session && session.currentIndex >= 0 ? session.questions[session.currentIndex] : null;
  const currentAnswer = participant && session && currentQuestion ? snapshot.quizAnswers.find((a) => a.sessionId === session.id && a.participantId === participant.id && a.questionId === currentQuestion.id) : null;
  const myAnswers = participant && session ? snapshot.quizAnswers.filter((a) => a.sessionId === session.id && a.participantId === participant.id && a.questionIndex >= 0) : [];
  const totalScore = myAnswers.reduce((sum, a) => sum + a.score, 0);
  const displayName = join?.displayName || name || "匿名";
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (!session?.started || session.finished) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [session?.started, session?.finished, session?.currentIndex]);
  const questionSeconds = Math.max(5, snapshot.event.quizQuestionSeconds || 15);
  const questionStartMs = session?.questionStartedAt ? new Date(session.questionStartedAt).getTime() : nowMs;
  const elapsedSeconds = Math.max(0, (nowMs - questionStartMs) / 1000);
  const secondsLeft = Math.max(0, Math.ceil(questionSeconds - elapsedSeconds));
  const countdownRatio = Math.max(0, Math.min(1, secondsLeft / questionSeconds));
  const submitAnswer = (answer: string, n1?: number, n2?: number) => {
    if (!participant || !session || !currentQuestion || currentAnswer) return;
    const elapsedMs = Math.max(0, Date.now() - new Date(session.questionStartedAt || session.createdAt).getTime());
    const correct = currentQuestion.kind === "random_numbers"
      ? !!n1 && !!n2 && /^\d{3}$/.test(String(n1)) && /^\d{3}$/.test(String(n2))
      : answer === currentQuestion.answer;
    const row: QuizLiveAnswer = {
      sessionId: session.id,
      participantId: participant.id,
      questionId: currentQuestion.id,
      questionIndex: session.currentIndex,
      displayName,
      answer,
      correct,
      elapsedMs,
      score: liveQuizScore(correct, elapsedMs),
      n1,
      n2,
      createdAt: now()
    };
    updateCloud((draft) => {
      saveQuizAnswer(draft, row);
      if (correct && currentQuestion.kind === "random_numbers" && n1 && n2) {
        upsertRandomSource(draft, participant.id, roundId, "distracted_random", n1, n2, "quiz_speed_input");
      }
    });
  };
  return (
    <section className="panel-card">
      <div className="section-head">
        <Trophy />
        <div>
          <p className="eyebrow">Live Quiz</p>
          <h2>Kahoot 式限時測驗</h2>
        </div>
      </div>
      {!session && <p className="warn">等待講者建立本輪測驗。</p>}
      {session && !session.started && (
        <div className="quiz-lobby">
          <p className="status-line">等待講者開始，目前 {snapshot.quizAnswers.filter((a) => a.sessionId === session.id && a.questionIndex === -1).length} 人加入。</p>
          {join ? (
            <div className="done-box"><Check /><div><strong>{join.displayName} 已加入</strong><p>請等講者按開始。</p></div></div>
          ) : (
            <div className="inline-form">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="排行榜姓名 / 暱稱" />
              <button disabled={!participant || !name.trim()} onClick={() => {
                if (!participant) return;
                updateCloud((draft) => joinQuiz(draft, participant.id, name));
              }}>加入測驗</button>
            </div>
          )}
        </div>
      )}
      {session?.started && currentQuestion && (
        <div className="quiz-live-card">
          <p className="status-line">第 {session.currentIndex + 1} / {session.questions.length} 題，累計 {totalScore} 分</p>
          <div className={`countdown ${secondsLeft <= 5 ? "urgent" : ""}`}>
            <strong>{secondsLeft}</strong>
            <div className="countdown-track"><span style={{ width: `${countdownRatio * 100}%` }} /></div>
          </div>
          <h3>{currentQuestion.prompt}</h3>
          {currentQuestion.kind === "choice" ? (
            <div className="option-row live-options">
              {currentQuestion.options?.map((opt) => (
                <button key={opt} disabled={!join || !!currentAnswer} className={currentAnswer?.answer === opt ? "selected" : ""} onClick={() => submitAnswer(opt)}>{opt}</button>
              ))}
            </div>
          ) : (
            <div className="pressure-box">
              <strong>必須輸入兩個三位數</strong>
              <div className="two-col">
                <input inputMode="numeric" maxLength={3} value={randomPair.n1} onChange={(e) => setRandomPair((prev) => ({ ...prev, n1: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />
                <input inputMode="numeric" maxLength={3} value={randomPair.n2} onChange={(e) => setRandomPair((prev) => ({ ...prev, n2: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />
              </div>
              <button disabled={!join || !!currentAnswer || !/^\d{3}$/.test(randomPair.n1) || !/^\d{3}$/.test(randomPair.n2)} onClick={() => submitAnswer(`${randomPair.n1}/${randomPair.n2}`, Number(randomPair.n1), Number(randomPair.n2))}>送出亂數</button>
            </div>
          )}
          {currentAnswer && <div className={currentAnswer.correct ? "done-box" : "warn-box"}><strong>{currentAnswer.correct ? "答對" : "答錯"}</strong><p>本題 {currentAnswer.score} 分，請等講者切下一題。</p></div>}
          {!join && <p className="warn">你沒有加入這輪測驗，只能旁觀。請等下一輪。</p>}
        </div>
      )}
      {session?.finished && <p className="status-line">測驗已結束，請看排行榜。</p>}
    </section>
  );
}

function PromptPanel({ snapshot, participant, privateData, updateCloud, updatePrivate }: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  privateData: LocalPrivateData;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
  updatePrivate: (fn: (draft: LocalPrivateData) => void) => void;
}) {
  const roundId = getRoundId(snapshot);
  const sources = participant ? eligibleSources(snapshot, participant.id, roundId) : [];
  const mappings = participant ? snapshot.blindMappings.filter((m) => m.participantId === participant.id && m.roundId === roundId) : [];
  const hasAllSources = SOURCE_ORDER.every((source) => sources.some((s) => s.sourceType === source));
  const hasFocusedAndSweep = SOURCE_ORDER.filter((source) => source !== "distracted_random").every((source) => sources.some((s) => s.sourceType === source));
  const missingDistracted = hasFocusedAndSweep && !sources.some((s) => s.sourceType === "distracted_random");
  const ready = hasAllSources && mappings.length === 4 && privateData.question.trim();
  const prompt = ready ? buildMyGptUserPrompt(privateData, sources, mappings) : "";
  const [raw, setRaw] = useState(privateData.gptRaw);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (ready && privateData.gptPrompt !== prompt) {
      updatePrivate((draft) => { draft.gptPrompt = prompt; });
    }
  }, [ready, prompt, privateData.gptPrompt, updatePrivate]);
  return (
    <section className="panel-card">
      <div className="section-head">
        <Copy />
        <div>
          <p className="eyebrow">My GPT Workbench</p>
          <h2>產生 prompt 與貼回 JSON</h2>
        </div>
      </div>
      <p className="muted">這裡只產生 user prompt；system prompt 請預先設定在你的 My GPT。prompt 與 GPT 原始 JSON 只存在你的裝置，不會上傳。</p>
      {!hasAllSources && <p className="warn">需要先完成掃地、起卦專注數字、反置對照與分心亂數。</p>}
      {missingDistracted && <button onClick={() => {
        if (!participant) return;
        const a = Math.floor(100 + Math.random() * 900);
        const b = Math.floor(100 + Math.random() * 900);
        updateCloud((draft) => upsertRandomSource(draft, participant.id, roundId, "distracted_random", a, b, "auto_generated_not_participant_input"));
      }}>用系統自動亂數補分心對照</button>}
      {hasAllSources && !mappings.length && <p className="warn">四組卦已完成，請先鎖定 A/B/C/D 盲化順序，再複製 prompt。</p>}
      {hasAllSources && mappings.length === 4 && !privateData.question.trim() && <p className="warn">請先在起卦頁填入你的問題；問題只存在本機。</p>}
      <textarea value={prompt} readOnly rows={16} />
      <div className="actions">
        <button disabled={!ready} onClick={() => void copyText(prompt).then(() => setMessage("Prompt 已複製。")).catch(() => setMessage("複製失敗，請手動全選複製。"))}>複製 prompt</button>
        <button disabled={!hasAllSources || !participant || mappings.length === 4} onClick={() => {
          if (!participant) return;
          updateCloud((draft) => ensureBlindMappings(draft, participant.id, roundId));
        }}>鎖定 A/B/C/D 盲化順序</button>
      </div>
      <div className="panel-card inner">
        <h3>貼回 My GPT JSON</h3>
        <p className="muted">原始 JSON 與 statement 文字只存在本機；雲端只記錄 parse 是否成功、卡片數和每張卡 5 條。</p>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={14} placeholder="貼上 My GPT JSON" />
        <div className="actions">
          <button className="primary" disabled={!participant || !raw.trim()} onClick={() => {
            if (!participant) return;
            const parsed = parseGptJson(raw);
            updatePrivate((draft) => {
              draft.gptRaw = raw;
              draft.parsedCards = parsed.cards;
            });
            updateCloud((draft) => saveParseSummary(draft, {
              participantId: participant.id,
              roundId,
              parseOk: !parsed.error,
              cardCount: parsed.cards.length,
              statementCountEach: parsed.cards.map((c) => c.statements.length),
              errorCode: parsed.error,
              createdAt: now()
            }));
            setMessage(parsed.error ? `解析失敗：${parsed.error}` : "解析成功，可以進入評分。");
          }}>解析並保存摘要</button>
        </div>
        {message && <p className={message.includes("失敗") ? "warn" : "status-line"}>{message}</p>}
      </div>
    </section>
  );
}

function ParserPanel({ snapshot, participant, privateData, updateCloud, updatePrivate }: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  privateData: LocalPrivateData;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
  updatePrivate: (fn: (draft: LocalPrivateData) => void) => void;
}) {
  const [raw, setRaw] = useState(privateData.gptRaw);
  const [message, setMessage] = useState("");
  const roundId = getRoundId(snapshot);
  return (
    <section className="panel-card">
      <div className="section-head">
        <ShieldCheck />
        <div>
          <p className="eyebrow">Parser</p>
          <h2>貼回 My GPT JSON</h2>
        </div>
      </div>
      <p className="muted">原始 JSON 與 statement 文字只存在本機；雲端只記錄 parse 是否成功、卡片數和每張卡 5 條。</p>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={16} placeholder="貼上 My GPT JSON" />
      <div className="actions">
        <button className="primary" disabled={!participant || !raw.trim()} onClick={() => {
          if (!participant) return;
          const parsed = parseGptJson(raw);
          updatePrivate((draft) => {
            draft.gptRaw = raw;
            draft.parsedCards = parsed.cards;
          });
          updateCloud((draft) => saveParseSummary(draft, {
            participantId: participant.id,
            roundId,
            parseOk: !parsed.error,
            cardCount: parsed.cards.length,
            statementCountEach: parsed.cards.map((c) => c.statements.length),
            errorCode: parsed.error,
            createdAt: now()
          }));
          setMessage(parsed.error ? `解析失敗：${parsed.error}` : "解析成功，可以進入評分。");
        }}>解析並保存摘要</button>
      </div>
      {message && <p className={message.includes("失敗") ? "warn" : "status-line"}>{message}</p>}
    </section>
  );
}

function RatingPanel({ snapshot, participant, privateData, updateCloud }: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  privateData: LocalPrivateData;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [ranks, setRanks] = useState<Record<BlindId, number | "">>({ A: "", B: "", C: "", D: "" });
  const roundId = getRoundId(snapshot);
  const submitted = participant ? publicData(snapshot, participant.id, roundId).ratingSubmitted : false;
  const cards = privateData.parsedCards;
  const selectedRanks = cards.map((card) => ranks[card.blind_id]).filter((rank): rank is number => typeof rank === "number");
  const ranksComplete = cards.length === 4 && selectedRanks.length === 4 && new Set(selectedRanks).size === 4;
  return (
    <section className="panel-card">
      <div className="section-head">
        <Check />
        <div>
          <p className="eyebrow">Blind Rating</p>
          <h2>三盲勾選評分</h2>
        </div>
      </div>
      {!cards.length && <p className="warn">尚未解析 My GPT JSON。</p>}
      {submitted && <p className="status-line">你已送出評分，不能重改。</p>}
      <div className="card-grid">
        {cards.map((card) => (
          <div className="reading-card" key={card.blind_id}>
            <h3>解讀 {card.blind_id}</h3>
            <p className="muted">{card.hexagram_echo}</p>
            {card.statements.map((s) => {
              const key = `${card.blind_id}:${s.id}`;
              return (
                <label className="check-line" key={key}>
                  <input type="checkbox" disabled={submitted} checked={!!checked[key]} onChange={(e) => setChecked((prev) => ({ ...prev, [key]: e.target.checked }))} />
                  <span><strong>{s.aspect}</strong> {s.text}</span>
                </label>
              );
            })}
            <div className="bonus-box">{card.bonus_reading}</div>
            <label>喜好排序
              <select disabled={submitted} value={ranks[card.blind_id]} onChange={(e) => setRanks((prev) => ({ ...prev, [card.blind_id]: e.target.value ? Number(e.target.value) : "" }))}>
                <option value="">未排序</option>
                {[1, 2, 3, 4].map((rank) => <option key={rank} value={rank} disabled={selectedRanks.includes(rank) && ranks[card.blind_id] !== rank}>第 {rank} 名</option>)}
              </select>
            </label>
          </div>
        ))}
      </div>
      <button className="primary" disabled={!participant || submitted || !ranksComplete} onClick={() => {
        if (!participant) return;
        const rows: RatingSummary[] = cards.map((card) => ({
          preferenceRank: typeof ranks[card.blind_id] === "number" ? ranks[card.blind_id] as number : undefined,
          participantId: participant.id,
          roundId,
          blindId: card.blind_id,
          checkedCount: card.statements.filter((s) => checked[`${card.blind_id}:${s.id}`]).length,
          statementTotal: card.statements.length,
          subjectiveScore: typeof ranks[card.blind_id] === "number" ? 5 - (ranks[card.blind_id] as number) : 0,
          bonusLiked: ranks[card.blind_id] === 1,
          forcedChoice: ranks[card.blind_id] === 1,
          createdAt: now()
        }));
        updateCloud((draft) => saveRatings(draft, rows));
      }}>送出評分</button>
    </section>
  );
}

function RevealPanel({ snapshot, participant, privateData }: {
  snapshot: CloudSnapshot;
  participant: Participant | null;
  privateData: LocalPrivateData;
}) {
  const roundId = getRoundId(snapshot);
  const mappings = participant ? snapshot.blindMappings.filter((m) => m.participantId === participant.id && m.roundId === roundId) : [];
  const trueBlind = mappings.find((m) => m.sourceType === "focused_true")?.blindId;
  const sourceByBlind = new Map(mappings.map((m) => [m.blindId, m.sourceType]));
  return (
    <section className="panel-card">
      <div className="section-head">
        <Eye />
        <div>
          <p className="eyebrow">Reveal</p>
          <h2>揭曉與真卦回顧</h2>
        </div>
      </div>
      <p className="muted">這只讀你本機保存的 My GPT 回覆，不會上雲端。若本機資料消失，請回自己的 My GPT 查看剛剛的回答。</p>
      <div className="card-grid">
        {privateData.parsedCards.length ? privateData.parsedCards.map((card) => {
          const isTrue = card.blind_id === trueBlind;
          const source = sourceByBlind.get(card.blind_id);
          return (
            <div key={card.blind_id} className={`reading-card reveal-reading ${isTrue ? "true" : ""}`}>
              <h3>解讀 {card.blind_id} {isTrue ? "真卦" : ""}</h3>
              <p className="status-line">{source ? sourceLabel(source) : "尚未鎖定來源"}</p>
              <p className="muted">{card.hexagram_echo}</p>
              <div className="bonus-box">{card.bonus_reading}</div>
              {card.statements.map((s) => <p key={s.id}>・<strong>{s.aspect}</strong> {s.text}</p>)}
            </div>
          );
        }) : <p className="muted">尚未解析 My GPT JSON。</p>}
      </div>
    </section>
  );
}

function PracticePanel({ snapshot, participant }: { snapshot: CloudSnapshot; participant: Participant | null }) {
  const roundId = getRoundId(snapshot);
  const focused = participant ? publicData(snapshot, participant.id, roundId).focused : null;
  const step = snapshot.event.practiceStep;
  if (!focused) {
    return (
      <section className="panel-card">
        <div className="section-head">
          <BarChart3 />
          <div>
            <p className="eyebrow">Guided Practice</p>
            <h2>跟著講者一步一步算卦</h2>
          </div>
        </div>
        <p className="warn">你還沒有完成起卦。請先回「起卦」頁填問題與兩個專注隨機數。</p>
        <p className="muted">限時測驗最後一題只是分心亂數；逐步起卦練習會使用你自己的專注起卦數字。</p>
      </section>
    );
  }
  const h = focused.hexagram;
  const cards = [
    { at: 1, title: "起卦數字與時間地支", body: <p>第一數 {focused.n1}，第二數 {focused.n2}，時間地支 {h.timeBranchName}={h.timeBranchNum}</p> },
    { at: 2, title: "第一數 mod 8", body: <PracticeCheck label={`${focused.n1} mod 8（0 作 8）`} answer={h.upperTrigramNum} /> },
    { at: 3, title: "第二數 mod 8", body: <PracticeCheck label={`${focused.n2} mod 8（0 作 8）`} answer={h.lowerTrigramNum} /> },
    { at: 4, title: "上卦與下卦", body: <p>上卦：{h.upperTrigramName} {h.upperSymbol}；下卦：{h.lowerTrigramName} {h.lowerSymbol}</p> },
    { at: 5, title: "動爻", body: <PracticeCheck label={`(${focused.n1}+${focused.n2}+${h.timeBranchNum}) mod 6（0 作 6）`} answer={h.movingLine} /> },
    { at: 6, title: "動爻位置", body: <p>動爻在第 {h.movingLine} 爻，{h.movingLine <= 3 ? "下卦動" : "上卦動"}。</p> },
    { at: 7, title: "體卦與用卦", body: <p>體卦：{h.bodyTrigramName}；用卦：{h.useTrigramName}</p> },
    { at: 8, title: "五行生剋", body: <p>體 {h.bodyElement}、用 {h.useElement}，{h.elementRelation}</p> },
    { at: 9, title: "本卦、變卦、互卦", body: <HexMini hex={h} /> },
    { at: 10, title: "卦辭、爻辭", body: <div className="muted">卦辭、爻辭資料庫尚未接入；目前先保留教學位置。</div> },
    { at: 11, title: "體用與五行分析", body: <div className="bonus-box">先判斷主體是被生、被剋、比和，還是主體去生/剋外在。</div> },
    { at: 12, title: "變卦與體卦分析", body: <div className="bonus-box">看動爻造成哪一卦變化，變卦用來描述結果趨勢。</div> },
    { at: 13, title: "互卦綜合", body: <div className="bonus-box">互卦補充中間過程與內在壓力，再合併體用與變卦。</div> },
    { at: 14, title: "回顧真卦 GPT response", body: <div className="bonus-box">請回顧真卦 My GPT response；若本機資料消失，請回自己的 My GPT 查看。</div> }
  ];
  return (
    <section className="panel-card">
      <div className="section-head">
        <BarChart3 />
        <div>
          <p className="eyebrow">Guided Practice</p>
          <h2>跟著講者一步一步算卦</h2>
        </div>
      </div>
      <p className="status-line">目前步驟 {step}：{PRACTICE_STEPS[step - 1]}</p>
      <div className="practice-stack">
        {cards.filter((card) => step >= card.at).map((card) => (
          <div className="practice-card" key={card.at}>
            <span>Step {card.at}</span>
            <h3>{card.title}</h3>
            {card.body}
          </div>
        ))}
      </div>
    </section>
  );
}

function PracticeCheck({ label, answer }: { label: string; answer: number }) {
  const [value, setValue] = useState("");
  const ok = Number(value) === answer;
  return (
    <div className="inline-form practice-check">
      <label>{label}<input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} /></label>
      <span className={value ? ok ? "ok" : "bad" : "muted"}>{value ? ok ? "正確" : `再算一次，答案是 ${answer}` : "等待輸入"}</span>
    </div>
  );
}

function AdminPanel({ snapshot, updateCloud }: {
  snapshot: CloudSnapshot;
  updateCloud: (fn: (draft: CloudSnapshot) => void) => void;
}) {
  const [adminTab, setAdminTab] = useState<AdminTab>("session");
  const [statsMode, setStatsMode] = useState<StatsMode>("combined");
  const [quizCount, setQuizCount] = useState(7);
  const stats = adminTab === "stats" ? computeStats(snapshot, statsMode) : null;
  const liveSession = snapshot.quizSession;
  const liveRows = liveSession
    ? [...snapshot.quizAnswers.filter((a) => a.sessionId === liveSession.id && a.questionIndex >= 0).reduce((map, a) => {
      const row = map.get(a.participantId) || { name: a.displayName, score: 0, correct: 0, elapsed: 0 };
      row.score += a.score;
      row.correct += a.correct ? 1 : 0;
      row.elapsed += a.elapsedMs;
      map.set(a.participantId, row);
      return map;
    }, new Map<string, { name: string; score: number; correct: number; elapsed: number }>()).entries()]
      .map(([id, row]) => ({ id, ...row }))
      .sort((a, b) => b.score - a.score || a.elapsed - b.elapsed)
    : [];
  const leaderboard = liveRows.length
    ? liveRows.slice(0, 20).map((r) => ({ participantId: r.id, roundId: liveSession?.roundId || getRoundId(snapshot), displayName: r.name, score: r.score, correctCount: r.correct, totalCount: liveSession?.questions.length || 0, elapsedMs: r.elapsed }))
    : [...snapshot.quizScores].sort((a, b) => b.score - a.score || a.elapsedMs - b.elapsedMs).slice(0, 20);
  const sweeps = snapshot.sweeps;
  return (
    <div className="admin-grid">
      <section className="panel-card wide admin-tabs">
        {[
          ["session", "流程"],
          ["qa", "QA"],
          ["wordcloud", "文字雲"],
          ["sweep", "掃地"],
          ["quiz", "測驗"],
          ["stats", "統計"],
          ["export", "匯出"]
        ].map(([key, label]) => <button key={key} className={adminTab === key ? "selected" : ""} onClick={() => setAdminTab(key as AdminTab)}>{label}</button>)}
      </section>

      {adminTab === "session" && <section className="panel-card wide">
        <h2>Session Control</h2>
        <div className="stage-grid">
          {STAGES.map((s) => (
            <button key={s.key} className={snapshot.event.currentStage === s.key ? "selected" : ""} onClick={() => updateCloud((draft) => setStage(draft, s.key))}>{s.label}</button>
          ))}
        </div>
        <h3>可見頁面</h3>
        <div className="stage-grid compact">
          {STAGES.map((s) => <button key={s.key} className={snapshot.event.allowedPages.includes(s.key) ? "selected" : ""} onClick={() => updateCloud((draft) => toggleAllowed(draft, s.key))}>{s.label}</button>)}
        </div>
        <div className="actions wrap">
          <button onClick={() => updateCloud((draft) => { draft.event.activeRoundId = "round-1"; draft.event.roundIndex = 1; })}>Round 1</button>
          <button onClick={() => updateCloud((draft) => { draft.event.activeRoundId = "round-2"; draft.event.roundIndex = 2; })}>Round 2</button>
          <button onClick={() => updateCloud((draft) => { draft.event.practiceStep = Math.max(1, draft.event.practiceStep - 1); })}>教學上一步</button>
          <button onClick={() => updateCloud((draft) => { draft.event.practiceStep = Math.min(14, draft.event.practiceStep + 1); })}>教學下一步</button>
          <button className={snapshot.event.showScreenPanel ? "selected" : ""} onClick={() => updateCloud((draft) => { draft.event.showScreenPanel = !draft.event.showScreenPanel; })}>
            {snapshot.event.showScreenPanel ? "關閉學生端全場資訊" : "開啟學生端全場資訊"}
          </button>
        </div>
      </section>}

      {adminTab === "qa" && <QaPanel snapshot={snapshot} participant={null} updateCloud={updateCloud} admin />}
      {adminTab === "wordcloud" && <WordCloudAdminPanel snapshot={snapshot} updateCloud={updateCloud} />}

      {adminTab === "sweep" && <section className="panel-card wide">
        <h2>Sweep Monitor</h2>
        <div className="inline-form">
          <label>梅花密度
            <input type="number" min={20} max={900} value={snapshot.event.sweepPlumDensity || 260} onChange={(e) => updateCloud((draft) => { draft.event.sweepPlumDensity = Math.max(20, Math.min(900, Number(e.target.value) || 260)); })} />
          </label>
          <label>葉子密度
            <input type="number" min={20} max={900} value={snapshot.event.sweepLeafDensity || 330} onChange={(e) => updateCloud((draft) => { draft.event.sweepLeafDensity = Math.max(20, Math.min(900, Number(e.target.value) || 330)); })} />
          </label>
        </div>
        <div className="metric-row">
          <Metric label="完成掃地" value={`${sweeps.length}`} />
          <Metric label="平均梅花" value={sweeps.length ? (sweeps.reduce((a, b) => a + b.plumCount, 0) / sweeps.length).toFixed(1) : "尚無"} />
          <Metric label="平均樹葉" value={sweeps.length ? (sweeps.reduce((a, b) => a + b.leafCount, 0) / sweeps.length).toFixed(1) : "尚無"} />
        </div>
      </section>}

      {adminTab === "quiz" && <section className="panel-card wide">
        <h2>Live Quiz Control</h2>
        <div className="inline-form">
          <label>選擇題數
            <input type="number" min={5} max={10} value={quizCount} onChange={(e) => setQuizCount(Math.max(5, Math.min(10, Number(e.target.value) || 5)))} />
          </label>
          <label>每題秒數
            <input type="number" min={5} max={60} value={snapshot.event.quizQuestionSeconds || 15} onChange={(e) => updateCloud((draft) => { draft.event.quizQuestionSeconds = Math.max(5, Math.min(60, Number(e.target.value) || 15)); })} />
          </label>
          <button onClick={() => updateCloud((draft) => startQuizLobby(draft, getRoundId(draft), quizCount, buildQuizQuestions(quizCount)))}>建立新測驗 Lobby</button>
        </div>
        {liveSession ? (
          <>
            <p className="status-line">
              {liveSession.finished ? "已結束" : liveSession.started ? `進行中：第 ${liveSession.currentIndex + 1}/${liveSession.questions.length} 題` : "Lobby 開放中"}
              {" · "}加入 {snapshot.quizAnswers.filter((a) => a.sessionId === liveSession.id && a.questionIndex === -1).length} 人
            </p>
            <div className="actions wrap">
              <button disabled={liveSession.finished} onClick={() => updateCloud((draft) => advanceQuiz(draft))}>{liveSession.started ? "下一題" : "開始第一題"}</button>
              <button disabled={liveSession.finished} onClick={() => updateCloud((draft) => finishQuiz(draft))}>結束並結算</button>
            </div>
            {liveSession.currentIndex >= 0 && liveSession.questions[liveSession.currentIndex] && <div className="quiz-item"><strong>{liveSession.questions[liveSession.currentIndex].prompt}</strong></div>}
          </>
        ) : <p className="muted">尚未建立測驗。</p>}
      </section>}

      {adminTab === "quiz" && <section className="panel-card wide">
        <h2>Quiz Leaderboard</h2>
        <table><thead><tr><th>名次</th><th>姓名</th><th>分數</th><th>正確率</th><th>秒</th></tr></thead><tbody>{leaderboard.map((q, i) => <tr key={`${q.participantId}-${q.roundId}`}><td>{i + 1}</td><td>{q.displayName}</td><td>{q.score}</td><td>{q.correctCount}/{q.totalCount}</td><td>{Math.round(q.elapsedMs / 1000)}</td></tr>)}</tbody></table>
      </section>}

      {adminTab === "stats" && stats && <section className="panel-card wide">
        <div className="section-head">
          <BarChart3 />
          <div>
            <p className="eyebrow">Experiment Stats</p>
            <h2>完整統計檢定</h2>
          </div>
        </div>
        <div className="segmented">
          <button className={statsMode === "round1" ? "selected" : ""} onClick={() => setStatsMode("round1")}>Round 1</button>
          <button className={statsMode === "round2" ? "selected" : ""} onClick={() => setStatsMode("round2")}>Round 2</button>
          <button className={statsMode === "combined" ? "selected" : ""} onClick={() => setStatsMode("combined")}>合併</button>
        </div>
        <div className="metric-row">
          <Metric label="有效 forced choice" value={`${stats.nCompleteForcedChoice}`} />
          <Metric label="真卦選擇率" value={percent(stats.trueChoiceRate)} />
          <Metric label="χ² p-value" value={numberText(stats.chiSquareP)} />
          <Metric label="單尾 binomial p" value={numberText(stats.binomialP)} />
          <Metric label="Power(p=45%)" value={percent(stats.power)} />
          <Metric label="β 型二誤差" value={percent(stats.beta)} />
        </div>
        <div className="chart-grid">
          <BarSet title="強迫選擇" rows={stats.sourceStats.map((s) => ({ label: sourceLabel(s.source), value: s.choiceCount, max: Math.max(1, stats.nCompleteForcedChoice) }))} />
          <BarSet title="平均勾選率" rows={stats.sourceStats.map((s) => ({ label: sourceLabel(s.source), value: Math.round((s.meanHitRate || 0) * 100), max: 100, suffix: "%" }))} />
          <BarSet title="平均主觀分數" rows={stats.sourceStats.map((s) => ({ label: sourceLabel(s.source), value: s.meanSubjective || 0, max: 5 }))} />
        </div>
        <div className="stats-notes">
          <p>型一誤差 α = {stats.alpha}：其實四組無差異，卻錯誤宣稱專注真卦較吻合的風險。</p>
          <p>型二誤差 β：若專注真卦真實第一名率為 45%，目前樣本數仍做不出顯著結果的機率。</p>
          <p>達 80% power 所需 N：{stats.sampleNeeds.map((x) => `效果 ${Math.round(x.effect * 100)}%：${x.neededN || "大於500"}`).join(" / ")}</p>
          {stats.hitPairwise.map((p) => <p key={p.comparison}>{p.comparison} 平均 hit-rate 差：{p.meanDiff === null ? "尚無" : `${(p.meanDiff * 100).toFixed(1)}%`}</p>)}
        </div>
      </section>}

      {adminTab === "export" && <section className="panel-card wide">
        <h2>Export</h2>
        <p className="muted">匯出資料不包含占卜問題、prompt、GPT raw output 或 statement 原文。</p>
        <button onClick={() => {
          const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `bagua-live-public-stats-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}>下載匿名統計 JSON</button>
      </section>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function BarSet({ title, rows }: { title: string; rows: { label: string; value: number; max: number; suffix?: string }[] }) {
  return (
    <div className="mini-chart">
      <h3>{title}</h3>
      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span>{row.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (row.value / row.max) * 100)}%` }} /></div>
          <strong>{typeof row.value === "number" ? row.value.toFixed(row.value % 1 ? 2 : 0) : row.value}{row.suffix || ""}</strong>
        </div>
      ))}
    </div>
  );
}

function ProgressPanel({ snapshot, participant, privateData }: { snapshot: CloudSnapshot; participant: Participant | null; privateData: LocalPrivateData }) {
  const roundId = getRoundId(snapshot);
  const pub = participant ? publicData(snapshot, participant.id, roundId) : null;
  return (
    <section className="panel-card">
      <h2>個人進度</h2>
      <div className="progress-list">
        <p>{pub?.sweepCompleted ? "✓" : "×"} 掃地完成</p>
        <p>{pub?.focused ? "✓" : "×"} 專注真卦數字</p>
        <p>{pub?.distracted ? "✓" : "×"} 分心隨機數</p>
        <p>{privateData.question ? "✓" : "×"} 起卦問題在本機</p>
        <p>{privateData.gptPrompt ? "✓" : "×"} Prompt 在本機</p>
        <p>{privateData.parsedCards.length ? "✓" : "×"} GPT JSON 在本機</p>
        <p>{pub?.ratingSubmitted ? "✓" : "×"} 評分摘要已送出</p>
      </div>
    </section>
  );
}

function ParticipantShell() {
  const { snapshot, participant, privateData, setParticipant, updateCloud, updatePrivate } = useExperimentState();
  const [page, setPage] = useState<StageKey>(snapshot.event.currentStage || "welcome");

  useEffect(() => {
    setPage(currentPageAllowed(snapshot, snapshot.event.currentStage) ? snapshot.event.currentStage : (snapshot.event.allowedPages[0] || "welcome"));
  }, [snapshot.event.currentStage, snapshot.event.allowedPages]);

  const allowed = currentPageAllowed(snapshot, page);
  const visibleStages = STAGES.filter((s) => currentPageAllowed(snapshot, s.key));
  const saveNickname = (value: string) => {
    if (!participant) return;
    updateCloud((draft) => updateParticipantNickname(draft, participant.id, value));
    setParticipant({ ...participant, nickname: value.trim().slice(0, 24) });
  };
  const recover = async (value: string) => {
    const found = recoverParticipant(loadCloud(), value) || await recoverRemoteParticipant(value);
    if (found) {
      saveParticipant(found);
      setParticipant(found);
      const remote = await fetchRemoteCloud(found.id);
      if (remote) {
        saveCloudLocal(remote);
        setPage(remote.event.currentStage);
      }
      return;
    }
    alert("找不到這個 ID / 恢復碼");
  };

  const renderPage = () => {
    if (!allowed) return <section className="panel-card"><h2>等待講者開放</h2><p>目前沒有可進入的頁面。</p></section>;
    if (page === "welcome") return <WelcomePanel snapshot={snapshot} participant={participant} onRecover={recover} onNicknameSave={saveNickname} />;
    if (page === "qa") return <QaPanel snapshot={snapshot} participant={participant} updateCloud={updateCloud} />;
    if (page === "wordcloud") return <WordCloudPanel snapshot={snapshot} participant={participant} updateCloud={updateCloud} />;
    if (page === "sweep") return <SweepPanel snapshot={snapshot} participant={participant} updateCloud={updateCloud} />;
    if (page === "question" || page === "focused") return <CastingPanel snapshot={snapshot} participant={participant} privateData={privateData} updatePrivate={updatePrivate} updateCloud={updateCloud} />;
    if (page === "quiz") return <QuizPanel snapshot={snapshot} participant={participant} updateCloud={updateCloud} />;
    if (page === "practice") return <PracticePanel snapshot={snapshot} participant={participant} />;
    if (page === "prompt" || page === "parser") return <PromptPanel snapshot={snapshot} participant={participant} privateData={privateData} updateCloud={updateCloud} updatePrivate={updatePrivate} />;
    if (page === "rating") return <RatingPanel snapshot={snapshot} participant={participant} privateData={privateData} updateCloud={updateCloud} />;
    if (page === "reveal") return <RevealPanel snapshot={snapshot} participant={participant} privateData={privateData} />;
    return <ProgressPanel snapshot={snapshot} participant={participant} privateData={privateData} />;
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Meihua Live Lab</p>
          <h1>梅花易數三盲互動實驗</h1>
        </div>
      </header>

      <div className="participant-layout">
        <aside className="mobile-nav">
          <div className="participant-id">{participant?.id || "建立中"}<span>Round {snapshot.event.roundIndex}</span></div>
          {visibleStages.map((s) => (
            <button key={s.key} className={page === s.key ? "selected" : ""} onClick={() => setPage(s.key)}>{s.label}</button>
          ))}
        </aside>
        <section className="content-area">
          {renderPage()}
          {snapshot.event.showScreenPanel && <ScreenPanel snapshot={snapshot} />}
        </section>
      </div>
    </main>
  );
}

export function AdminPageShell() {
  const { snapshot, updateCloud } = useExperimentState();
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>梅花易數三盲互動實驗管理端</h1>
        </div>
      </header>
      <AdminPanel snapshot={snapshot} updateCloud={updateCloud} />
    </main>
  );
}

function ScreenPanel({ snapshot }: { snapshot: CloudSnapshot }) {
  const stats = computeStats(snapshot, "combined");
  const qa = snapshot.qa.filter((q) => !q.hidden).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.likes - a.likes).slice(0, 8);
  const activeWordCloud = snapshot.wordCloudSessions.find((s) => s.id === snapshot.event.activeWordCloudSessionId);
  const cloudRows = activeWordCloud ? wordCloudRows(snapshot.wordCloudEntries.filter((e) => e.sessionId === activeWordCloud.id).map((e) => e.text)) : [];
  return (
    <div className="screen-grid">
      <section className="panel-card">
        <h2>匿名熱門問題</h2>
        <div className="qa-list">{qa.map((q) => <div className="qa-item" key={q.id}><p>{q.text}</p><span>讚 {q.likes}</span></div>)}</div>
      </section>
      <section className="panel-card">
        <h2>即時文字雲</h2>
        {activeWordCloud && <p className="muted">{activeWordCloud.prompt}</p>}
        <WordCloudViz rows={cloudRows} compact />
      </section>
      <section className="panel-card">
        <h2>全場進度</h2>
        <div className="metric-row">
          <Metric label="匿名參與者" value={`${snapshot.participants.length}`} />
          <Metric label="掃地完成" value={`${snapshot.sweeps.length}`} />
          <Metric label="測驗完成" value={`${snapshot.quizScores.length}`} />
          <Metric label="評分完成" value={`${new Set(snapshot.ratings.map((r) => r.participantId)).size}`} />
        </div>
      </section>
      <section className="panel-card wide">
        <h2>合併三盲統計</h2>
        <div className="metric-row">
          <Metric label="有效選擇" value={`${stats.nCompleteForcedChoice}`} />
          <Metric label="真卦選擇率" value={percent(stats.trueChoiceRate)} />
          <Metric label="χ² p-value" value={numberText(stats.chiSquareP)} />
          <Metric label="Power" value={percent(stats.power)} />
        </div>
        <BarSet title="強迫選擇" rows={stats.sourceStats.map((s) => ({ label: sourceLabel(s.source), value: s.choiceCount, max: Math.max(1, stats.nCompleteForcedChoice) }))} />
      </section>
    </div>
  );
}

export default function Page() {
  return <ParticipantShell />;
}
