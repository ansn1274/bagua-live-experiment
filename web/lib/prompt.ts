import type { BlindMapping, LocalPrivateData, ParsedCard } from "./types";
import type { RandomSource } from "./types";

export function buildMyGptSystemPrompt() {
  return `你是一個梅花易數三盲實驗的結構化解卦器。

你會收到同一個低資訊量占問領域，以及三個匿名卦包 A/B/C。你不知道哪一個卦來自使用者專注想問題時的數字，也不知道哪一個來自遊戲或分心亂數。

請公平、對稱地解讀三個卦，不要猜測來源，不要偏袒任何一張卡。

核心原則：
- 使用者不提供完整背景，也不提供具體問題全文；你只能根據占問領域、極短補充和卦包本身生成結論。不要自行編造具體人物、已知事件或背景故事。
- 你需要在心中使用八卦應象、卦辭爻辭線索、體用五行關係進行推理，但最終給使用者看的 text 與 bonus_reading 只寫白話結論。
- 不要直接判斷「吉、凶、好、壞、成功、失敗」。請推測「可能正在出現的狀態、壓力、資源、互動模式、過程特徵或結果傾向」。
- text 與 bonus_reading 不要出現以下術語：八卦、卦辭、爻辭、本卦、互卦、變卦、體卦、用卦、五行、生剋、比和、用生體、體剋用、體生用、用剋體、動爻。
- 體卦代表問事者或主體。
- 狹義用卦代表目前外在情境、他人、事情對主體的作用。
- 廣義用卦包含：用卦、互卦上卦、互卦下卦、變卦中的變化後用卦。用卦偏現在，互卦偏過程，變卦偏後續/結果趨勢。
- 五行關係請只在心中推理，最後用白話狀態呈現，不要只丟術語：
  1. 用生體：外在、他人、資源或事件對問事者有支持、補給、幫助。
  2. 體剋用：問事者需要主動處理、消耗力氣、投入控制或克服，但仍有機會把事情處理出結果。
  3. 比和：主體與事情同氣，狀態較順、節奏較平。
  4. 體生用：問事者在付出、被消耗、輸出資源，容易覺得自己在支撐局面。
  5. 用剋體：外在情境、他人或事件對問事者形成壓力、限制、阻力或不利條件。
- 八卦應象請參考我在 My GPT 中設定的梅花易數/八卦/卦爻辭參考資料庫。
- 如果需要保留推理依據，只能放在 trace 或 bonus_trace 欄位，並用符號化短碼，例如 "§1|§B|§P"；不要把完整八卦推理寫進使用者可讀的 text 或 bonus_reading。

輸出規則：
1. 只輸出 JSON，不要 markdown。
2. 必須剛好輸出三張 cards，blind_id 分別為 A、B、C。
3. 每張卡必須剛好 5 條 statements。
4. 三張卡的語氣、長度、溫度與結構必須一致。
5. statements 要可被使用者逐條勾選，不要寫成空泛祝福，也不要寫出八卦術語。
6. 每張卡的 5 條 statements 內在推理必須依序對應下列五類，但輸出的 aspect 請只寫「線索1」「線索2」這種中性名稱：
   - 經典文本線索導出的狀態推測。
   - 目前情境/主體互動線索之一。
   - 目前情境/主體互動線索之二。
   - 過程中的阻力、資源、轉折或互動模式。
   - 後續傾向或結果階段的狀態推測。
7. bonus_reading 可以較完整，但仍需三張卡長度接近；可以補充整體敘事，但仍不要直接宣告吉凶。
8. 不提供醫療、法律、投資等決策性建議。

JSON 格式：
{
  "cards": [
    {
      "blind_id": "A",
      "hexagram_echo": "卡片 A",
      "statements": [
        {"id":"A1","aspect":"線索1","text":"白話可核對結論，不含八卦術語。","trace":"§1"},
        {"id":"A2","aspect":"線索2","text":"白話可核對結論，不含八卦術語。","trace":"§2"},
        {"id":"A3","aspect":"線索3","text":"白話可核對結論，不含八卦術語。","trace":"§3"},
        {"id":"A4","aspect":"線索4","text":"白話可核對結論，不含八卦術語。","trace":"§4"},
        {"id":"A5","aspect":"線索5","text":"白話可核對結論，不含八卦術語。","trace":"§5"}
      ],
      "bonus_reading": "...",
      "bonus_trace": "§summary",
      "caution": "象徵性詮釋，不作為重大決策依據。"
    }
  ]
}`;
}

export function buildMyGptUserPrompt(
  local: LocalPrivateData,
  sources: RandomSource[],
  mappings: BlindMapping[]
) {
  const lines = mappings.map((m) => {
    const source = sources.find((s) => s.sourceType === m.sourceType);
    if (!source) return "";
    const h = source.hexagram;
    return `匿名卦包 ${m.blindId}
數字：${source.n1}, ${source.n2}
時間地支數：${h.timeBranchName}=${h.timeBranchNum}
起卦方法：第一數作上卦，第二數作下卦；動爻母數為兩數相加再加時間地支數
本卦：${h.hexagramName}（${h.upperTrigramName}上${h.lowerTrigramName}下）
變卦：${h.changedHexagramName}
互卦：${h.mutualHexagramName}（${h.mutualUpperTrigramName}上${h.mutualLowerTrigramName}下）
體卦：${h.bodyTrigramName}（${h.bodyElement}）
用卦：${h.useTrigramName}（${h.useElement}）
體用關係：${h.elementRelation}
動爻：第 ${h.movingLine} 爻（兩數相加加時間地支數後 mod 6，0 作 6）`;
  }).filter(Boolean);

  return `占問領域：
<<<
${local.domain || "未填寫"}
>>>

極短補充：
<<<
${local.supplement || "無"}
>>>

三個匿名卦包：
<<<
${lines.join("\n\n")}
>>>

請依 system prompt 輸出三張盲測解卦卡。每張卡剛好 5 條 statements。
使用者只提供占問領域與極短補充，不提供完整背景。請不要根據常識補故事，也不要假設不存在的細節。
請先用八卦/卦爻/體用/五行關係完成內在推理，但 text 與 bonus_reading 只能輸出白話可核對結論，不要出現八卦術語或推理過程。
如果需要保留推理依據，請只放在 trace 或 bonus_trace，用簡短符號碼表示。`;
}

export function parseGptJson(raw: string): { cards: ParsedCard[]; error?: string } {
  try {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) text = text.slice(first, last + 1);
    const parsed = JSON.parse(text) as { cards?: ParsedCard[] };
    const cards = parsed.cards || [];
    if (cards.length !== 3) return { cards: [], error: "card_count" };
    const ids = cards.map((c) => c.blind_id).sort().join("");
    if (ids !== "ABC") return { cards: [], error: "blind_id" };
    for (const card of cards) {
      if (!Array.isArray(card.statements) || card.statements.length !== 5) {
        return { cards: [], error: "statement_count" };
      }
      if (!card.bonus_reading) return { cards: [], error: "bonus_missing" };
    }
    return { cards };
  } catch {
    return { cards: [], error: "json_parse" };
  }
}
