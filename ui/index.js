const STORE_KEY = "bagua_web_llm_lab_v2";
const STATE_VERSION = 3;
const STORY_BACK_STABILITY_SAMPLE_COUNT = 3;

const CATEGORIES = {
  "事業": ["新主管上任", "專案期限逼近", "同事突然離職", "被調到新部門", "年終考核", "加薪談判", "跨部門衝突", "技術瓶頸", "重要任務", "組織重整"],
  "創業": ["尋找合夥人", "產品上線", "第一輪募資", "客戶流失", "競爭對手出現", "團隊內部分歧", "現金流告急", "大客戶訂單", "市場策略轉型", "政府補助"],
  "錢財": ["股票投資", "房產買賣", "借貸糾紛", "意外收入", "薪水被拖欠", "合夥投資", "保險理賠", "副業收入", "信用卡債務", "遺產繼承"],
  "愛情": ["曖昧對象", "告白時機", "異地戀考驗", "前任聯繫", "約會冷場", "態度忽冷忽熱", "朋友介紹", "網路交友", "第三者介入", "價值觀衝突"],
  "婚姻": ["婆媳問題", "經濟分配", "育兒觀念不同", "出軌疑慮", "分居考慮", "週年紀念", "離婚協議", "雙方家庭干涉", "生活習慣摩擦", "共同創業"],
  "子女": ["叛逆期", "成績下滑", "選擇學校", "孩子生病", "親子溝通困難", "才藝方向", "交友問題", "升學壓力", "沉迷手機", "出國留學"],
  "健康": ["健檢異常", "慢性病控制", "手術決定", "中醫調理", "運動傷害復健", "心理壓力", "睡眠惡化", "家人照護", "過敏反覆", "體重管理"],
  "旅遊": ["出國自由行", "航班延誤", "護照遺失", "水土不服", "行程更改", "當地騙局", "極端天氣", "旅伴爭執", "預算超支", "語言不通"],
  "考運": ["大考準備", "研究所入學考", "公務員考試", "專業證照", "語言檢定", "駕照路考", "面試口試", "論文答辯", "在職進修", "資格複審"],
  "人際": ["朋友反目", "鄰居糾紛", "社交壓力", "背後中傷", "職場小圈圈", "老友重逢", "合作信任危機", "社群媒體衝突", "師生緊張", "貴人出現"],
  "訴訟": ["勞資糾紛", "交通事故賠償", "租約爭議", "智慧財產權", "消費糾紛", "名譽損害", "離婚訴訟", "債務追討", "醫療糾紛", "合約違約"],
  "遷居": ["租屋看房", "買房決策", "搬家日期", "裝潢施工", "新居疑慮", "鄰居品質未知", "通勤變長", "學區考量", "房貸壓力", "與父母同住"],
  "尋物/人": ["失聯老友", "離家出走", "失蹤家人", "走失寵物", "重要文件遺失", "鑰匙不見", "手機遺失", "旅途走散", "失聯恩師", "多年筆友"],
};

const QUESTION_BY_CATEGORY = {
  "事業": "關於這個工作／任務情境，接下來整體狀態會如何發展？",
  "創業": "關於這個創業情境，接下來整體狀態會如何發展？",
  "錢財": "關於這個財務情境，接下來整體狀態會如何發展？",
  "愛情": "關於這段感情情境，接下來整體狀態會如何發展？",
  "婚姻": "關於這個婚姻情境，接下來整體狀態會如何發展？",
  "子女": "關於這個子女情境，接下來整體狀態會如何發展？",
  "健康": "關於這個健康情境，接下來整體狀態會如何發展？",
  "旅遊": "關於這趟旅行情境，接下來整體狀態會如何發展？",
  "考運": "關於這個考試情境，接下來整體狀態會如何發展？",
  "人際": "關於這個人際情境，接下來整體狀態會如何發展？",
  "訴訟": "關於這個訴訟情境，接下來整體狀態會如何發展？",
  "遷居": "關於這個遷居情境，接下來整體狀態會如何發展？",
  "尋物/人": "關於這次尋找物品或聯繫對象的情境，接下來整體狀態會如何發展？",
};

const LEGACY_CATEGORY_MAP = {
  "事業發展": "事業",
  "財運理財": "錢財",
  "感情關係": "愛情",
  "學業考試": "考運",
  "人際關係": "人際",
  "健康生活": "健康",
  "搬家遷居": "遷居",
  "尋人": "尋物/人",
};

const LEGACY_QUESTION_PATTERN = /事業發展|財運理財|感情關係|學業考試|人際關係|健康生活|搬家遷居|尋人/;

const GENERATION_STEP_IDS = new Set(["story_front", "numbers", "story_back"]);
const FOUNDATION_OUTPUT_KEYS = [
  "story_front",
  "numbers",
  "hexagram",
  "candidates",
  "randomHexagrams",
  "story_back",
  "story_back_samples",
  "story_back_stability_qc",
  "storyBackCandidates",
  "distractors",
  "distractor_qc",
];

function defaultAgentForStep(stepId, c = null) {
  if (stepId === "numbers" && c?.numberMode === "front_paragraphs") return "local-paragraph-count";
  if (stepId?.startsWith("story_back_sample_")) return "sonnet-4.6";
  return GENERATION_STEP_IDS.has(stepId) ? "sonnet-4.6" : "gemini-3.1-pro";
}

function defaultRagForStep(stepId) {
  return "none";
}

const TRIGRAMS = {
  1: { name: "乾", lines: [1, 1, 1], element: "金" },
  2: { name: "兌", lines: [1, 1, 0], element: "金" },
  3: { name: "離", lines: [1, 0, 1], element: "火" },
  4: { name: "震", lines: [1, 0, 0], element: "木" },
  5: { name: "巽", lines: [0, 1, 1], element: "木" },
  6: { name: "坎", lines: [0, 1, 0], element: "水" },
  7: { name: "艮", lines: [0, 0, 1], element: "土" },
  8: { name: "坤", lines: [0, 0, 0], element: "土" },
};

const NAME_TO_NUM = Object.fromEntries(Object.entries(TRIGRAMS).map(([n, v]) => [v.name, Number(n)]));
const TRIGRAM_ORDER = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];
const SHENG = { "木": "火", "火": "土", "土": "金", "金": "水", "水": "木" };
const KE = { "木": "土", "土": "水", "水": "火", "火": "金", "金": "木" };

const HEX = {
  "乾": {"乾":"乾","兌":"履","離":"同人","震":"無妄","巽":"姤","坎":"訟","艮":"遯","坤":"否"},
  "兌": {"乾":"夬","兌":"兌","離":"革","震":"隨","巽":"大過","坎":"困","艮":"咸","坤":"萃"},
  "離": {"乾":"大有","兌":"睽","離":"離","震":"噬嗑","巽":"鼎","坎":"未濟","艮":"旅","坤":"晉"},
  "震": {"乾":"大壯","兌":"歸妹","離":"豐","震":"震","巽":"恆","坎":"解","艮":"小過","坤":"豫"},
  "巽": {"乾":"小畜","兌":"中孚","離":"家人","震":"益","巽":"巽","坎":"渙","艮":"漸","坤":"觀"},
  "坎": {"乾":"需","兌":"節","離":"既濟","震":"屯","巽":"井","坎":"坎","艮":"蹇","坤":"比"},
  "艮": {"乾":"大畜","兌":"損","離":"賁","震":"頤","巽":"蠱","坎":"蒙","艮":"艮","坤":"剝"},
  "坤": {"乾":"泰","兌":"臨","離":"明夷","震":"復","巽":"升","坎":"師","艮":"謙","坤":"坤"},
};

