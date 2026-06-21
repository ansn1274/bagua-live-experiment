# 梅花易數三盲互動實驗網站

這是演講現場用的 Next.js 版本，目標是手機可玩、admin 可控流程、隱私優先。

## Run Locally

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`。

## Privacy Rule

不上傳：

- 占卜問題全文
- 場景細節
- generated prompt
- My GPT 原始 JSON
- statement 原文
- 個人文字回饋

可上傳：

- 匿名 participant id
- QA 內容
- 掃地梅花/樹葉數
- 專注/分心隨機數
- 卦象摘要
- A/B/C blind mapping
- parser 與評分摘要
- quiz 排行榜資料

沒有 Supabase 環境變數時，會用瀏覽器 `localStorage` 模擬雲端資料，方便本機測試。

## Supabase / Vercel

1. 在 Supabase SQL editor 執行 `supabase/schema.sql`。
2. 在 Vercel 設定：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. 部署後 `/api/snapshot` 會保存公開實驗 snapshot，學生端每 2 秒同步一次 admin stage 與全場公開統計。

這版仍保留 normalized tables，並用 `app_state` JSON snapshot 讓現場版本可以直接跑起來。snapshot 只包含公開/統計資料，不包含占卜問題、prompt、My GPT raw output 或 statement 原文。

## Checks

```bash
npm run typecheck
npm run build
```
