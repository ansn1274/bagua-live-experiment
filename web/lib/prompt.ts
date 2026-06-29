import type { BlindMapping, LocalPrivateData, ParsedCard } from "./types";
import type { RandomSource } from "./types";
import { relationForTrigrams } from "./meihua";

export function buildMyGptUserPrompt(
  local: LocalPrivateData,
  sources: RandomSource[],
  mappings: BlindMapping[]
) {
  const lines = mappings.map((m) => {
    const source = sources.find((s) => s.sourceType === m.sourceType);
    if (!source) return "";
    const h = source.hexagram;
    const mutualUpperRelation = relationForTrigrams(h.bodyTrigramName, h.mutualUpperTrigramName);
    const mutualLowerRelation = relationForTrigrams(h.bodyTrigramName, h.mutualLowerTrigramName);
    const changedUseRelation = relationForTrigrams(h.bodyTrigramName, h.changedUseTrigramName);
    return `匿名卦包 ${m.blindId}
數字：${source.n1}, ${source.n2}
時間地支：${h.timeBranchName}=${h.timeBranchNum}
上卦：${h.upperTrigramName} ${h.upperSymbol}
下卦：${h.lowerTrigramName} ${h.lowerSymbol}
本卦：${h.hexagramName}
動爻：第 ${h.movingLine} 爻
體卦：${h.bodyTrigramName}（${h.bodyElement}）
用卦：${h.useTrigramName}（${h.useElement}）
體用關係：${h.elementRelation}
互卦：${h.mutualHexagramName}；互上=${h.mutualUpperTrigramName}（互上與體卦的五行關係：${mutualUpperRelation}），互下=${h.mutualLowerTrigramName}（互下與體卦的五行關係：${mutualLowerRelation}）
變卦：${h.changedHexagramName}；變化後用卦=${h.changedUseTrigramName}（變化後用卦與體卦的五行關係：${changedUseRelation}）`;
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

export function buildGptBUserPrompt(local: LocalPrivateData, focused: RandomSource, trueCard?: ParsedCard) {
  const h = focused.hexagram;
  const cardReview = trueCard
    ? `\n\n【三盲階段中真卦卡的原始輸出】\n${trueCard.statements.map((statement, index) => `${index + 1}. ${statement.text}`).join("\n")}\n總結：${trueCard.bonus_reading}`
    : "";

  return `我已經完成三盲評分並揭曉，現在可以直接討論真卦。請不要再生成 A/B/C 卡片，也不要重做盲測。

【我的占問】
領域：${local.domain || "未填寫"}
完整問題：${local.question.trim() || "我尚未在 app 內記下完整問題，請先請我補充問題，再繼續解讀。"}
極短補充：${local.supplement.trim() || "無"}

【起卦資料】
第一數：${focused.n1}（作上卦）
第二數：${focused.n2}（作下卦）
實驗鎖定時間地支：${h.timeBranchName}=${h.timeBranchNum}
上卦：${h.upperTrigramName} ${h.upperSymbol}
下卦：${h.lowerTrigramName} ${h.lowerSymbol}
本卦：${h.hexagramName}
動爻：第 ${h.movingLine} 爻
體卦：${h.bodyTrigramName}（${h.bodyElement}）
用卦：${h.useTrigramName}（${h.useElement}）
體用關係：${h.elementRelation}
互卦：${h.mutualHexagramName}（互上 ${h.mutualUpperTrigramName}、互下 ${h.mutualLowerTrigramName}）
變卦：${h.changedHexagramName}（變化後用卦 ${h.changedUseTrigramName}）${cardReview}

請先核對計算，接著嚴格依照以下順序帶我深入討論：
1. 卦辭、爻辭：從資料庫引用本卦卦辭與本次動爻爻辭，分開說明原文、白話與本次占問的可能對應。
2. 五行生剋：以同一個體卦為主體，依序分析狹義用卦（現在）、兩個互卦（過程）與變化後用卦（後續）對體卦的作用方向。
3. 八卦應象：結合體、用、互、變各卦的物象、人物、行為、空間、節奏與狀態，提出可讓我核對的具體可能性，不要硬編背景。
4. 綜合分析：把經文、五行與應象合成一條有時間順序的解讀，清楚區分我的已知事實、卦象推論與一般建議。

完成第一輪解讀後，請問我 1 至 2 個最值得核對的問題；之後根據我的回答繼續討論、修正或比較其他可能取象。不要用宿命或保證語氣，也不要只給吉凶結論。`;
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
