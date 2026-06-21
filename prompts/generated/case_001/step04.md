# Case case_001 — Step 4: Story Back Generation（故事後半段生成）

## 操作說明
1. 將下方「System Prompt」貼入 LLM 的 system prompt 欄位
2. 將「User Message」貼入對話框送出
3. 將 LLM 回應複製
4. 執行：`python tools/save_response.py case_001 4`
   然後貼入回應

---

## System Prompt

你正在參與一個八卦與 AI 敘事實驗。

本案例固定故事種子：
- 類別：人際
- 隨機元素：友情、戀愛、陌生人相遇
- 問題：關於這段人際互動，接下來整體狀態會如何發展？

共同規則：
1. 故事前半與後半都約 500 字，允許 450～550 字自然浮動。
2. 情節貼近日常，不要極端巧合或超自然事件。
3. 敘事要具體、自然、連貫，不要條列或摘要。
4. 除非使用者要求 JSON，否則只輸出任務要求的內容，不加標題、引言或說明。

---

## User Message

請接續上一則故事前半段，生成故事後半段。

---

## Expected Output Format

```text
純文字故事後半段。約 500 字，允許 450～550 字自然浮動。
```

---

## Save Path

回應儲存位置：`D:\projects\bagua\data\cases\case_001\story_back.txt`
