# Case case_001 — Step 3: Intuitive Number Generation（直覺數字生成）

## 操作說明
1. 將下方「System Prompt」貼入 LLM 的 system prompt 欄位
2. 將「User Message」貼入對話框送出
3. 將 LLM 回應複製
4. 執行：`python tools/save_response.py case_001 3`
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

請根據上一則故事前半段與本案例問題，憑直覺輸出兩個 1～999 的正整數；只輸出 JSON：{"n1":0,"n2":0}

---

## Expected Output Format

```json
{
  "n1": 347,
  "n2": 512
}
```

---

## Save Path

回應儲存位置：`D:\projects\bagua\data\cases\case_001\numbers.json`
