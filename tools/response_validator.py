"""
Response Validator for Bagua Experiment
梅花易數實驗回應驗證器

驗證並清理 LLM 回應，確保格式正確後再存檔。
處理常見的 LLM 輸出問題：markdown code fences、尾隨逗號、單引號等。
"""

import json
import re
from typing import Optional


# ===== 八卦代號 =====
TRIGRAM_CODES = ["qian", "dui", "li", "zhen", "xun", "kan", "gen", "kun"]
TRIGRAM_NAMES = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"]

# ===== 常見數字（Step 3 需避免）=====
COMMON_NUMBERS = {1, 7, 8, 10, 88, 99, 100, 168, 520, 777, 888, 999}

# ===== QC 指標（Step 10）=====
QC_METRICS = [
    "coherence", "difference", "naturalness", "style_similarity",
    "overdramatic", "mere_rewrite", "pass",
]


class ResponseValidator:
    """LLM 回應驗證器。"""

    def validate(self, step: int, response: str) -> dict:
        """
        驗證指定步驟的 LLM 回應。

        Args:
            step: 步驟編號 (1-14)
            response: LLM 的原始回應文字

        Returns:
            {
                "valid": bool,          # 是否通過驗證
                "data": parsed_data,    # 解析後的資料（純文字步驟為 str，JSON 步驟為 dict）
                "errors": [str],        # 錯誤訊息列表
                "warnings": [str],      # 警告訊息列表
                "cleaned_response": str # 清理後的回應文字
            }
        """
        errors = []
        warnings = []
        cleaned = response.strip()
        data = None

        # 根據步驟類型選擇驗證方法
        validators = {
            1: self._validate_step1,    # story_front (plain text)
            3: self._validate_step3,    # numbers (JSON)
            4: self._validate_step4,    # story_back (plain text)
            5: self._validate_step5,    # eval_1a (JSON)
            6: self._validate_step6,    # eval_1b (JSON)
            7: self._validate_step7,    # candidate_rank (JSON)
            8: self._validate_step8,    # hexagram_card (JSON)
            9: self._validate_step9,    # distractors (JSON)
            10: self._validate_step10,  # distractor_qc (JSON)
            11: self._validate_step11,  # eval_2a (JSON)
            12: self._validate_step12,  # claim_extract (JSON)
            13: self._validate_step13,  # claim_evidence (JSON)
            14: self._validate_step14,  # summary (plain text)
        }

        # 判斷是否為 JSON 步驟
        json_steps = {3, 5, 6, 7, 8, 9, 10, 11, 12, 13}

        if step in json_steps:
            cleaned = self._clean_json_response(cleaned)
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError as e:
                errors.append(f"JSON 解析失敗：{str(e)}")
                return {
                    "valid": False,
                    "data": None,
                    "errors": errors,
                    "warnings": warnings,
                    "cleaned_response": cleaned,
                }
        else:
            # 純文字步驟
            cleaned = self._clean_text_response(cleaned)
            data = cleaned

        # 執行步驟特定驗證
        if step in validators:
            step_errors, step_warnings = validators[step](data)
            errors.extend(step_errors)
            warnings.extend(step_warnings)

        return {
            "valid": len(errors) == 0,
            "data": data,
            "errors": errors,
            "warnings": warnings,
            "cleaned_response": cleaned if step not in json_steps else json.dumps(data, ensure_ascii=False, indent=2),
        }

    # ========== 通用清理 ==========

    def _clean_json_response(self, response: str) -> str:
        """
        清理 LLM 常見的 JSON 輸出問題。

        處理：
        1. Markdown code fences (```json ... ```)
        2. 前後多餘的文字
        3. 尾隨逗號
        4. 單引號→雙引號（僅在確認安全時）
        5. 中文全形符號
        """
        text = response.strip()

        # 1. 移除 markdown code fences
        # 匹配 ```json ... ``` 或 ``` ... ```
        fence_pattern = r'```(?:json|JSON)?\s*\n?(.*?)```'
        fence_match = re.search(fence_pattern, text, re.DOTALL)
        if fence_match:
            text = fence_match.group(1).strip()

        # 2. 嘗試找到 JSON 的起始和結束
        # 找第一個 { 或 [
        first_brace = -1
        for i, c in enumerate(text):
            if c in ('{', '['):
                first_brace = i
                break

        if first_brace > 0:
            text = text[first_brace:]

        # 找最後一個 } 或 ]
        last_brace = -1
        for i in range(len(text) - 1, -1, -1):
            if text[i] in ('}', ']'):
                last_brace = i
                break

        if last_brace >= 0 and last_brace < len(text) - 1:
            text = text[:last_brace + 1]

        # 3. 移除尾隨逗號（在 } 或 ] 之前的逗號）
        text = re.sub(r',\s*([}\]])', r'\1', text)

        # 4. 修復中文全形冒號和引號（出現在 key 中的情況）
        # 這比較危險，只在 JSON 無法解析時嘗試
        try:
            json.loads(text)
        except json.JSONDecodeError:
            # 嘗試替換全形符號
            text = text.replace('：', ':')
            text = text.replace('，', ',')
            text = text.replace('"', '"').replace('"', '"')
            text = text.replace(''', "'").replace(''', "'")

            # 嘗試單引號→雙引號（非常謹慎）
            try:
                json.loads(text)
            except json.JSONDecodeError:
                # 僅在整個結構使用單引號時替換
                if "'" in text and '"' not in text:
                    text = text.replace("'", '"')

        return text

    def _clean_text_response(self, response: str) -> str:
        """
        清理純文字回應。

        處理：
        1. 移除開頭的標題行（如 # 或 ##）
        2. 移除開頭的引言性文字（如「以下是故事前半段：」）
        3. 移除結尾的後設性文字
        """
        text = response.strip()

        # 移除開頭的 markdown 標題
        lines = text.split('\n')
        while lines and lines[0].strip().startswith('#'):
            lines.pop(0)
        text = '\n'.join(lines).strip()

        # 移除常見的引言性前綴
        prefixes_to_remove = [
            r'^以下是.*[：:]\s*',
            r'^故事[前後]半段[：:]\s*',
            r'^生成的故事[：:]\s*',
            r'^---+\s*',
        ]
        for pattern in prefixes_to_remove:
            text = re.sub(pattern, '', text, flags=re.MULTILINE).strip()

        # 移除結尾的後設性文字（如「以上是...」、「（字數：...）」）
        suffixes_to_remove = [
            r'\n+以上是.*$',
            r'\n+（字數[：:].*）\s*$',
            r'\n+---+\s*$',
            r'\n+\*字數.*\*\s*$',
        ]
        for pattern in suffixes_to_remove:
            text = re.sub(pattern, '', text, flags=re.MULTILINE).strip()

        return text

    # ========== 步驟驗證器 ==========

    def _validate_step1(self, data) -> tuple:
        """驗證 Step 1 故事前半段：純文字；長度只作參考。"""
        errors = []
        warnings = []

        if not isinstance(data, str) or not data:
            errors.append("故事前半段不可為空")
            return errors, warnings

        return errors, warnings

    def _validate_step3(self, data: dict) -> tuple:
        """驗證 Step 3 直覺數字：n1 和 n2 為 1-999 的整數。"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            errors.append("回應格式錯誤：應為 JSON 物件")
            return errors, warnings

        for key in ["n1", "n2"]:
            if key not in data:
                errors.append(f"缺少欄位：{key}")
                continue

            val = data[key]
            if not isinstance(val, (int, float)):
                errors.append(f"{key} 應為數字，實際為 {type(val).__name__}")
                continue

            val = int(val)
            data[key] = val  # 確保是整數

            if val < 1 or val > 999:
                errors.append(f"{key} 超出範圍：{val}（應為 1-999）")

            if val in COMMON_NUMBERS:
                warnings.append(f"{key} 使用了常見數字 {val}，建議避免")

        return errors, warnings

    def _validate_step4(self, data) -> tuple:
        """驗證 Step 4 故事後半段：純文字；長度只作參考。"""
        errors = []
        warnings = []

        if not isinstance(data, str) or not data:
            errors.append("故事後半段不可為空")
            return errors, warnings

        return errors, warnings

    def _validate_trigram_distribution(self, trigram_data: dict, label: str) -> tuple:
        """驗證八卦機率分佈：8 個值總和為 1.0。"""
        errors = []
        warnings = []

        if not isinstance(trigram_data, dict):
            errors.append(f"{label} 應為 JSON 物件")
            return errors, warnings

        if all(name in trigram_data for name in TRIGRAM_NAMES):
            keys = TRIGRAM_NAMES
        elif all(code in trigram_data for code in TRIGRAM_CODES):
            keys = TRIGRAM_CODES
            code_to_name = dict(zip(TRIGRAM_CODES, TRIGRAM_NAMES))
            for code, name in code_to_name.items():
                trigram_data[name] = trigram_data[code]
        else:
            keys = TRIGRAM_NAMES
            for name in TRIGRAM_NAMES:
                if name not in trigram_data:
                    errors.append(f"{label} 缺少八卦：{name}")

        # 檢查值的範圍
        values = []
        for key in keys:
            if key in trigram_data:
                val = trigram_data[key]
                if not isinstance(val, (int, float)):
                    errors.append(f"{label}.{key} 應為數字")
                    continue
                if val < 0 or val > 1:
                    errors.append(f"{label}.{key} 超出範圍：{val}（應為 0-1）")
                values.append(val)

        # 檢查總和
        if values:
            total = sum(values)
            if abs(total - 1.0) > 0.02:
                errors.append(f"{label} 總和為 {total:.4f}（應為 1.0，允許誤差 ±0.02）")
            elif abs(total - 1.0) > 0.01:
                warnings.append(f"{label} 總和為 {total:.4f}（略偏離 1.0）")

        # 檢查是否太平均
        if values and len(values) == 8:
            max_val = max(values)
            min_val = min(values)
            if max_val - min_val < 0.05:
                warnings.append(f"{label} 分佈過於平均（最大值 {max_val:.3f}，最小值 {min_val:.3f}）")

        return errors, warnings

    def _validate_step5(self, data: dict) -> tuple:
        """驗證 Step 5 Layer 1A：body_trigram 和 use_trigram。"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            errors.append("回應格式錯誤：應為 JSON 物件")
            return errors, warnings

        # 驗證 body_trigram
        if "body_trigram" not in data:
            errors.append("缺少 body_trigram")
        else:
            e, w = self._validate_trigram_distribution(data["body_trigram"], "body_trigram")
            errors.extend(e)
            warnings.extend(w)

        # 驗證 use_trigram
        if "use_trigram" not in data:
            errors.append("缺少 use_trigram")
        else:
            e, w = self._validate_trigram_distribution(data["use_trigram"], "use_trigram")
            errors.extend(e)
            warnings.extend(w)

        # brief_reason 可選但建議
        if "brief_reason" not in data:
            warnings.append("建議加入 brief_reason 欄位")

        return errors, warnings

    def _validate_step6(self, data: dict) -> tuple:
        """驗證 Step 6 Layer 1B：與 Step 5 相同格式。"""
        return self._validate_step5(data)

    def _validate_step7(self, data: dict) -> tuple:
        """驗證 Step 7 候選排名：scores + ranking。"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            errors.append("回應格式錯誤：應為 JSON 物件")
            return errors, warnings

        # 驗證 scores
        if "scores" not in data:
            errors.append("缺少 scores 陣列")
        else:
            scores = data["scores"]
            if not isinstance(scores, list):
                errors.append("scores 應為陣列")
            elif len(scores) != 6:
                errors.append(f"scores 應有 6 個元素，實際有 {len(scores)} 個")
            else:
                score_values = []
                for item in scores:
                    cid = item.get("candidate_id", "?")
                    score = item.get("score")
                    if score is None:
                        errors.append(f"候選 {cid} 缺少 score")
                    elif not isinstance(score, (int, float)):
                        errors.append(f"候選 {cid} 的 score 應為數字")
                    elif score < 0 or score > 100:
                        errors.append(f"候選 {cid} 的 score 超出範圍：{score}（應為 0-100）")
                    else:
                        score_values.append(score)

                # 檢查區分度
                if score_values:
                    max_s = max(score_values)
                    min_s = min(score_values)
                    if max_s - min_s < 15:
                        warnings.append(f"分數區分度不足：最高 {max_s}，最低 {min_s}（建議至少相差 15）")

        # 驗證 ranking
        if "ranking" not in data:
            errors.append("缺少 ranking 陣列")
        elif not isinstance(data["ranking"], list):
            errors.append("ranking 應為陣列")
        elif len(data["ranking"]) != 6:
            errors.append(f"ranking 應有 6 個元素，實際有 {len(data['ranking'])} 個")

        return errors, warnings

    def _validate_step8(self, data: dict) -> tuple:
        """驗證 Step 8 解卦卡：8 個欄位。"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            errors.append("回應格式錯誤：應為 JSON 物件")
            return errors, warnings

        card = data.get("reading_card", data)

        required_fields = [
            "本卦主調", "體用關係", "主要優勢", "主要風險",
            "動爻警訊", "變卦結果", "過程壓力／互卦", "行動建議",
        ]

        total_chars = 0
        for field in required_fields:
            if field not in card:
                # 嘗試替代名稱（過程壓力的斜線可能不同）
                alt_field = field.replace("／", "/")
                if alt_field in card:
                    card[field] = card.pop(alt_field)
                else:
                    errors.append(f"缺少欄位：{field}")
                    continue

            text = card[field]
            if not isinstance(text, str):
                errors.append(f"欄位 {field} 應為文字")
                continue

            char_count = len(text)
            total_chars += char_count

            if field == "行動建議":
                if char_count < 30:
                    warnings.append(f"欄位 {field} 太短：{char_count} 字（建議 50-80 字）")
                elif char_count > 120:
                    warnings.append(f"欄位 {field} 太長：{char_count} 字（建議 50-80 字）")
            else:
                if char_count < 20:
                    warnings.append(f"欄位 {field} 太短：{char_count} 字（建議 40-70 字）")
                elif char_count > 100:
                    warnings.append(f"欄位 {field} 太長：{char_count} 字（建議 40-70 字）")

        # 檢查總字數
        if total_chars > 0:
            if total_chars < 350:
                warnings.append(f"解卦卡總字數偏短：{total_chars} 字（建議 400-550 字）")
            elif total_chars > 650:
                warnings.append(f"解卦卡總字數偏長：{total_chars} 字（建議 400-550 字）")

        return errors, warnings

    def _validate_step9(self, data: dict) -> tuple:
        """驗證 Step 9 干擾項：4 個干擾項。"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            errors.append("回應格式錯誤：應為 JSON 物件")
            return errors, warnings

        if "distractors" not in data:
            errors.append("缺少 distractors 陣列")
            return errors, warnings

        distractors = data["distractors"]
        if not isinstance(distractors, list):
            errors.append("distractors 應為陣列")
            return errors, warnings

        if len(distractors) != 4:
            errors.append(f"distractors 應有 4 個元素，實際有 {len(distractors)} 個")

        for item in distractors:
            did = item.get("id", "?")
            text = item.get("text", "")

            if not text:
                errors.append(f"干擾項 {did} 文字為空")
                continue

            char_count = len(text)
            if char_count < 350:
                errors.append(f"干擾項 {did} 太短：{char_count} 字（目標約 500 字）")
            elif char_count < 450:
                warnings.append(f"干擾項 {did} 稍短：{char_count} 字（建議 450-550 字）")

            if char_count > 700:
                errors.append(f"干擾項 {did} 太長：{char_count} 字（目標約 500 字）")
            elif char_count > 550:
                warnings.append(f"干擾項 {did} 稍長：{char_count} 字（建議 450-550 字）")

        return errors, warnings

    def _validate_step10(self, data: dict) -> tuple:
        """驗證 Step 10 干擾項品質檢查。"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            errors.append("回應格式錯誤：應為 JSON 物件")
            return errors, warnings

        if "qc_results" not in data:
            errors.append("缺少 qc_results 陣列")
            return errors, warnings

        qc_results = data["qc_results"]
        if not isinstance(qc_results, list):
            errors.append("qc_results 應為陣列")
            return errors, warnings

        if len(qc_results) != 4:
            errors.append(f"qc_results 應有 4 個元素，實際有 {len(qc_results)} 個")

        for item in qc_results:
            did = item.get("id", "?")
            for metric in ["coherence", "difference", "naturalness", "style_similarity"]:
                if metric not in item:
                    errors.append(f"干擾項 {did} 缺少指標：{metric}")
                elif not isinstance(item[metric], (int, float)) or not 1 <= item[metric] <= 5:
                    errors.append(f"干擾項 {did} 的 {metric} 應為 1-5 分")
            for metric in ["overdramatic", "mere_rewrite", "pass"]:
                if metric not in item:
                    errors.append(f"干擾項 {did} 缺少指標：{metric}")
                elif not isinstance(item[metric], bool):
                    errors.append(f"干擾項 {did} 的 {metric} 應為布林值")

        if "all_pass" not in data:
            warnings.append("缺少 all_pass 欄位")
        elif not isinstance(data["all_pass"], bool):
            errors.append("all_pass 應為布林值")

        return errors, warnings

    def _validate_step11(self, data: dict) -> tuple:
        """驗證 Step 11 Layer 2A 故事後續辨認。"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            errors.append("回應格式錯誤：應為 JSON 物件")
            return errors, warnings

        if "scores" not in data:
            errors.append("缺少 scores 陣列")
        else:
            scores = data["scores"]
            if not isinstance(scores, list):
                errors.append("scores 應為陣列")
            elif len(scores) != 5:
                errors.append(f"scores 應有 5 個元素，實際有 {len(scores)} 個")
            else:
                score_values = []
                for item in scores:
                    sid = item.get("story_id", item.get("candidate_id", "?"))
                    score = item.get("score")
                    if score is None:
                        errors.append(f"故事 {sid} 缺少 score")
                    elif not isinstance(score, (int, float)):
                        errors.append(f"故事 {sid} 的 score 應為數字")
                    elif score < 0 or score > 100:
                        errors.append(f"故事 {sid} 的 score 超出範圍：{score}")
                    else:
                        score_values.append(score)

                if score_values:
                    max_s = max(score_values)
                    min_s = min(score_values)
                    if max_s - min_s < 15:
                        warnings.append(f"分數區分度不足：最高 {max_s}，最低 {min_s}")

        if "ranking" not in data:
            errors.append("缺少 ranking 陣列")
        elif not isinstance(data["ranking"], list):
            errors.append("ranking 應為陣列")
        elif len(data["ranking"]) != 5:
            errors.append(f"ranking 應有 5 個元素，實際有 {len(data['ranking'])} 個")

        return errors, warnings

    def _validate_step12(self, data: dict) -> tuple:
        """驗證 Step 12 Claim 拆解。"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            errors.append("回應格式錯誤：應為 JSON 物件")
            return errors, warnings

        if "claims" not in data:
            errors.append("缺少 claims 陣列")
            return errors, warnings

        claims = data["claims"]
        if not isinstance(claims, list):
            errors.append("claims 應為陣列")
            return errors, warnings

        if len(claims) < 6:
            errors.append(f"claims 數量不足：{len(claims)} 個（至少 6 個）")
        elif len(claims) > 12:
            warnings.append(f"claims 數量較多：{len(claims)} 個（建議 6-12 個）")

        valid_types = {
            "主體狀態", "作用力狀態", "核心風險", "過程壓力", "後續變化", "行動建議",
            "客體狀態", "互動關係", "發展走向", "風險警告", "行動指引",
        }

        for i, claim in enumerate(claims):
            ctype = claim.get("claim_type", "")
            ctext = claim.get("claim", "")

            if ctype not in valid_types:
                warnings.append(f"Claim {i+1} 的 claim_type 不在預設類型中：{ctype}")

            if not ctext:
                errors.append(f"Claim {i+1} 的 claim 文字為空")
            else:
                char_count = len(ctext)
                if char_count < 10:
                    warnings.append(f"Claim {i+1} 太短：{char_count} 字（建議 20-50 字）")
                elif char_count > 80:
                    warnings.append(f"Claim {i+1} 太長：{char_count} 字（建議 20-50 字）")

        return errors, warnings

    def _validate_step13(self, data: dict) -> tuple:
        """驗證 Step 13 Claim 證據評分。"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            errors.append("回應格式錯誤：應為 JSON 物件")
            return errors, warnings

        if "claim_scores" not in data:
            errors.append("缺少 claim_scores 陣列")
            return errors, warnings

        claim_scores = data["claim_scores"]
        if not isinstance(claim_scores, list):
            errors.append("claim_scores 應為陣列")
            return errors, warnings

        valid_scores = {-2, -1, 0, 1, 2}
        score_sum = 0
        score_count = 0

        for i, item in enumerate(claim_scores):
            score = item.get("score")
            if score is None:
                errors.append(f"Claim {i+1} 缺少 score")
            elif score not in valid_scores and not isinstance(score, float):
                # 允許浮點數（某些 LLM 可能輸出 1.0 而非 1）
                int_score = int(score) if isinstance(score, float) else None
                if int_score not in valid_scores:
                    errors.append(f"Claim {i+1} 的 score 無效：{score}（應為 -2, -1, 0, 1, 2）")
                else:
                    item["score"] = int_score
                    score_sum += int_score
                    score_count += 1
            else:
                score_sum += score
                score_count += 1

            evidence = item.get("evidence", "")
            if not evidence:
                warnings.append(f"Claim {i+1} 缺少 evidence")

        # 驗證 mean_score
        if "mean_score" not in data:
            if score_count > 0:
                data["mean_score"] = round(score_sum / score_count, 2)
                warnings.append(f"自動計算 mean_score = {data['mean_score']}")
            else:
                errors.append("缺少 mean_score 且無法自動計算")
        else:
            if score_count > 0:
                expected_mean = round(score_sum / score_count, 2)
                actual_mean = data["mean_score"]
                if abs(actual_mean - expected_mean) > 0.1:
                    warnings.append(
                        f"mean_score ({actual_mean}) 與計算值 ({expected_mean}) 不一致"
                    )

        return errors, warnings

    def _validate_step14(self, data) -> tuple:
        """驗證 Step 14 實驗摘要：純文字，有基本結構。"""
        errors = []
        warnings = []

        if not isinstance(data, str) or not data:
            errors.append("摘要不可為空")
            return errors, warnings

        # 檢查是否包含關鍵區塊
        expected_sections = ["Layer 1", "Layer 2"]
        for section in expected_sections:
            if section not in data:
                warnings.append(f"摘要中未找到 '{section}' 區塊")

        if len(data) < 200:
            warnings.append(f"摘要可能太短：{len(data)} 字")

        return errors, warnings


# ===== CLI 入口 =====

def main():
    """命令列介面：驗證 LLM 回應。"""
    import sys

    usage = """
