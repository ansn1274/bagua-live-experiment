# 梅花易數實驗系統 — Bagua Experiment

AI 直覺取數與梅花易數解卦有效性實驗系統。

## 研究架構

### Layer 1：取數生成有效性
檢驗 AI 直覺取數是否含有 context/question 訊息。

- **Layer 1A**：僅看 story_front + question → 體用分數表 + 六候選排序
- **Layer 1B**：加入 actual_story_back → 事後可重建性測試

### Layer 2：解卦分析有效性
檢驗真卦解讀是否比程式隨機卦更能辨認實際後續。

- **Layer 2A**：解卦卡 + 5 個候選後續排序（MRR、pairwise win rate、Top-1）
- **Layer 2B**：Claim evidence 輔助分析

## 使用流程

### 1. 初始化批次
```bash
python scripts/init_batch.py --n_cases 50 --k_random 3
```

### 2. 匯出 Prompt
```bash
python scripts/export_prompts.py
```

### 3. 手動執行 LLM
將 `prompts/generated/` 中的 prompt 貼入 Web LLM，取得回應。

### 4. 儲存回應
```bash
python scripts/save_response.py <case_id> <step_num>
```

### 5. 重複 2-4
依序完成所有 step。

### 6. 執行分析
```bash
python scripts/run_analysis.py
```

### 7. 檢視結果
開啟 `ui/index.html`，載入分析結果 JSON。

## 專案結構

```
bagua/
├── config/                 # 設定檔
│   ├── trigrams.json       # 八卦對照表
│   ├── hexagrams.json      # 六十四卦資料
│   └── categories.json     # 故事類別與元素
├── references/             # 易經參考資料（使用者放入）
├── prompts/
│   ├── templates/          # 14 個 step 的 prompt 模板
│   └── generated/          # 動態生成的完整 prompt
├── tools/                  # 核心工具
│   ├── meihua_calc.py      # 梅花易數計算
│   ├── random_hexagram.py  # 隨機卦生成
│   ├── prompt_generator.py # Prompt 組裝器
│   ├── response_validator.py # 回應驗證器
│   ├── layer1_analysis.py  # Layer 1 分析
│   ├── layer2_analysis.py  # Layer 2 分析
│   └── stats.py            # 統計檢定
├── data/
│   ├── cases/              # 每個 case 的原始資料
│   └── summary/            # 批次統計摘要
├── scripts/                # 輔助腳本
│   ├── init_batch.py       # 初始化批次
│   ├── export_prompts.py   # 匯出 prompt
│   ├── save_response.py    # 儲存回應
│   └── run_analysis.py     # 執行分析
├── ui/                     # 視覺化 Dashboard
│   ├── index.html
│   ├── index.css
│   └── index.js
└── tests/                  # 單元測試
```

## 實驗步驟對照表

| Step | 名稱 | 類型 | 輸入 | 輸出 |
|------|------|------|------|------|
| 1 | 故事前文生成 | LLM | category, elements | story_front |
| 2 | 問題生成 | Code | category | question |
| 3 | 直覺取數 | LLM | story_front, question | n1, n2 |
| 4 | 故事後續生成 | LLM | story_front | actual_story_back |
| 5 | Layer 1A 評估 | LLM | story_front, question | 體用分數表 |
| 6 | Layer 1B 評估 | LLM | story_front, question, story_back | 體用分數表 |
| 7 | 六候選排序 | LLM | story_front, question, candidates | 排序 |
| 8 | 解卦卡生成 | LLM | story_front, question, gua_data | reading_card |
| 9 | Distractor 生成 | LLM | story_front, story_back | 4 distractors |
| 10 | Distractor QC | LLM | story_front, story_back, distractors | QC 結果 |
| 11 | Layer 2A 排序 | LLM | story_front, question, card, candidates | 排序 |
| 12 | Claim 拆解 | LLM | reading_card | 6 claims |
| 13 | Claim 評分 | LLM | story, claims | evidence scores |
| 14 | 結果摘要 | LLM | statistical_results | 摘要 |

## 環境需求

- Python 3.9+
- 無額外套件依賴（純 Python 實作）