const SYSTEMS = {
  storyFront: `你是一個短篇情境故事生成器。

你的任務是根據輸入的「故事類別」與「隨機故事元素」，生成一段自然、具體、有懸念的故事前半段。

規則：
1. 長度約 500 字是偏好，不是硬限制；自然完整優先。
2. 停在局勢尚未明朗、結果未定的轉折點。
3. 不寫最終結局、明確答案、或已成定局的描述。
4. 人物動機、心理、壓力要具體。
5. 情節貼近日常，不要極端巧合或超自然事件。
6. 前半必須具體但多岔：至少留下三個合理後續方向，且不要讓其中任何一條成為唯一明顯答案。
7. 對關鍵線索保持可解釋性：同一個人、物、制度、訊息或症狀，後續可以合理走向幫助、阻礙、誤會、延宕或反轉。
8. 不要在前半提前放入過強的解決路徑，例如明顯可靠的救援者、唯一官方程序、唯一犯人、唯一病因或唯一情感答案。
9. 以連貫敘事段落呈現，不要條列。
10. 只輸出故事，不加標題、引言或說明。`,

  numbers: `你是一個直覺取數生成器。

你會看到一段故事前半段與一個問題。請不要分析，不要解釋，只憑第一直覺輸出兩個 1～999 的正整數。

限制：
1. 不要使用常見吉祥數或整數梗，例如 1、8、9、10、88、99、100、168、520、777、888、999。
2. 不要輸出理由。
3. 只輸出 JSON。

格式：
{
  "n1": 0,
  "n2": 0
}`,

  storyBack: `你是一個短篇故事續寫器。

你的任務是根據給定的故事前半段，生成自然銜接的後半段。

規則：
1. 長度約 500 字是偏好，不是硬限制；自然完整優先。
2. 必須在情節、人物、語氣上與前半段無縫銜接。
3. 後半是此案例的客觀實際發展，請從前半留下的多個合理方向中自然收束到其中一條。
4. 呈現明確的狀態發展：好轉、惡化、轉折、僵持或新變化皆可。
5. 不要突然出現極端巧合或超自然事件。
6. 不要把所有未解線索都收得過度工整；可以保留日常生活中合理的殘餘不確定性。
7. 不要只選最直覺、最模板化的解法；後續要合理，但從前半 alone 不能顯得必然唯一。
8. 以連貫敘事段落呈現，不要分析、摘要或條列。
9. 只輸出故事，不加標題、引言或說明。`,

  rank6: `你是一個候選卦象排序器。

你會看到故事、問題，以及六個由同一組體用卦衍生出的候選卦象。請判斷哪個候選最符合故事情境。

要求：
1. 不要知道或猜測真實答案。
2. 每個候選給 0～100 分。
3. 排名由最符合到最不符合。
4. 只輸出 JSON。

格式：
{
  "scores": [
    {"candidate_id": "C1", "score": 0, "reason": "30字以內"}
  ],
  "ranking": ["C1","C2","C3","C4","C5","C6"]
}`,

  card: `你是一個梅花易數解卦卡生成器。

你的任務是根據故事前半段、問題、卦象資料，生成一張固定格式的解卦卡。

限制：
1. 你不能看到故事後半段。
2. 不要宣稱必然發生某事。
3. 真卦與隨機卦必須使用相同格式與品質標準。
4. 總長 400～550 字。
5. 只輸出 JSON。

格式：
{
  "reading_card": {
    "本卦主調": "",
    "體用關係": "",
    "主要優勢": "",
    "主要風險": "",
    "動爻警訊": "",
    "變卦結果": "",
    "過程壓力／互卦": "",
    "行動建議": ""
  }
}`,

  distractors: `你是一個替代故事後續生成器。

請根據故事前半段和真實後半段，生成 4 個同樣自然、同樣合理，但狀態走向不同的替代後半段。

要求：
1. 每個替代後續約 500 字是偏好，不是硬限制；自然完整優先。
2. 必須自然接續前半段，承接前半的主要人物、場景、壓力與未解線索。
3. 每個替代後續都要像一條可能成為客觀實際發展的分支，而不是刻意反著真實後半段寫。
4. 必須與真實後半段在狀態走向上不同，但差異要來自前半已存在的多岔可能。
5. 不可只是改寫真實後半段，也不可比真實後半段明顯更誇張、更空泛或更不連貫。
6. 盲測者只看前半時，應該難以僅憑故事合理性排除任何一個替代後續。
7. 不要標注「好轉版」或「惡化版」。
8. 只輸出 JSON。

格式：
{
  "distractors": [
    {"id": "D1", "text": ""},
    {"id": "D2", "text": ""},
    {"id": "D3", "text": ""},
    {"id": "D4", "text": ""}
  ]
}`,

  qc: `你是一個替代故事後續品質檢查器。

請判斷每個替代後半段是否適合作為 hard distractor。

評分：
1. coherence：合理銜接度，1～5。
2. difference：與真後續差異度，1～5。
3. naturalness：自然程度，1～5。
4. style_similarity：字數與風格相似度，1～5。
5. clue_coverage：是否承接前半主要線索，1～5。
6. competitiveness：只看前半時，是否像同等可能的真後續，1～5。
7. overdramatic：是否過度戲劇化，true/false。
8. mere_rewrite：是否只是改寫真後續，true/false。
9. too_obviously_fake：是否明顯不像真後續，true/false。
10. pass：是否合格，true/false。

只輸出 JSON。

格式：
{
  "qc_results": [
    {"id":"D1","coherence":0,"difference":0,"naturalness":0,"style_similarity":0,"clue_coverage":0,"competitiveness":0,"overdramatic":false,"mere_rewrite":false,"too_obviously_fake":false,"pass":false,"reason":"30字以內"}
  ],
  "all_pass": false
}`,

  eval2: `你是一個故事後續辨認評估器。

你會看到故事前半段、問題、一張匿名解卦卡，以及五個匿名候選後半段。請只根據解卦卡內容，判斷哪個候選最符合它描述的狀態、風險、變化與建議。

要求：
1. 不要判斷哪個寫得最好。
2. 不要猜哪個是原始後續。
3. 每個候選給 0～100 分。
4. 排名由最符合到最不符合。
5. 只輸出 JSON。

格式：
{
  "scores": [
    {"candidate_id": "S1", "score": 0, "reason": "30字以內"}
  ],
  "ranking": ["S1","S2","S3","S4","S5"]
}`,

  noCard: `你是一個故事後續基準評估器。

你會看到故事前半段、問題，以及五個匿名候選後半段。你不會看到任何解卦卡、卦象、數字或提示。

請只根據故事前半段本身的敘事連貫性、人物動機、未解線索、語氣承接與日常合理性，判斷哪個候選最像原本自然續寫出的實際後半段。

要求：
1. 不要使用卦象或命理概念。
2. 不要偏好最戲劇化、最圓滿或最有道德答案的後續。
3. 每個候選給 0～100 分。
4. 排名由最像實際後續到最不像。
5. 若多個候選同樣合理，請讓分數接近。
6. 只輸出 JSON。

格式：
{
  "scores": [
    {"candidate_id": "S1", "score": 0, "reason": "30字以內"}
  ],
  "ranking": ["S1","S2","S3","S4","S5"]
}`,

  stabilityQc: `你是一個故事真後續穩定性品質檢查器。

你會看到同一個故事前半段、同一個問題，以及由同一模型、同一 context、同一 system prompt 與同一 user prompt 生成的多個故事後半段。

你的任務不是評斷哪一段寫得最好，也不是要求逐字相同。你要判斷這些後半段是否指向同一個「核心客觀後續」。

請比較宏觀事件結果，而不是文字表面：
- 核心結果：事情最後主要變成什麼狀態。
- 關鍵人物狀態：核心人物安全、受阻、離開、和解、惡化、失敗、成功等。
- 主要因果路徑：造成結果的主要原因或轉折是否一致。
- 解決程度：已解決、部分解決、延宕、惡化、轉為新問題。
- 未解問題：保留下來的主要不確定性是否相近。

判準：
1. 如果不同版本只是細節、地點、對話、語氣、旁枝線索不同，但核心結果與主要因果路徑相同，可視為穩定。
2. 如果不同版本的主結果不同，例如找到／沒找到、成功／失敗、和解／破裂、病情好轉／惡化，則不穩定。
3. 如果有 2 個以上樣本與原始真後半共享同一核心結果，且沒有明顯互斥的主結果，可給較高分。
4. stability_score 為 0～100；75 以上代表可通過。
5. 只輸出 JSON。

格式：
{
  "outcome_vectors": [
    {"id":"actual","core_outcome":"","key_actor_status":"","main_causal_path":"","resolution_state":"","unresolved_issue":""}
  ],
  "pairwise_consistency": [
    {"sample_id":"B1","same_core_outcome":false,"score":0,"reason":"30字以內"}
  ],
  "consensus_summary": "",
  "stability_score": 0,
  "pass": false,
  "reason": "50字以內"
}`,

  claims: `你是一個解卦卡 claim 拆解器。

請將解卦卡拆成六個可被故事證據檢驗的具體 claim。

claim 類型：
主體狀態、作用力狀態、核心風險、過程壓力、後續變化、行動建議。

要求：
1. 每個 claim 必須具體。
2. 不要加入解卦卡中沒有的意思。
3. 每個 claim 20～50 字。
4. 只輸出 JSON。

格式：
{
  "claims": [
    {"claim_type":"主體狀態","claim":""}
  ]
}`,

  evidence: `你是一個故事證據評分器。

請根據故事前半段、問題與真實後半段，評估每個 claim 是否被故事內容支持。

評分：
+2：明確證據支持。
+1：間接支持或高度相容。
0：過於泛化、無明確證據、無法判斷。
-1：有些不符。
-2：明顯矛盾。

要求：
1. 不要因為 claim 聽起來合理就給高分。
2. 若故事沒有呈現，請給 0。
3. 每個 claim 給 30 字以內證據說明。
4. 只輸出 JSON。

格式：
{
  "claim_scores": [
    {"claim_type":"","claim":"","score":0,"evidence":"30字以內"}
  ],
  "mean_score": 0
}`,
};

SYSTEMS.eval1 = `你是一個故事語義判斷器，用來評估故事情境可能對應的梅花易數體卦與用卦。

你不是在起卦，也不是在猜數字。你只根據故事與問題，分別估計八個卦作為「體卦」與「用卦」的可能性。

你的目標是把故事中的語義角色、處境、力量關係、情緒狀態、事件走向，轉成兩組機率分布：體卦分布與用卦分布。

核心定義：
- 體卦 Body 代表問事中的主體、承受者、決策者、真正被此事牽動的一方。通常是提問者、故事焦點人物、核心資產、核心關係，或問題中被問「吉凶成敗」的對象。
- 用卦 Use 代表作用於體的外部力量、對手、環境、制度、事件、機會、風險、誘惑、阻礙，或推動情勢改變的另一方。
- 如果故事中有多個人物，請先判斷問題真正關心誰或什麼，再決定體。不要自動把第一個出場人物視為體。
- 如果故事中的外在因素很多，請找出最能改變體之處境的力量作為用。
- 體與用不是好壞標籤，而是關係位置。體可能主動，用也可能被動，重點是誰是被占問的核心，誰是作用於核心的力量。

判斷流程：
1. 先讀懂問題類別與故事主軸：事業、創業、錢財、愛情、婚姻、子女、健康、旅遊、考運、人際、訴訟、遷居、尋物/人。
2. 找出故事的核心承受者：誰正在面對選擇、壓力、損失、期待、未知結果。
3. 找出故事的主要作用力：哪個人、制度、環境、資訊、資源、事件，正在影響核心承受者。
4. 分別把體與用映射到八卦語義，不要混在一起平均。
5. 若有 2 到 3 個合理候選，請用機率分布表達不確定性。

八卦語義原型：
乾：主導、權威、父性、制度高位、決斷、強勢推進、資本、領導、剛健。
兌：溝通、喜悅、口舌、交易、說服、社交、少女、缺口、誘惑、談判。
離：顯現、名聲、文件、眼光、依附、判斷、網路曝光、證據、美感、清晰也可能焦慮。
震：啟動、突發、驚動、長男、行動、創業初動、變故、衝動、突破。
巽：滲透、協商、長女、風聲、柔性推進、合約細節、資訊流、反覆斟酌。
坎：風險、隱憂、疾病、陷阱、現金流壓力、恐懼、秘密、法律危險、困局。
艮：停止、門檻、阻隔、少男、保守、等待、山、房產、界線、卡住。
坤：承載、母性、群體、土地、照顧、穩定資源、順從、包容、基層、累積。

評分規則：
1. body_trigram 與 use_trigram 各自 8 卦總和必須為 1.0。
2. 不要給單一卦 1.0，除非故事語義極端明確。常見最高值可在 0.25 到 0.45 之間。
3. 如果語義模糊，請讓分布較平均，但仍需反映你的判斷。
4. 不要使用故事字數、隨機數、時間、標籤編號或任何數字取卦法。
5. 不要解卦，不要預測結果，不要給建議。只做語義分布評估。
6. 若只提供故事前半，請只根據已知內容判斷，不要替故事補完。
7. brief_reason 請用 50 字以內說明主要判斷依據。
8. 只輸出 JSON，不要加入 markdown 或額外說明。

格式：
{
  "body_trigram": {"乾":0,"兌":0,"離":0,"震":0,"巽":0,"坎":0,"艮":0,"坤":0},
  "use_trigram": {"乾":0,"兌":0,"離":0,"震":0,"巽":0,"坎":0,"艮":0,"坤":0},
  "brief_reason": "50字以內"
}`;

