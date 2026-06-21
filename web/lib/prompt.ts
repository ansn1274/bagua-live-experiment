import type { BlindMapping, LocalPrivateData, ParsedCard } from "./types";
import type { RandomSource } from "./types";

export function buildMyGptSystemPrompt() {
  return `你是一個梅花易數三盲實驗的結構化解卦器。

你會收到同一個使用者問題，以及四個匿名卦包 A/B/C/D。你不知道哪一個卦來自使用者專注想問題時的數字，也不知道哪一個來自遊戲、分心亂數或起卦方式對照。

請公平、對稱地解讀四個卦，不要猜測來源，不要偏袒任何一張卡。

輸出規則：
1. 只輸出 JSON，不要 markdown。
2. 必須剛好輸出四張 cards，blind_id 分別為 A、B、C、D。
3. 每張卡必須剛好 5 條 statements。
4. 四張卡的語氣、長度、溫度與結構必須一致。
5. statements 要可被使用者逐條勾選，不要寫成空泛祝福。
6. bonus_reading 可以較完整，但仍需四張卡長度接近。
7. 不提供醫療、法律、投資等決策性建議。

JSON 格式：
{
  "cards": [
    {
      "blind_id": "A",
      "hexagram_echo": "本卦→變卦，體用關係",
      "statements": [
        {"id":"A1","aspect":"現狀","text":"..."}
      ],
      "bonus_reading": "...",
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
起卦方法：${h.method === "reversed" ? "反置對照：第一數作下卦，第二數作上卦" : "標準：第一數作上卦，第二數作下卦"}
本卦：${h.hexagramName}（${h.upperTrigramName}上${h.lowerTrigramName}下）
變卦：${h.changedHexagramName}
互卦：${h.mutualHexagramName}（${h.mutualUpperTrigramName}上${h.mutualLowerTrigramName}下）
體卦：${h.bodyTrigramName}（${h.bodyElement}）
用卦：${h.useTrigramName}（${h.useElement}）
體用關係：${h.elementRelation}
動爻：第 ${h.movingLine} 爻（兩數相加加時間地支數後 mod 6，0 作 6）`;
  }).filter(Boolean);

  return `使用者場景：
<<<
${local.scenario || "未填寫"}
>>>

使用者問題：
<<<
${local.question || "未填寫"}
>>>

四個匿名卦包：
<<<
${lines.join("\n\n")}
>>>

請依 system prompt 輸出四張盲測解卦卡。每張卡剛好 5 條 statements。`;
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
    if (cards.length !== 4) return { cards: [], error: "card_count" };
    const ids = cards.map((c) => c.blind_id).sort().join("");
    if (ids !== "ABCD") return { cards: [], error: "blind_id" };
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
