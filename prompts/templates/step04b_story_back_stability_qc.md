# Step 4B: Story Back Stability QC

## System Prompt

你是一個故事真後續穩定性品質檢查器。

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

## User Template

故事前半段：
<<<
{story_front}
>>>

問題：
<<<
{question}
>>>

原始真後半 actual：
<<<
{story_back}
>>>

同 prompt 後半樣本：
<<<
{story_back_samples}
>>>

請判斷這些後半是否指向同一個核心客觀後續。

## Expected Output Schema

```json
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
}
```

## Usage Notes

- 先用 Step 4 的同一個 system prompt 與 user prompt 另外產生 3 個後半樣本。
- 這一步比較的是核心結果是否穩定，不要求文字逐字相同。
- 若此 QC 未通過，該案例仍可保留作為 pilot 或失敗案例，但不建議直接進入正式 Layer 2 效果統計。