function storySeedSystem(c) {
  const paragraphRule = c.numberMode === "front_paragraphs"
    ? `

本案例因為要用「故事前半兩段字數」取數，故事前半必須遵守額外格式：
1. 故事前半請剛好分成兩個自然段落，中間用一個空行分隔。
2. 第一段是「起」：交代人物、處境、壓力來源。
3. 第二段是「承／轉」：讓衝突升高並停在結果未明朗處。
4. 不要加段落標題、編號、項目符號或任何說明文字。`
    : "";
  return `你正在參與一個八卦與 AI 敘事實驗。

本案例固定故事種子：
- 類別：${c.category}
- 隨機元素：${c.storyElements.join("、")}
- 問題：${c.question}

共同規則：
1. 故事前半與後半約 500 字是偏好，不是硬限制；自然完整優先。
2. 情節貼近日常，不要極端巧合或超自然事件。
3. 敘事要具體、自然、連貫，不要條列或摘要。
4. 故事前半要具體但多岔：至少留下三個合理後續方向，不讓任何一條成為唯一明顯答案。
5. 前半的關鍵線索要有多重可解釋性，例如同一個人、物、制度、訊息或症狀，後續可合理走向幫助、阻礙、誤會、延宕或反轉。
6. 不要在前半提前放入過強的解決路徑，例如明顯可靠的救援者、唯一官方程序、唯一犯人、唯一病因或唯一情感答案。
7. 故事後半是此案例的客觀實際發展：請從前半留下的多個合理方向中自然收束到其中一條。
8. 後半可以好轉、惡化、轉折、僵持或出現新變化，但不能靠突兀巧合解決，也不要把所有未解線索都收得過度工整。
9. 除非使用者要求 JSON，否則只輸出任務要求的內容，不加標題、引言或說明。${paragraphRule}`;
}

let state = loadState();
let currentCaseId = state.currentCaseId || null;
let currentStepId = null;

function defaultState() {
  return {
    version: STATE_VERSION,
    cases: [],
    currentCaseId: null,
    analysis: {
      agentFilter: "all",
      ragFilter: "all",
      metric: "all",
      includeIncomplete: true,
    },
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY)) || defaultState();
    return normalizeLoadedState(parsed);
  } catch {
    return defaultState();
  }
}

function normalizeCategory(category) {
  const mapped = LEGACY_CATEGORY_MAP[category] || category;
  return CATEGORIES[mapped] ? mapped : Object.keys(CATEGORIES)[0];
}

function normalizeLoadedState(next) {
  if (!next || !Array.isArray(next.cases)) return defaultState();
  next.version = STATE_VERSION;
  next.analysis = {
    ...defaultState().analysis,
    ...(next.analysis || {}),
  };
  let changed = false;
  next.cases = next.cases.map((item) => {
    const category = normalizeCategory(item.category);
    const normalized = { ...item, category };
    if (category !== item.category) changed = true;

    if (!Array.isArray(normalized.storyElements) || normalized.storyElements.length === 0) {
      normalized.storyElements = pick(CATEGORIES[category], 3);
      changed = true;
    }

    if (!normalized.question || category !== item.category || LEGACY_QUESTION_PATTERN.test(normalized.question)) {
      normalized.question = questionFor(category);
      changed = true;
    }

    if (!normalized.outputs || typeof normalized.outputs !== "object") {
      normalized.outputs = {};
      changed = true;
    }
    if (!normalized.runMeta || typeof normalized.runMeta !== "object") {
      normalized.runMeta = {};
      changed = true;
    }
    if (!normalized.experimentLabel) {
      normalized.experimentLabel = "baseline";
      changed = true;
    }
    if (!normalized.numberMode) {
      normalized.numberMode = "llm";
      changed = true;
    }
    if (normalized.numberMode === "story_length") {
      normalized.numberMode = "front_paragraphs";
      changed = true;
    }
    if (!normalized.updatedAt) {
      normalized.updatedAt = normalized.createdAt || new Date().toISOString();
      changed = true;
    }
    const backfilled = backfillRunMeta(normalized);
    if (backfilled) changed = true;
    return normalized;
  });

  if (!next.cases.some(c => c.id === next.currentCaseId)) {
    next.currentCaseId = next.cases.at(-1)?.id || null;
    changed = true;
  }

  if (changed) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }
  return next;
}

function backfillRunMeta(c) {
  let changed = false;
  getSteps(c).forEach(step => {
    if (step.done && !c.runMeta[step.id]) {
      c.runMeta[step.id] = {
        stepId: step.id,
        stepLabel: step.label,
        kind: step.kind,
        agent: defaultAgentForStep(step.id, c),
        ragMode: defaultRagForStep(step.id),
        label: c.experimentLabel || "baseline",
        note: "由舊版 JSON 匯入時自動回填",
        savedAt: c.updatedAt || c.createdAt || new Date().toISOString(),
      };
      changed = true;
    }
  });
  return changed;
}

function saveState() {
  state.currentCaseId = currentCaseId;
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  render();
}

function currentCase() {
  return state.cases.find(c => c.id === currentCaseId) || null;
}

function currentStep(c = currentCase()) {
  if (!c) return null;
  return getSteps(c).find(s => s.id === currentStepId) || firstPendingStep(c);
}

function getRunControls() {
  return {
    agent: document.getElementById("agentInput")?.value.trim() || "",
    ragMode: document.getElementById("ragModeSelect")?.value || "none",
    label: document.getElementById("runLabelInput")?.value.trim() || "baseline",
    note: document.getElementById("runNoteInput")?.value.trim() || "",
  };
}

function setRunControlsForStep(c, step) {
  if (!c || !step) return;
  const saved = c.runMeta?.[step.id] || {};
  document.getElementById("agentInput").value = saved.agent || defaultAgentForStep(step.id, c);
  document.getElementById("ragModeSelect").value = saved.ragMode || defaultRagForStep(step.id);
  document.getElementById("runLabelInput").value = saved.label || c.experimentLabel || "baseline";
  document.getElementById("runNoteInput").value = saved.note || "";
}

function pick(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

function randomSeedData() {
  const categories = Object.keys(CATEGORIES);
  const category = categories[Math.floor(Math.random() * categories.length)];
  return {
    category,
    elements: pick(CATEGORIES[category], 3),
  };
}

function applyRandomSeedToControls() {
  const seed = randomSeedData();
  document.getElementById("categorySelect").value = seed.category;
  document.getElementById("elementsInput").value = seed.elements.join("、");
}

function questionFor(category) {
  return QUESTION_BY_CATEGORY[category] || `關於這個「${category}」情境，接下來整體狀態會如何發展？`;
}

function numberModeLabel(mode) {
  return mode === "front_paragraphs" ? "前半兩段字數取數" : "LLM 直覷取數";
}

function countStoryChars(text) {
  return [...String(text || "")].filter(ch => /[\p{L}\p{N}]/u.test(ch)).length;
}

function storyFrontParagraphs(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const byBlankLine = raw.split(/\n\s*\n/g).map(x => x.trim()).filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;
  return raw.split(/\n+/g).map(x => x.trim()).filter(Boolean);
}

function paragraphNumberPair(storyFront) {
  const paragraphs = storyFrontParagraphs(storyFront);
  if (paragraphs.length !== 2) {
    throw new Error(`故事前半必須剛好分成兩個自然段落；目前偵測到 ${paragraphs.length} 段。`);
  }
  const n1 = countStoryChars(paragraphs[0]);
  const n2 = countStoryChars(paragraphs[1]);
  if (!n1 || !n2) throw new Error("兩個段落都必須有可計數文字。");
  return { n1, n2, paragraphs };
}

function buildNumbersPatch(c, n1, n2, source) {
  if (!Number.isInteger(n1) || !Number.isInteger(n2) || n1 < 1 || n2 < 1) {
    throw new Error("取數結果必須是正整數。");
  }
  const hexagram = numbersToHexagram(n1, n2);
  return {
    numbers: { n1, n2, source },
    hexagram,
    candidates: getSixCandidates(hexagram.body_trigram_name, hexagram.use_trigram_name),
    randomHexagrams: randomHexagrams(c.kRandom, hexagram),
  };
}

function makeCase() {
  const seed = randomSeedData();
  const category = seed.category;
  const elements = seed.elements;
  document.getElementById("categorySelect").value = category;
  document.getElementById("elementsInput").value = elements.join("、");
  const kRandom = Math.max(1, Math.min(8, Number(document.getElementById("kRandomInput").value) || 3));
  const numberMode = document.getElementById("numberModeSelect").value || "llm";
  const id = `case_${String(state.cases.length + 1).padStart(3, "0")}_${Date.now().toString(36)}`;
  const item = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    experimentLabel: document.getElementById("runLabelInput")?.value.trim() || "baseline",
    category,
    storyElements: elements,
    kRandom,
    numberMode,
    question: questionFor(category),
    outputs: {},
    runMeta: {},
  };
  state.cases.push(item);
  currentCaseId = id;
  currentStepId = "story_front";
  saveState();
}

function cloneCurrentCaseForExperiment() {
  const c = currentCase();
  if (!c) return;
  const outputs = {};
  FOUNDATION_OUTPUT_KEYS.forEach(key => {
    if (c.outputs?.[key] !== undefined) {
      outputs[key] = structuredClone(c.outputs[key]);
    }
  });
  const id = `case_${String(state.cases.length + 1).padStart(3, "0")}_${Date.now().toString(36)}`;
  const clone = {
    ...structuredClone(c),
    id,
    sourceCaseId: c.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    experimentLabel: `${c.experimentLabel || "baseline"} copy`,
    outputs,
    runMeta: {},
  };
  state.cases.push(clone);
  currentCaseId = id;
  currentStepId = firstPendingStep(clone)?.id || "eval1a";
  saveState();
}

function modOne(n, base) {
  const r = n % base;
  return r === 0 ? base : r;
}