梅花易數實驗回應驗證器

用法：
  python tools/response_validator.py <step> <response_file>  — 驗證回應檔案
  python tools/response_validator.py <step>                  — 從 stdin 讀取回應
"""

    if len(sys.argv) < 2:
        print(usage)
        return

    step = int(sys.argv[1])

    if len(sys.argv) >= 3:
        # 從檔案讀取
        filepath = sys.argv[2]
        with open(filepath, "r", encoding="utf-8") as f:
            response = f.read()
    else:
        # 從 stdin 讀取
        print("請貼入 LLM 回應（Ctrl+Z 或 Ctrl+D 結束）：")
        response = sys.stdin.read()

    validator = ResponseValidator()
    result = validator.validate(step, response)

    # 輸出結果
    print(f"\n=== Step {step} 驗證結果 ===\n")

    if result["valid"]:
        print("[OK] 驗證通過")
    else:
        print("[FAIL] 驗證失敗")

    if result["errors"]:
        print("\n錯誤：")
        for error in result["errors"]:
            print(f"  [ERR] {error}")

    if result["warnings"]:
        print("\n警告：")
        for warning in result["warnings"]:
            print(f"  [WARN] {warning}")

    # 輸出清理後的回應
    print(f"\n清理後的回應：")
    cleaned = result["cleaned_response"]
    if len(cleaned) > 500:
        print(cleaned[:500] + "\n... (截斷)")
    else:
        print(cleaned)


if __name__ == "__main__":
    main()