function trigramNumToName(n) { return TRIGRAMS[n].name; }
function trigramLines(n) { return [...TRIGRAMS[n].lines]; }
function linesToNum(lines) {
  return 8 - (lines[0] * 4 + lines[1] * 2 + lines[2]);
}
function changedTrigram(num, pos) {
  const lines = trigramLines(num);
  lines[pos - 1] = 1 - lines[pos - 1];
  return linesToNum(lines);
}
function hexLines(upper, lower) {
  return [...trigramLines(lower), ...trigramLines(upper)];
}
function mutual(lines) {
  const lower = linesToNum([lines[1], lines[2], lines[3]]);
  const upper = linesToNum([lines[2], lines[3], lines[4]]);
  return { upper, lower };
}
function relation(body, use) {
  if (body === use) return "體用比和";
  if (SHENG[use] === body) return "用生體";
  if (SHENG[body] === use) return "體生用";
  if (KE[body] === use) return "體剋用";
  if (KE[use] === body) return "用剋體";
  return "未知關係";
}
function buildHexagram(upperNum, lowerNum, movingLine, n1 = null, n2 = null) {
  const upper = trigramNumToName(upperNum);
  const lower = trigramNumToName(lowerNum);
  const lines = hexLines(upperNum, lowerNum);
  let bodyNum, useNum, changedUpperNum, changedLowerNum, changedUseNum;
  if (movingLine <= 3) {
    bodyNum = upperNum;
    useNum = lowerNum;
    changedUseNum = changedTrigram(lowerNum, movingLine);
    changedUpperNum = upperNum;
    changedLowerNum = changedUseNum;
  } else {
    bodyNum = lowerNum;
    useNum = upperNum;
    changedUseNum = changedTrigram(upperNum, movingLine - 3);
    changedUpperNum = changedUseNum;
    changedLowerNum = lowerNum;
  }
  const bodyName = trigramNumToName(bodyNum);
  const useName = trigramNumToName(useNum);
  const changedUpper = trigramNumToName(changedUpperNum);
  const changedLower = trigramNumToName(changedLowerNum);
  const m = mutual(lines);
  const mutualUpper = trigramNumToName(m.upper);
  const mutualLower = trigramNumToName(m.lower);
  const bodyElement = TRIGRAMS[bodyNum].element;
  const useElement = TRIGRAMS[useNum].element;
  return {
    n1, n2,
    upper_trigram_num: upperNum,
    lower_trigram_num: lowerNum,
    upper_trigram_name: upper,
    lower_trigram_name: lower,
    moving_line: movingLine,
    body_trigram_name: bodyName,
    use_trigram_name: useName,
    hexagram_name: HEX[upper][lower],
    changed_hexagram_name: HEX[changedUpper][changedLower],
    changed_use_trigram_name: trigramNumToName(changedUseNum),
    mutual_hexagram_name: HEX[mutualUpper][mutualLower],
    mutual_upper_trigram_name: mutualUpper,
    mutual_lower_trigram_name: mutualLower,
    body_element: bodyElement,
    use_element: useElement,
    element_relation: relation(bodyElement, useElement),
    all_lines: lines,
  };
}
function numbersToHexagram(n1, n2) {
  return buildHexagram(modOne(n1, 8), modOne(n2, 8), modOne(n1 + n2, 6), n1, n2);
}
function getSixCandidates(body, use) {
  const bodyNum = NAME_TO_NUM[body];
  const useNum = NAME_TO_NUM[use];
  const out = [];
  for (let i = 1; i <= 3; i += 1) {
    out.push({ candidate_id: `C${i}`, ...buildHexagram(bodyNum, useNum, i) });
  }
  for (let i = 4; i <= 6; i += 1) {
    out.push({ candidate_id: `C${i}`, ...buildHexagram(useNum, bodyNum, i) });
  }
  return out;
}
function randomHexagrams(k, trueHex) {
  const seen = new Set([`${trueHex.hexagram_name}_${trueHex.moving_line}`]);
  const out = [];
  while (out.length < k) {
    const n1 = 1 + Math.floor(Math.random() * 999);
    const n2 = 1 + Math.floor(Math.random() * 999);
    const h = numbersToHexagram(n1, n2);
    const key = `${h.hexagram_name}_${h.moving_line}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(h);
    }
  }
  return out;
}

function cleanJsonText(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = Math.min(...["{", "["].map(ch => {
    const i = t.indexOf(ch);
    return i < 0 ? Infinity : i;
  }));
  if (Number.isFinite(first)) t = t.slice(first);
  const lastObj = t.lastIndexOf("}");
  const lastArr = t.lastIndexOf("]");
  const last = Math.max(lastObj, lastArr);
  if (last >= 0) t = t.slice(0, last + 1);
  return t.replace(/,\s*([}\]])/g, "$1");
}

function parseJsonResponse(text) {
  return JSON.parse(cleanJsonText(text));
}

function wordWarning(text, label) {
  return "";
}

function cardText(cardData) {
  const card = cardData?.reading_card || cardData || {};
  return ["本卦主調", "體用關係", "主要優勢", "主要風險", "動爻警訊", "變卦結果", "過程壓力／互卦", "行動建議"]
    .map(k => `【${k}】${card[k] || ""}`).join("\n");
}

function guaText(h) {
  return [
    `本卦：${h.hexagram_name}（${h.upper_trigram_name}上${h.lower_trigram_name}下）`,
    `變卦：${h.changed_hexagram_name}（用卦變為${h.changed_use_trigram_name}）`,
    `互卦：${h.mutual_hexagram_name}（${h.mutual_upper_trigram_name}上${h.mutual_lower_trigram_name}下）`,
    `體卦：${h.body_trigram_name}（五行：${h.body_element}）`,
    `用卦：${h.use_trigram_name}（五行：${h.use_element}）`,
    `體用關係：${h.element_relation}`,
    `動爻：第 ${h.moving_line} 爻`,
    `動爻爻辭：未提供。請只根據卦象結構與上述資料保守解讀。`,
  ].join("\n");
}

function candidateText(candidates) {
  return candidates.map(c => {
    return `${c.candidate_id}：${c.hexagram_name} → ${c.changed_hexagram_name}；體=${c.body_trigram_name}，用=${c.use_trigram_name}，動爻=${c.moving_line}，體用=${c.element_relation}`;
  }).join("\n\n");
}

function ensureStoryBackCandidates(c) {
  if (c.outputs.storyBackCandidates) return c.outputs.storyBackCandidates;
  const real = c.outputs.story_back;
  const distractors = c.outputs.distractors?.distractors || [];
  if (!real || distractors.length < 4) return null;
  const items = [{ type: "real", text: real }, ...distractors.map(d => ({ type: "distractor", original_id: d.id, text: d.text }))];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  const candidates = items.map((item, i) => ({ candidate_id: `S${i + 1}`, ...item }));
  c.outputs.storyBackCandidates = {
    actual_back_id: candidates.find(x => x.type === "real")?.candidate_id,
    candidates,
  };
  return c.outputs.storyBackCandidates;
}

function storyBackCandidatesText(c) {
  const data = ensureStoryBackCandidates(c);
  if (!data) return "";
  return data.candidates.map(x => `${x.candidate_id}：${x.text}`).join("\n\n");
}

function storyBackSamplesText(o) {
  return (o.story_back_samples || [])
    .map((text, i) => text ? `B${i + 1}：${text}` : "")
    .filter(Boolean)
    .join("\n\n");
}

function saveStoryBackSample(c, index, text) {
  const samples = [...(c.outputs.story_back_samples || [])];
  samples[index] = text.trim();
  return {
    story_back_samples: samples,
    story_back_stability_qc: null,
    __invalidateRunMeta: ["story_back_stability_qc"],
  };
}

function storyBackStabilityLabel(qc) {
  if (!qc) return "尚無";
  const score = Number(qc.stability_score);
  const scoreText = Number.isFinite(score) ? `${score.toFixed(0)}` : "未評分";
  return `${qc.pass ? "通過" : "未通過"} / ${scoreText}`;
}

function claimsText(claimsData) {
  return (claimsData?.claims || []).map((x, i) => `${i + 1}. [${x.claim_type}] ${x.claim}`).join("\n");
}

function getSteps(c) {
  const o = c?.outputs || {};
  const randomCount = c?.kRandom || 3;
  const storyFrontStep = {
    id: "story_front", label: "1 故事前半", kind: "主線", done: !!o.story_front, ready: !!c,
    system: storySeedSystem(c),
    user: () => c?.numberMode === "front_paragraphs"
      ? "請生成故事前半段，剛好分成兩個自然段落，停在結果未明朗的轉折點。"
      : "請生成故事前半段，停在結果未明朗的轉折點。",
    hint: "在 web LLM 開新對話，貼入此案例固定 system prompt，再送出這句 user prompt。後續取數與後半段都沿用同一個 system prompt。",
    save: (text) => {
      const story = text.trim();
      if (c?.numberMode === "front_paragraphs") paragraphNumberPair(story);
      return { story_front: story };
    },
  };
  const llmNumbersStep = {
    id: "numbers", label: "2 取數 branch", kind: "Branch A", done: !!o.numbers, ready: !!o.story_front,
    system: storySeedSystem(c),
    user: () => `請根據上一則故事前半段與本案例問題，憑直覺輸出兩個 1～999 的正整數；只輸出 JSON：{"n1":0,"n2":0}`,
    hint: "從故事前半回應處開 branch，不換 system prompt，直接送出這句簡短 user prompt。",
    save: (text) => {
      const data = parseJsonResponse(text);
      const n1 = Number(data.n1);
      const n2 = Number(data.n2);
      if (!Number.isInteger(n1) || !Number.isInteger(n2) || n1 < 1 || n1 > 999 || n2 < 1 || n2 > 999) {
        throw new Error("n1/n2 必須是 1～999 的整數。");
      }
      return buildNumbersPatch(c, n1, n2, "llm_intuition");
    },
  };
  const storyBackStep = {
    id: "story_back", label: "3 故事後半 branch", kind: "Branch B", done: !!o.story_back, ready: !!o.story_front,
    system: storySeedSystem(c),
    user: () => "請接續上一則故事前半段，生成故事後半段。",
    hint: "從故事前半回應處另開 branch，不換 system prompt。這一步不可看卦象或數字。",
    save: (text) => {
      const patch = {
        story_back: text.trim(),
        story_back_samples: [],
        story_back_stability_qc: null,
        storyBackCandidates: null,
        distractors: null,
        distractor_qc: null,
        eval2_nocard: null,
        eval2_true: null,
        evidence_true: null,
        __invalidateRunMeta: [
          ...Array.from({ length: STORY_BACK_STABILITY_SAMPLE_COUNT }, (_, idx) => `story_back_sample_${idx + 1}`),
          "story_back_stability_qc",
          "distractors",
          "distractor_qc",
          "eval2_nocard",
          "eval2_true",
          "evidence_true",
        ],
      };
      for (let i = 1; i <= (c?.kRandom || 0); i += 1) {
        patch[`eval2_random_${i}`] = null;
        patch[`evidence_random_${i}`] = null;
        patch.__invalidateRunMeta.push(`eval2_random_${i}`, `evidence_random_${i}`);
      }
      return patch;
    },
  };
  const storyBackSampleSteps = Array.from({ length: STORY_BACK_STABILITY_SAMPLE_COUNT }, (_, i) => ({
    id: `story_back_sample_${i + 1}`,
    label: `3S 後半穩定樣本 ${i + 1}`,
    kind: "Stability",
    done: !!o.story_back_samples?.[i],
    ready: !!o.story_front && !!o.story_back,
    system: storySeedSystem(c),
    user: () => "請接續上一則故事前半段，生成故事後半段。",
    hint: "從同一則故事前半另開 branch 或重新生成；system prompt 與 user prompt 都要和真後半完全相同。請使用同模型、同設定、同 temperature。",
    save: (text) => saveStoryBackSample(c, i, text),
  }));
  const storyBackStabilityQcStep = {
    id: "story_back_stability_qc",
    label: "3Q 後半穩定性 QC",
    kind: "Stability QC",
    done: !!o.story_back_stability_qc,
    ready: !!o.story_front && !!o.story_back && (o.story_back_samples || []).filter(Boolean).length >= STORY_BACK_STABILITY_SAMPLE_COUNT,
    system: SYSTEMS.stabilityQc,
    user: () => `故事前半段：
<<<
${o.story_front}
>>>

問題：
<<<
${c.question}
>>>

原始真後半 actual：
<<<
${o.story_back}
>>>

同 prompt 後半樣本：
<<<
${storyBackSamplesText(o)}
>>>

請判斷這些後半是否指向同一個核心客觀後續。`,
    hint: "這一步用 Gemini 判斷真後續是否受 temperature/branch 影響太大。它比較核心結果，不比較逐字內容。",
    save: (text) => ({ story_back_stability_qc: parseJsonResponse(text) }),
  };
  const paragraphNumbersStep = {
    id: "numbers", label: "2 兩段字數取數", kind: "本地計算", done: !!o.numbers, ready: !!o.story_front,
    system: "此步驟不需要呼叫 LLM。由工作台直接計算故事前半兩個自然段落的字數。",
    user: () => {
      const { n1, n2 } = paragraphNumberPair(o.story_front);
      return `不用貼到 LLM。\n\n計數規則：故事前半必須剛好兩段；去除空白與標點，只計 Unicode 字母/數字字元。\n\n第一段字數 n1 = ${n1}\n第二段字數 n2 = ${n2}\n\n按「儲存並前進」後，工作台會用 n1/n2 自動起卦。`;
    },
    hint: "這是故事前半兩段字數取數：第一段作 n1，第二段作 n2。此步驟不使用 Sonnet/Gemini。",
    auto: true,
    save: () => {
      const { n1, n2 } = paragraphNumberPair(o.story_front);
      return buildNumbersPatch(c, n1, n2, "story_front_two_paragraph_char_count");
    },
  };
  const leading = c?.numberMode === "front_paragraphs"
    ? [storyFrontStep, paragraphNumbersStep, storyBackStep, ...storyBackSampleSteps, storyBackStabilityQcStep]
    : [storyFrontStep, llmNumbersStep, storyBackStep, ...storyBackSampleSteps, storyBackStabilityQcStep];
  const base = [
    ...leading,
    {
      id: "eval1a", label: "4 Layer 1A", kind: "測試", done: !!o.eval1a, ready: !!o.story_front,
      system: SYSTEMS.eval1,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n請輸出體卦與用卦機率。`,
      hint: "這是 Layer 1A：只看前半與問題，不看後半。",
      save: (text) => ({ eval1a: parseJsonResponse(text) }),
    },
    {
      id: "eval1b", label: "5 Layer 1B", kind: "測試", done: !!o.eval1b, ready: !!o.story_front && !!o.story_back,
      system: SYSTEMS.eval1,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n故事後半段：\n<<<\n${o.story_back}\n>>>\n\n請輸出體卦與用卦機率。`,
      hint: "這是 Layer 1B：加入實際後半，測事後可重建性。",
      save: (text) => ({ eval1b: parseJsonResponse(text) }),
    },
    {
      id: "rank1a", label: "6 六候選 A", kind: "測試", done: !!o.rank1a, ready: !!o.story_front && !!o.candidates,
      system: SYSTEMS.rank6,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n六個候選：\n<<<\n${candidateText(o.candidates)}\n>>>\n\n請評分並排序六個候選。`,
      hint: "六候選 A：只看前半與問題。",
      save: (text) => ({ rank1a: parseJsonResponse(text) }),
    },
    {
      id: "rank1b", label: "7 六候選 B", kind: "測試", done: !!o.rank1b, ready: !!o.story_front && !!o.story_back && !!o.candidates,
      system: SYSTEMS.rank6,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n故事後半段：\n<<<\n${o.story_back}\n>>>\n\n六個候選：\n<<<\n${candidateText(o.candidates)}\n>>>\n\n請評分並排序六個候選。`,
      hint: "六候選 B：加入後半，測事後可辨認性。",
      save: (text) => ({ rank1b: parseJsonResponse(text) }),
    },
    {
      id: "card_true", label: "8 真卦解卦卡", kind: "Layer 2", done: !!o.card_true, ready: !!o.story_front && !!o.hexagram,
      system: SYSTEMS.card,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n卦象資料：\n${guaText(o.hexagram)}\n\n請生成解卦卡。`,
      hint: "Layer 2 的真卦卡。請確保這個 branch 看不到故事後半。",
      save: (text) => ({ card_true: parseJsonResponse(text) }),
    },
  ];

  for (let i = 0; i < randomCount; i += 1) {
    base.push({
      id: `card_random_${i + 1}`, label: `8R 隨機卦卡 ${i + 1}`, kind: "Layer 2", done: !!o[`card_random_${i + 1}`], ready: !!o.story_front && !!o.randomHexagrams?.[i],
      system: SYSTEMS.card,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n卦象資料：\n${guaText(o.randomHexagrams[i])}\n\n請生成解卦卡。`,
      hint: "Layer 2 隨機卦對照卡。格式與真卦卡完全一致。",
      save: (text) => ({ [`card_random_${i + 1}`]: parseJsonResponse(text) }),
    });
  }

  base.push(
    {
      id: "distractors", label: "9 Hard distractors", kind: "Layer 2", done: !!o.distractors, ready: !!o.story_front && !!o.story_back,
      system: SYSTEMS.distractors,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n真實故事後半段：\n<<<\n${o.story_back}\n>>>\n\n請生成 4 個替代後半段。`,
      hint: "這一步會看到真後半，只用來生成候選，不可與解卦卡 branch 混在一起。",
      save: (text) => ({ distractors: parseJsonResponse(text), storyBackCandidates: null }),
    },
    {
      id: "distractor_qc", label: "10 Distractor QC", kind: "Layer 2", done: !!o.distractor_qc, ready: !!o.story_front && !!o.story_back && !!o.distractors,
      system: SYSTEMS.qc,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n真實故事後半段：\n<<<\n${o.story_back}\n>>>\n\n替代後續：\n<<<\n${(o.distractors?.distractors || []).map(d => `${d.id}：${d.text}`).join("\n\n")}\n>>>\n\n請檢查每個替代後續是否合格。`,
      hint: "QC 不會直接進統計，但可用來決定是否重做 distractor。",
      save: (text) => ({ distractor_qc: parseJsonResponse(text) }),
    },
    {
      id: "eval2_nocard", label: "11 No-card baseline", kind: "Layer 2 baseline", done: !!o.eval2_nocard, ready: !!o.story_front && !!o.story_back && !!o.distractors,
      system: SYSTEMS.noCard,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n五個候選後半段：\n<<<\n${storyBackCandidatesText(c)}\n>>>\n\n請在不使用任何解卦卡的情況下，評分並排序五個候選後半段。`,
      hint: "No-card baseline：完全不給卦卡，測故事前半 alone 是否已能辨認真後續。",
      save: (text) => ({ eval2_nocard: parseJsonResponse(text) }),
    },
    {
      id: "eval2_true", label: "12 真卦卡辨認", kind: "Layer 2", done: !!o.eval2_true, ready: !!o.story_front && !!o.card_true && !!o.distractors,
      system: SYSTEMS.eval2,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n解卦卡：\n<<<\n${cardText(o.card_true)}\n>>>\n\n五個候選後半段：\n<<<\n${storyBackCandidatesText(c)}\n>>>\n\n請根據解卦卡，評分並排序五個候選後半段。`,
      hint: "Layer 2A 真卦卡測試：評估器只看卡與五個後續。",
      save: (text) => ({ eval2_true: parseJsonResponse(text) }),
    },
  );

  for (let i = 0; i < randomCount; i += 1) {
    base.push({
      id: `eval2_random_${i + 1}`, label: `12R 隨機卡辨認 ${i + 1}`, kind: "Layer 2", done: !!o[`eval2_random_${i + 1}`], ready: !!o.story_front && !!o[`card_random_${i + 1}`] && !!o.distractors,
      system: SYSTEMS.eval2,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n解卦卡：\n<<<\n${cardText(o[`card_random_${i + 1}`])}\n>>>\n\n五個候選後半段：\n<<<\n${storyBackCandidatesText(c)}\n>>>\n\n請根據解卦卡，評分並排序五個候選後半段。`,
      hint: "Layer 2A 隨機卡對照測試。每張隨機卡都要跑一次。",
      save: (text) => ({ [`eval2_random_${i + 1}`]: parseJsonResponse(text) }),
    });
  }

  base.push({
    id: "claims_true", label: "13 真卦 Claims", kind: "Layer 2B", done: !!o.claims_true, ready: !!o.card_true,
    system: SYSTEMS.claims,
    user: () => `解卦卡：\n<<<\n${cardText(o.card_true)}\n>>>\n\n請拆解成六個可檢驗 claim。`,
    hint: "Layer 2B：把真卦卡拆成可被故事驗證的 claim。",
    save: (text) => ({ claims_true: parseJsonResponse(text) }),
  });

  for (let i = 0; i < randomCount; i += 1) {
    base.push({
      id: `claims_random_${i + 1}`, label: `13R 隨機 Claims ${i + 1}`, kind: "Layer 2B", done: !!o[`claims_random_${i + 1}`], ready: !!o[`card_random_${i + 1}`],
      system: SYSTEMS.claims,
      user: () => `解卦卡：\n<<<\n${cardText(o[`card_random_${i + 1}`])}\n>>>\n\n請拆解成六個可檢驗 claim。`,
      hint: "Layer 2B 隨機卡 claim 拆解。",
      save: (text) => ({ [`claims_random_${i + 1}`]: parseJsonResponse(text) }),
    });
  }

  base.push({
    id: "evidence_true", label: "14 真卦證據評分", kind: "Layer 2B", done: !!o.evidence_true, ready: !!o.story_front && !!o.story_back && !!o.claims_true,
    system: SYSTEMS.evidence,
    user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n真實後半段：\n<<<\n${o.story_back}\n>>>\n\nClaims：\n<<<\n${claimsText(o.claims_true)}\n>>>\n\n請逐條評分。`,
    hint: "Layer 2B：用完整故事評分真卦卡 claim 是否被支持。",
    save: (text) => ({ evidence_true: parseJsonResponse(text) }),
  });

  for (let i = 0; i < randomCount; i += 1) {
    base.push({
      id: `evidence_random_${i + 1}`, label: `14R 隨機證據 ${i + 1}`, kind: "Layer 2B", done: !!o[`evidence_random_${i + 1}`], ready: !!o.story_front && !!o.story_back && !!o[`claims_random_${i + 1}`],
      system: SYSTEMS.evidence,
      user: () => `故事前半段：\n<<<\n${o.story_front}\n>>>\n\n問題：\n<<<\n${c.question}\n>>>\n\n真實後半段：\n<<<\n${o.story_back}\n>>>\n\nClaims：\n<<<\n${claimsText(o[`claims_random_${i + 1}`])}\n>>>\n\n請逐條評分。`,
      hint: "Layer 2B 隨機卡 claim 證據評分。",
      save: (text) => ({ [`evidence_random_${i + 1}`]: parseJsonResponse(text) }),
    });
  }

  return base;
}

function firstPendingStep(c) {
  return getSteps(c).find(s => s.ready && !s.done) || getSteps(c).find(s => s.ready) || null;
}

function render() {
  renderCaseControls();
  renderStepList();
  renderCurrentStep();
  renderInspector();
  renderData();
  renderAnalysis();
}

function renderCaseControls() {
  const cat = document.getElementById("categorySelect");
  if (!cat.options.length) {
    Object.keys(CATEGORIES).forEach(k => cat.add(new Option(k, k)));
  }
  const selectedCategory = cat.value || Object.keys(CATEGORIES)[0];
  if (!document.getElementById("elementsInput").value.trim()) {
    applyRandomSeedToControls();
  }
  cat.onchange = () => {
    document.getElementById("elementsInput").value = pick(CATEGORIES[cat.value], 3).join("、");
  };

  const caseSelect = document.getElementById("caseSelect");
  caseSelect.innerHTML = "";
  state.cases.forEach(c => caseSelect.add(new Option(`${c.id}｜${c.category}`, c.id)));
  caseSelect.value = currentCaseId || "";
  caseSelect.onchange = () => {
    currentCaseId = caseSelect.value;
    currentStepId = firstPendingStep(currentCase())?.id || null;
    saveState();
  };

  const c = currentCase();
  if (c) document.getElementById("numberModeSelect").value = c.numberMode || "llm";
  document.getElementById("caseMeta").innerHTML = c
    ? `<span class="pill">${escapeHtml(c.category)}</span><span class="pill">K=${c.kRandom}</span><span class="pill">${escapeHtml(numberModeLabel(c.numberMode))}</span><span class="pill">${escapeHtml(c.experimentLabel || "baseline")}</span><br>${c.storyElements.map(x => `<span class="pill">${escapeHtml(x)}</span>`).join("")}<p class="small">${escapeHtml(c.question)}</p>`
    : `<p class="muted">尚未抽籤。</p>`;
  renderCaseBoard();
}

function renderCaseBoard() {
  const box = document.getElementById("caseBoard");
  if (!box) return;
  box.innerHTML = "";
  const tpl = document.getElementById("caseCardTemplate");
  state.cases.forEach(c => {
    const steps = getSteps(c);
    const done = steps.filter(s => s.done).length;
    const total = steps.length;
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.classList.toggle("active", c.id === currentCaseId);
    node.querySelector(".case-card-title").textContent = `${c.id}｜${c.category}`;
    node.querySelector(".case-card-meta").textContent = `${c.storyElements.join("、")}｜${numberModeLabel(c.numberMode)}｜${c.experimentLabel || "baseline"}`;
    node.querySelector(".case-card-progress").textContent = `${done}/${total} steps｜${agentSummary(c)}`;
    node.onclick = () => {
      currentCaseId = c.id;
      currentStepId = firstPendingStep(c)?.id || getSteps(c)[0]?.id || null;
      saveState();
    };
    box.appendChild(node);
  });
}

function renderStepList() {
  const box = document.getElementById("stepList");
  const c = currentCase();
  box.innerHTML = "";
  if (!c) return;
  if (!currentStepId) currentStepId = firstPendingStep(c)?.id;
  const tpl = document.getElementById("stepItemTemplate");
  getSteps(c).forEach(step => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.classList.toggle("done", step.done);
    node.classList.toggle("pending", step.ready && !step.done);
    node.classList.toggle("locked", !step.ready);
    node.classList.toggle("active", step.id === currentStepId);
    node.querySelector(".step-state").textContent = step.done ? "✓" : step.ready ? "•" : "×";
    node.querySelector(".step-name").textContent = step.label;
    node.onclick = () => {
      currentStepId = step.id;
      renderCurrentStep();
      renderStepList();
    };
    box.appendChild(node);
  });
}

function renderCurrentStep() {
  const c = currentCase();
  const title = document.getElementById("currentStepTitle");
  const kind = document.getElementById("stepKind");
  const sys = document.getElementById("systemPrompt");
  const user = document.getElementById("userPrompt");
  const hint = document.getElementById("branchHint");
  if (!c) {
    title.textContent = "尚未建立案例";
    kind.textContent = "目前步驟";
    sys.value = "";
    user.value = "";
    hint.textContent = "先在左側抽一個新案例。";
    return;
  }
  const step = getSteps(c).find(s => s.id === currentStepId) || firstPendingStep(c);
  if (!step) {
    title.textContent = "此案例已無可執行步驟";
    kind.textContent = c.id;
    sys.value = "";
    user.value = "";
    hint.textContent = "可以到資料頁下載 JSON，或到 Layer 2 結果頁查看目前指標。";
    return;
  }
  currentStepId = step.id;
  title.textContent = step.label;
  kind.textContent = `${c.id}｜${step.kind}`;
  sys.value = step.ready ? step.system : "前置資料尚未完成。";
  user.value = step.ready ? step.user() : "請先完成前置步驟。";
  hint.textContent = step.hint;
  setRunControlsForStep(c, step);
  renderRunMetaPreview(c, step);
  document.getElementById("responseInput").value = "";
  document.getElementById("saveStatus").textContent = step.done ? "此步驟已有資料；若再次儲存會覆蓋。" : "";
  document.getElementById("saveStatus").className = "status";
}

function agentSummary(c) {
  const metas = Object.values(c.runMeta || {});
  const agents = [...new Set(metas.map(m => m.agent).filter(Boolean))];
  if (!agents.length) return "尚無 agent 紀錄";
  return agents.slice(0, 2).join(" / ") + (agents.length > 2 ? ` +${agents.length - 2}` : "");
}

function renderRunMetaPreview(c, step) {
  const box = document.getElementById("runMetaPreview");
  if (!box) return;
  const saved = c.runMeta?.[step.id];
  const controls = getRunControls();
  const draftAgent = controls.agent || saved?.agent || defaultAgentForStep(step.id, c);
  const draftRag = controls.ragMode || saved?.ragMode || defaultRagForStep(step.id);
  const draftLabel = controls.label || saved?.label || c.experimentLabel || "baseline";
  box.innerHTML = [
    `<span class="pill">本步驟 agent：${escapeHtml(draftAgent)}</span>`,
    `<span class="pill">RAG：${escapeHtml(ragLabel(draftRag))}</span>`,
    `<span class="pill">標籤：${escapeHtml(draftLabel)}</span>`,
    saved?.savedAt ? `<span class="pill">上次儲存：${escapeHtml(new Date(saved.savedAt).toLocaleString())}</span>` : `<span class="pill">尚未儲存此步驟</span>`,
  ].join("");
}

function ragLabel(value) {
  return {
    none: "不使用 RAG",
    "standard-book": "標準解卦書 RAG",
    "custom-rag": "自訂 RAG",
  }[value] || value || "不使用 RAG";
}

function renderInspector() {
  const c = currentCase();
  const snap = document.getElementById("caseSnapshot");
  const hex = document.getElementById("hexagramView");
  if (!c) {
    snap.innerHTML = `<p class="muted">尚無案例。</p>`;
    hex.textContent = "等待 Step 3 數字。";
    return;
  }
  const o = c.outputs;
  const done = getSteps(c).filter(s => s.done).length;
  const total = getSteps(c).length;
  const frontParagraphs = c.numberMode === "front_paragraphs" && o.story_front ? storyFrontParagraphs(o.story_front) : [];
  snap.innerHTML = [
    `<span class="pill">${done}/${total} steps</span>`,
    o.story_front ? `<p>前半字數：${countStoryChars(o.story_front)}</p>` : "",
    frontParagraphs.length ? `<p>段落字數：${frontParagraphs.map(p => countStoryChars(p)).join(" / ")}</p>` : "",
    o.story_back ? `<p>後半字數：${countStoryChars(o.story_back)}</p>` : "",
    o.story_back ? `<p>後半穩定樣本：${(o.story_back_samples || []).filter(Boolean).length}/${STORY_BACK_STABILITY_SAMPLE_COUNT}</p>` : "",
    o.story_back_stability_qc ? `<p>後半穩定性：${storyBackStabilityLabel(o.story_back_stability_qc)}</p>` : "",
    o.numbers ? `<p>取數：${o.numbers.n1}, ${o.numbers.n2}${o.numbers.source ? `（${escapeHtml(o.numbers.source)}）` : ""}</p>` : "",
    o.storyBackCandidates ? `<p>真後續 ID：${o.storyBackCandidates.actual_back_id}</p>` : "",
  ].join("");

  if (o.hexagram) {
    hex.innerHTML = renderHex(o.hexagram);
  } else {
    hex.textContent = "等待 Step 3 數字。";
  }
}

function renderHex(h) {
  const lineHtml = [...h.all_lines].reverse().map(v => `<div class="line ${v ? "yang" : "yin"}"></div>`).join("");
  return `<div class="hex-card">
    <div class="hex-title">${h.hexagram_name} → ${h.changed_hexagram_name}</div>
    <div class="hex-lines">${lineHtml}</div>
    <p>上${h.upper_trigram_name}下${h.lower_trigram_name}，動爻 ${h.moving_line}</p>
    <p>體 ${h.body_trigram_name}（${h.body_element}），用 ${h.use_trigram_name}（${h.use_element}）：${h.element_relation}</p>
    <p>互卦：${h.mutual_hexagram_name}</p>
  </div>`;
}

function renderData() {
  const c = currentCase();
  document.getElementById("rawJson").value = c ? JSON.stringify(c, null, 2) : JSON.stringify(state, null, 2);
}

function rankOf(ranking, id) {
  const idx = (ranking || []).findIndex(x => (typeof x === "string" ? x : x.candidate_id || x.id) === id);
  return idx < 0 ? 0 : idx + 1;
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function claimMean(data) {
  const scores = data?.claim_scores || [];
  return scores.length ? mean(scores.map(x => Number(x.score) || 0)) : null;
}

function trueCandidateId(c) {
  const moving = c.outputs?.hexagram?.moving_line;
  return moving ? `C${moving}` : null;
}

function rankMrr(ranking, id) {
  const r = rankOf(ranking, id);
  return r ? 1 / r : null;
}

function stepMetricGroup(stepId) {
  if (["eval1a", "eval1b", "rank1a", "rank1b"].includes(stepId)) return "layer1";
  if (stepId.startsWith("eval2_") || stepId === "card_true" || stepId.startsWith("card_random_")) return "layer2a";
  if (stepId.startsWith("claims_") || stepId.startsWith("evidence_")) return "layer2b";
  return "progress";
}

function metricAllowsStep(stepId, metric) {
  if (metric === "all" || metric === "progress") return true;
  return stepMetricGroup(stepId) === metric;
}

function runMetaList(c, metric = "all") {
  return Object.entries(c.runMeta || {})
    .filter(([stepId]) => metricAllowsStep(stepId, metric))
    .map(([stepId, meta]) => ({ stepId, ...meta }));
}

function caseMatchesAnalysisFilters(c, filters) {
  if (filters.includeIncomplete && filters.agent === "all" && filters.rag === "all") return true;
  const metas = runMetaList(c, filters.metric);
  const agentOk = filters.agent === "all" || metas.some(m => m.agent === filters.agent);
  const ragOk = filters.rag === "all" || metas.some(m => (m.ragMode || "none") === filters.rag);
  if (filters.agent === "all" && filters.rag === "all") return filters.includeIncomplete || analyzeCase(c);
  return agentOk && ragOk;
}

function analyzeCase(c) {
  const o = c.outputs;
  const actual = o.storyBackCandidates?.actual_back_id;
  const trueC = trueCandidateId(c);
  const rank1aMrr = trueC ? rankMrr(o.rank1a?.ranking, trueC) : null;
  const rank1bMrr = trueC ? rankMrr(o.rank1b?.ranking, trueC) : null;
  const stabilityScoreRaw = Number(o.story_back_stability_qc?.stability_score);
  const stabilityScore = Number.isFinite(stabilityScoreRaw) ? stabilityScoreRaw : null;
  const stabilityPass = typeof o.story_back_stability_qc?.pass === "boolean" ? o.story_back_stability_qc.pass : null;
  if (!actual || !o.eval2_true) return null;
  const noCardRank = rankOf(o.eval2_nocard?.ranking, actual);
  const noCardMrr = noCardRank ? 1 / noCardRank : null;
  const trueRank = rankOf(o.eval2_true.ranking, actual);
  if (!trueRank) return null;
  const trueMrr = 1 / trueRank;
  const randomMrrs = [];
  for (let i = 1; i <= c.kRandom; i += 1) {
    const ev = o[`eval2_random_${i}`];
    const r = rankOf(ev?.ranking, actual);
    if (r) randomMrrs.push(1 / r);
  }
  if (!randomMrrs.length) return null;
  const claimTrue = claimMean(o.evidence_true);
  const claimRandoms = [];
  for (let i = 1; i <= c.kRandom; i += 1) {
    const m = claimMean(o[`evidence_random_${i}`]);
    if (m !== null) claimRandoms.push(m);
  }
  return {
    id: c.id,
    category: c.category,
    label: c.experimentLabel || "baseline",
    actual,
    trueCandidateId: trueC,
    rank1aMrr,
    rank1bMrr,
    stabilityScore,
    stabilityPass,
    noCardRank,
    noCardMrr,
    trueRank,
    trueMrr,
    randomMrr: mean(randomMrrs),
    deltaMrr: trueMrr - mean(randomMrrs),
    deltaVsNoCard: noCardMrr === null ? null : trueMrr - noCardMrr,
    pairwiseWinRate: randomMrrs.filter(x => trueMrr > x).length / randomMrrs.length,
    top1True: trueRank === 1,
    claimTrue,
    claimRandom: claimRandoms.length ? mean(claimRandoms) : null,
    deltaClaim: claimTrue !== null && claimRandoms.length ? claimTrue - mean(claimRandoms) : null,
  };
}

function renderAnalysis() {
  populateAnalysisFilters();
  const filters = {
    agent: document.getElementById("analysisAgentFilter").value || "all",
    rag: document.getElementById("analysisRagFilter").value || "all",
    metric: document.getElementById("analysisMetricSelect").value || "all",
    includeIncomplete: document.getElementById("analysisIncludeIncomplete").checked,
  };
  const scopedCases = state.cases.filter(c => caseMatchesAnalysisFilters(c, filters));
  const rows = scopedCases.map(analyzeCase).filter(Boolean);
  const out = document.getElementById("analysisOutput");
  const completion = completionStats(scopedCases, filters.metric);
  const runStats = runConditionStats(scopedCases, filters.metric);
  const noCardRows = rows.filter(x => x.noCardMrr !== null);
  const noCardDeltaRows = rows.filter(x => x.deltaVsNoCard !== null);
  const stabilityQcs = scopedCases.map(c => c.outputs?.story_back_stability_qc).filter(Boolean);
  const stabilityScores = stabilityQcs
    .map(qc => Number(qc.stability_score))
    .filter(Number.isFinite);
  const stabilityPassCount = stabilityQcs.filter(qc => qc.pass === true).length;
  const summary = {
    n: rows.length,
    meanTrueMrr: mean(rows.map(x => x.trueMrr)),
    meanRandomMrr: mean(rows.map(x => x.randomMrr)),
    noCardN: noCardRows.length,
    meanNoCardMrr: noCardRows.length ? mean(noCardRows.map(x => x.noCardMrr)) : null,
    stabilityN: stabilityQcs.length,
    stabilityPassRate: stabilityQcs.length ? stabilityPassCount / stabilityQcs.length : null,
    meanStabilityScore: stabilityScores.length ? mean(stabilityScores) : null,
    meanDeltaMrr: mean(rows.map(x => x.deltaMrr)),
    meanDeltaVsNoCard: noCardDeltaRows.length ? mean(noCardDeltaRows.map(x => x.deltaVsNoCard)) : null,
    meanPairwise: mean(rows.map(x => x.pairwiseWinRate)),
    top1: rows.filter(x => x.top1True).length / rows.length,
    meanDeltaClaim: mean(rows.filter(x => x.deltaClaim !== null).map(x => x.deltaClaim)),
    rank1aMrr: mean(rows.filter(x => x.rank1aMrr !== null).map(x => x.rank1aMrr)),
    rank1bMrr: mean(rows.filter(x => x.rank1bMrr !== null).map(x => x.rank1bMrr)),
  };
  out.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><strong>${scopedCases.length}</strong><span>篩選後案例</span></div>
      <div class="stat-card"><strong>${completion.done}/${completion.total}</strong><span>已完成步驟</span></div>
      <div class="stat-card"><strong>${completion.percent}%</strong><span>整體完成率</span></div>
      <div class="stat-card"><strong>${summary.n}</strong><span>可計算 Layer 2A 案例</span></div>
      <div class="stat-card"><strong>${summary.stabilityN ? `${stabilityPassCount}/${summary.stabilityN}` : "尚無"}</strong><span>後半穩定 QC 通過</span></div>
      <div class="stat-card"><strong>${summary.meanStabilityScore === null ? "尚無" : summary.meanStabilityScore.toFixed(1)}</strong><span>平均穩定分數</span></div>
      <div class="stat-card"><strong>${summary.n && Number.isFinite(summary.meanDeltaMrr) ? signed(summary.meanDeltaMrr, 3) : "尚無"}</strong><span>平均 Δ-MRR</span></div>
      <div class="stat-card"><strong>${summary.n && Number.isFinite(summary.meanDeltaClaim) ? signed(summary.meanDeltaClaim, 3) : "尚無"}</strong><span>平均 Δ-Claim</span></div>
    </div>

    <h3 class="section-title">完成度</h3>
    ${renderCompletionTable(completion.stepRows)}

    <h3 class="section-title">執行條件分佈</h3>
    ${renderRunConditionTable(runStats)}

    ${filters.metric !== "progress" ? `
      <h3 class="section-title">可計算指標</h3>
      ${rows.length ? `
        <div>
          <span class="pill">真卦 MRR ${summary.meanTrueMrr.toFixed(3)}</span>
          <span class="pill">No-card MRR ${summary.meanNoCardMrr === null ? "尚無" : summary.meanNoCardMrr.toFixed(3)}</span>
          <span class="pill">隨機 MRR ${summary.meanRandomMrr.toFixed(3)}</span>
          <span class="pill">真卦 - No-card ${summary.meanDeltaVsNoCard === null ? "尚無" : signed(summary.meanDeltaVsNoCard, 3)}</span>
          <span class="pill">配對勝率 ${(summary.meanPairwise * 100).toFixed(1)}%</span>
          <span class="pill">Top-1 ${(summary.top1 * 100).toFixed(1)}%</span>
          <span class="pill">六候選 A MRR ${Number.isFinite(summary.rank1aMrr) ? summary.rank1aMrr.toFixed(3) : "尚無"}</span>
          <span class="pill">六候選 B MRR ${Number.isFinite(summary.rank1bMrr) ? summary.rank1bMrr.toFixed(3) : "尚無"}</span>
          <span class="pill">後半穩定通過率 ${summary.stabilityPassRate === null ? "尚無" : `${(summary.stabilityPassRate * 100).toFixed(1)}%`}</span>
        </div>
        <table>
          <thead><tr><th>案例</th><th>類別</th><th>標籤</th><th>真候選</th><th>真後續</th><th>後半穩定</th><th>Layer1A</th><th>Layer1B</th><th>No-card</th><th>真卦排名</th><th>真卦 MRR</th><th>隨機 MRR</th><th>Δ-MRR</th><th>真卦-No-card</th><th>配對勝率</th><th>Δ-Claim</th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.label)}</td><td>${r.trueCandidateId || "尚無"}</td><td>${r.actual}</td>
              <td>${r.stabilityPass === null ? "尚無" : `${r.stabilityPass ? "通過" : "未通過"}${r.stabilityScore === null ? "" : ` / ${r.stabilityScore.toFixed(0)}`}`}</td>
              <td>${r.rank1aMrr === null ? "尚無" : r.rank1aMrr.toFixed(3)}</td><td>${r.rank1bMrr === null ? "尚無" : r.rank1bMrr.toFixed(3)}</td>
              <td>${r.noCardRank || "尚無"}${r.noCardMrr === null ? "" : ` / ${r.noCardMrr.toFixed(3)}`}</td>
              <td>${r.trueRank}</td><td>${r.trueMrr.toFixed(3)}</td><td>${r.randomMrr.toFixed(3)}</td>
              <td>${signed(r.deltaMrr, 3)}</td><td>${r.deltaVsNoCard === null ? "尚無" : signed(r.deltaVsNoCard, 3)}</td><td>${(r.pairwiseWinRate * 100).toFixed(1)}%</td>
              <td>${r.deltaClaim === null ? "尚無" : signed(r.deltaClaim, 3)}</td>
            </tr>`).join("")}
          </tbody>
        </table>` : `<p class="muted">目前篩選條件下，還沒有足夠資料計算 Layer 2 指標。</p>`}
    ` : ""}`;
}

function signed(value, digits = 3) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function completionStats(cases, metric) {
  const stepMap = new Map();
  cases.forEach(c => {
    getSteps(c).forEach(step => {
      if (!metricAllowsStep(step.id, metric)) return;
      const row = stepMap.get(step.id) || { id: step.id, label: step.label, total: 0, ready: 0, done: 0 };
      row.total += 1;
      if (step.ready) row.ready += 1;
      if (step.done) row.done += 1;
      stepMap.set(step.id, row);
    });
  });
  const stepRows = [...stepMap.values()];
  const total = stepRows.reduce((sum, row) => sum + row.total, 0);
  const done = stepRows.reduce((sum, row) => sum + row.done, 0);
  return {
    total,
    done,
    percent: total ? ((done / total) * 100).toFixed(1) : "0.0",
    stepRows,
  };
}

function renderCompletionTable(rows) {
  if (!rows.length) return `<p class="muted">目前沒有可統計的步驟。</p>`;
  return `<table>
    <thead><tr><th>步驟</th><th>已完成</th><th>可執行</th><th>案例數</th><th>完成率</th></tr></thead>
    <tbody>
      ${rows.map(row => `<tr>
        <td>${escapeHtml(row.label)}</td><td>${row.done}</td><td>${row.ready}</td><td>${row.total}</td><td>${row.total ? ((row.done / row.total) * 100).toFixed(1) : "0.0"}%</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function runConditionStats(cases, metric) {
  const map = new Map();
  cases.forEach(c => {
    runMetaList(c, metric).forEach(meta => {
      const key = `${meta.agent || "未記錄"}|${meta.ragMode || "none"}|${meta.label || "baseline"}`;
      const row = map.get(key) || { agent: meta.agent || "未記錄", ragMode: meta.ragMode || "none", label: meta.label || "baseline", count: 0, steps: new Set(), cases: new Set() };
      row.count += 1;
      row.steps.add(meta.stepLabel || meta.stepId);
      row.cases.add(c.id);
      map.set(key, row);
    });
  });
  return [...map.values()].map(row => ({ ...row, steps: [...row.steps], cases: [...row.cases] }));
}

function renderRunConditionTable(rows) {
  if (!rows.length) return `<p class="muted">尚未儲存任何含 agent/RAG metadata 的步驟；之後每次按「儲存並前進」都會自動記錄。</p>`;
  return `<table>
    <thead><tr><th>Agent</th><th>RAG</th><th>標籤</th><th>儲存步驟數</th><th>案例數</th><th>涉及步驟</th></tr></thead>
    <tbody>
      ${rows.map(row => `<tr>
        <td>${escapeHtml(row.agent)}</td><td>${escapeHtml(ragLabel(row.ragMode))}</td><td>${escapeHtml(row.label)}</td>
        <td>${row.count}</td><td>${row.cases.length}</td><td>${escapeHtml(row.steps.slice(0, 4).join("、"))}${row.steps.length > 4 ? ` 等 ${row.steps.length} 步` : ""}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function populateAnalysisFilters() {
  const agentSelect = document.getElementById("analysisAgentFilter");
  const ragSelect = document.getElementById("analysisRagFilter");
  const metricSelect = document.getElementById("analysisMetricSelect");
  const include = document.getElementById("analysisIncludeIncomplete");
  const selectedAgent = state.analysis?.agentFilter || agentSelect.value || "all";
  const selectedRag = state.analysis?.ragFilter || ragSelect.value || "all";
  const agents = [...new Set(state.cases.flatMap(c => Object.values(c.runMeta || {}).map(m => m.agent).filter(Boolean)))].sort();
  const rags = [...new Set(state.cases.flatMap(c => Object.values(c.runMeta || {}).map(m => m.ragMode || "none")))].sort();
  agentSelect.innerHTML = `<option value="all">全部 Agent</option>${agents.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("")}`;
  ragSelect.innerHTML = `<option value="all">全部 RAG</option>${rags.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(ragLabel(r))}</option>`).join("")}`;
  agentSelect.value = agents.includes(selectedAgent) ? selectedAgent : "all";
  ragSelect.value = rags.includes(selectedRag) ? selectedRag : "all";
  metricSelect.value = state.analysis?.metric || "all";
  include.checked = state.analysis?.includeIncomplete !== false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
}

function saveCurrentResponse() {
  const c = currentCase();
  if (!c) return;
  const step = getSteps(c).find(s => s.id === currentStepId);
  const status = document.getElementById("saveStatus");
  if (!step || !step.ready) {
    status.textContent = "前置資料尚未完成。";
    status.className = "status err";
    return;
  }
  const text = document.getElementById("responseInput").value.trim();
  if (!text && !step.auto) {
    status.textContent = "請先貼上 LLM 回應。";
    status.className = "status err";
    return;
  }
  try {
    const patch = step.save(text);
    const invalidatedRunMeta = Array.isArray(patch.__invalidateRunMeta) ? patch.__invalidateRunMeta : [];
    delete patch.__invalidateRunMeta;
    Object.assign(c.outputs, patch);
    const runControls = getRunControls();
    c.runMeta = c.runMeta || {};
    invalidatedRunMeta.forEach(stepId => {
      delete c.runMeta[stepId];
    });
    c.runMeta[step.id] = {
      stepId: step.id,
      stepLabel: step.label,
      kind: step.kind,
      agent: runControls.agent || defaultAgentForStep(step.id, c),
      ragMode: runControls.ragMode || defaultRagForStep(step.id),
      label: runControls.label || "baseline",
      note: runControls.note,
      savedAt: new Date().toISOString(),
    };
    c.experimentLabel = runControls.label || c.experimentLabel || "baseline";
    c.updatedAt = new Date().toISOString();
    let warning = "";
    if (step.id === "story_front") warning = wordWarning(c.outputs.story_front, "故事前半段");
    if (step.id === "story_back") warning = wordWarning(c.outputs.story_back, "故事後半段");
    const next = firstPendingStep(c);
    currentStepId = next?.id || step.id;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    render();
    status.textContent = warning || "已儲存，已切到下一個可執行步驟。";
    status.className = warning ? "status warn" : "status ok";
  } catch (err) {
    status.textContent = `儲存失敗：${err.message}`;
    status.className = "status err";
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bagua_web_llm_lab_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      renderData();
      renderAnalysis();
    };
  });
  document.getElementById("newCaseBtn").onclick = makeCase;
  document.getElementById("randomSeedBtn").onclick = applyRandomSeedToControls;
  document.getElementById("cloneCaseBtn").onclick = cloneCurrentCaseForExperiment;
  document.getElementById("deleteCaseBtn").onclick = () => {
    if (!currentCaseId) return;
    state.cases = state.cases.filter(c => c.id !== currentCaseId);
    currentCaseId = state.cases[0]?.id || null;
    currentStepId = firstPendingStep(currentCase())?.id || null;
    saveState();
  };
  document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.onclick = async () => {
      const el = document.getElementById(btn.dataset.copy);
      await navigator.clipboard.writeText(el.value);
      btn.textContent = "已複製";
      setTimeout(() => { btn.textContent = "複製"; }, 900);
    };
  });
  document.getElementById("saveResponseBtn").onclick = saveCurrentResponse;
  document.getElementById("clearResponseBtn").onclick = () => { document.getElementById("responseInput").value = ""; };
  document.getElementById("nextPendingBtn").onclick = () => {
    const c = currentCase();
    if (!c) return;
    const steps = getSteps(c).filter(s => s.ready && !s.done);
    const idx = steps.findIndex(s => s.id === currentStepId);
    currentStepId = steps[(idx + 1 + steps.length) % steps.length]?.id || firstPendingStep(c)?.id;
    render();
  };
  document.getElementById("prevPendingBtn").onclick = () => {
    const c = currentCase();
    if (!c) return;
    const steps = getSteps(c).filter(s => s.ready && !s.done);
    const idx = steps.findIndex(s => s.id === currentStepId);
    currentStepId = steps[(idx - 1 + steps.length) % steps.length]?.id || firstPendingStep(c)?.id;
    render();
  };
  document.getElementById("exportBtn").onclick = exportJson;
  document.getElementById("importInput").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    state = normalizeLoadedState(data.version ? data : { ...defaultState(), cases: data.cases || [] });
    currentCaseId = state.currentCaseId || state.cases[0]?.id || null;
    currentStepId = firstPendingStep(currentCase())?.id || null;
    saveState();
  };
  document.getElementById("resetAllBtn").onclick = () => {
    localStorage.removeItem(STORE_KEY);
    state = defaultState();
    currentCaseId = null;
    currentStepId = null;
    render();
  };
  document.getElementById("refreshAnalysisBtn").onclick = renderAnalysis;
  ["agentInput", "ragModeSelect", "runLabelInput", "runNoteInput"].forEach(id => {
    document.getElementById(id).oninput = () => {
      const c = currentCase();
      const step = currentStep(c);
      if (c && step) renderRunMetaPreview(c, step);
    };
  });
  ["analysisAgentFilter", "analysisRagFilter", "analysisMetricSelect", "analysisIncludeIncomplete"].forEach(id => {
    const el = document.getElementById(id);
    el.onchange = () => {
      state.analysis = {
        agentFilter: document.getElementById("analysisAgentFilter").value,
        ragFilter: document.getElementById("analysisRagFilter").value,
        metric: document.getElementById("analysisMetricSelect").value,
        includeIncomplete: document.getElementById("analysisIncludeIncomplete").checked,
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      renderAnalysis();
    };
  });
}

bindEvents();
render();
