"""
Prompt Generator for Bagua Experiment
梅花易數實驗提示詞生成器

根據模板和案例數據，生成可直接複製貼上的提示詞。
每個生成的提示詞是一個 markdown 檔案，包含：
1. 標頭（步驟資訊與案例 ID）
2. System Prompt 區塊（貼入 system prompt 欄位）
3. User Message 區塊（貼入對話框送出）
4. Expected Output 區塊（預期輸出格式）
5. 儲存指示（回應存放路徑）
"""

import json
import os
import re
from pathlib import Path
from typing import Optional

# ===== 路徑設定 =====
BASE_DIR = Path(__file__).parent.parent
TEMPLATE_DIR = BASE_DIR / "prompts" / "templates"
GENERATED_DIR = BASE_DIR / "prompts" / "generated"
DATA_DIR = BASE_DIR / "data" / "cases"
CONFIG_DIR = BASE_DIR / "config"
REFERENCE_DIR = BASE_DIR / "data" / "reference"


# ===== 步驟名稱 =====
STEP_NAMES = {
    1: "Story Front Generation（故事前半段生成）",
    2: "Question Generation（問題生成）",
    3: "Intuitive Number Generation（直覺數字生成）",
    4: "Story Back Generation（故事後半段生成）",
    5: "Layer 1A — Body/Use Scoring（體用評分·僅前半段）",
    6: "Layer 1B — Body/Use Scoring（體用評分·含後半段）",
    7: "Six Candidate Ranking（六候選卦象排名）",
    8: "Reading Card Generation（解卦卡生成）",
    9: "Hard Distractor Generation（干擾項生成）",
    10: "Distractor Quality Control（干擾項品質檢查）",
    11: "Layer 2A — Story Back Recognition（故事後續辨認）",
    12: "Claim Extraction（Claim 拆解）",
    13: "Claim Evidence Scoring（Claim 證據評分）",
    14: "Experiment Summary（實驗結果摘要）",
}

# ===== 步驟模板檔案對應 =====
STEP_TEMPLATE_FILES = {
    1: "step01_story_gen.md",
    2: "step02_question_gen.md",
    3: "step03_number_pick.md",
    4: "step04_story_back.md",
    5: "step05_eval_1a.md",
    6: "step06_eval_1b.md",
    7: "step07_candidate_rank.md",
    8: "step08_hexagram_card.md",
    9: "step09_distractor_gen.md",
    10: "step10_distractor_qc.md",
    11: "step11_eval_2a.md",
    12: "step12_claim_extract.md",
    13: "step13_claim_evidence.md",
    14: "step14_summary.md",
}

# ===== 步驟依賴關係 =====
STEP_DEPENDENCIES = {
    1: [],                      # story_gen: 需要 category + elements（初始化時提供）
    2: [1],                     # question_gen: 需要 category（程式碼處理，不需 LLM）
    3: [1, 2],                  # number_pick: 需要 story_front + question
    4: [1],                     # story_back: 需要 story_front
    5: [1, 2],                  # eval_1a: 需要 story_front + question
    6: [1, 2, 4],               # eval_1b: 需要 story_front + question + story_back
    7: [1, 2, 3],               # candidate_rank: 需要 story_front + question + 卦象計算
    8: [1, 2, 3],               # hexagram_card: 需要 story_front + question + gua_data + book_entry
    9: [1, 4],                  # distractor_gen: 需要 story_front + story_back
    10: [1, 4, 9],              # distractor_qc: 需要 story_front + story_back + distractors
    11: [1, 2, 8, 9, 10],       # eval_2a: 需要 story + question + card + distractors (QC 通過)
    12: [8],                    # claim_extract: 需要 reading_card
    13: [1, 2, 4, 12],          # claim_evidence: 需要 story + question + story_back + claims
    14: [],                     # summary: 需要跨 case 統計（獨立執行）
}

# ===== 步驟輸出檔案 =====
STEP_OUTPUTS = {
    1: "story_front.txt",
    2: "question.txt",
    3: "numbers.json",
    4: "story_back.txt",
    5: "eval_1a.json",
    6: "eval_1b.json",
    7: "candidate_rank.json",       # 也可能有 candidate_rank_1b.json
    8: "card_true.json",            # 也可能有 card_random_1.json 等
    9: "distractors.json",
    10: "distractor_qc.json",
    11: "eval_2a_true.json",        # 也可能有 eval_2a_random_1.json 等
    12: "claims_true.json",         # 也可能有 claims_random_1.json 等
    13: "claim_evidence_true.json", # 也可能有 claim_evidence_random_1.json 等
    14: None,                       # summary 是全域的，存在 data/analysis/
}

# ===== 類別→問題對應 =====
CATEGORY_QUESTIONS = {
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
}


def get_question(category: str) -> str:
    """根據類別取得對應問題。"""
    if category in CATEGORY_QUESTIONS:
        return CATEGORY_QUESTIONS[category]
    return f"關於這個「{category}」情境，接下來整體狀態會如何發展？"


class PromptGenerator:
    """梅花易數實驗提示詞生成器。"""

    def __init__(self):
        self.templates = self._load_templates()

    # ========== 載入模板 ==========

    def _load_templates(self) -> dict:
        """載入所有模板檔案，回傳 {step_num: template_content} 字典。"""
        templates = {}
        for step_num, filename in STEP_TEMPLATE_FILES.items():
            filepath = TEMPLATE_DIR / filename
            if filepath.exists():
                templates[step_num] = filepath.read_text(encoding="utf-8")
            else:
                print(f"[警告] 模板檔案不存在：{filepath}")
        return templates

    def _parse_template(self, template_content: str) -> dict:
        """
        解析模板內容，提取 System Prompt 和 User Template 區塊。

        回傳 dict:
        {
            "system_prompt": str,
            "user_template": str,
            "expected_output": str,
        }
        """
        sections = {}
        current_section = None
        current_lines = []

        for line in template_content.split("\n"):
            # 偵測 ## 級標題作為區塊分隔
            if line.startswith("## System Prompt"):
                if current_section:
                    sections[current_section] = "\n".join(current_lines).strip()
                current_section = "system_prompt"
                current_lines = []
            elif line.startswith("## User Template"):
                if current_section:
                    sections[current_section] = "\n".join(current_lines).strip()
                current_section = "user_template"
                current_lines = []
            elif line.startswith("## User Template — Template A"):
                if current_section:
                    sections[current_section] = "\n".join(current_lines).strip()
                current_section = "user_template_a"
                current_lines = []
            elif line.startswith("## User Template — Template B"):
                if current_section:
                    sections[current_section] = "\n".join(current_lines).strip()
                current_section = "user_template_b"
                current_lines = []
            elif line.startswith("## Expected Output Schema") or line.startswith("## Expected Output"):
                if current_section:
                    sections[current_section] = "\n".join(current_lines).strip()
                current_section = "expected_output"
                current_lines = []
            elif line.startswith("## Usage Notes"):
                if current_section:
                    sections[current_section] = "\n".join(current_lines).strip()
                current_section = "usage_notes"
                current_lines = []
            elif line.startswith("## Category"):
                if current_section:
                    sections[current_section] = "\n".join(current_lines).strip()
                current_section = "category_mapping"
                current_lines = []
            elif line.startswith("## Implementation"):
                if current_section:
                    sections[current_section] = "\n".join(current_lines).strip()
                current_section = "implementation"
                current_lines = []
            else:
                current_lines.append(line)

        # 最後一個區塊
        if current_section:
            sections[current_section] = "\n".join(current_lines).strip()

        return sections

    # ========== 載入案例數據 ==========

    def _get_case_dir(self, case_id: str) -> Path:
        """取得案例資料目錄。"""
        # 支援 case_id 為 "001" 或 "case_001"
        if case_id.startswith("case_"):
            return DATA_DIR / case_id
        return DATA_DIR / f"case_{case_id}"

    def _load_case_file(self, case_id: str, filename: str) -> Optional[str]:
        """載入案例中的檔案內容，不存在則回傳 None。"""
        filepath = self._get_case_dir(case_id) / filename
        if filepath.exists():
            return filepath.read_text(encoding="utf-8").strip()
        return None

    def _load_case_json(self, case_id: str, filename: str) -> Optional[dict]:
        """載入案例中的 JSON 檔案，不存在則回傳 None。"""
        content = self._load_case_file(case_id, filename)
        if content:
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                print(f"[警告] JSON 解析失敗：{filename}")
        return None

    def _load_case_init(self, case_id: str) -> Optional[dict]:
        """載入案例初始化資料（category, story_elements 等）。"""
        # 優先載入 meta.json（init_batch.py 產生），向後相容 init.json
        data = self._load_case_json(case_id, "meta.json")
        if data is None:
            data = self._load_case_json(case_id, "init.json")
        return data

    # ========== 依賴關係檢查 ==========

    def _check_dependencies(self, case_id: str, step: int) -> bool:
        """檢查指定步驟的所有前置依賴是否已完成。"""
        deps = STEP_DEPENDENCIES.get(step, [])
        for dep_step in deps:
            output_file = STEP_OUTPUTS.get(dep_step)
            if output_file is None:
                continue
            filepath = self._get_case_dir(case_id) / output_file
            if not filepath.exists():
                return False
        return True

    def _get_missing_dependencies(self, case_id: str, step: int) -> list:
        """取得指定步驟缺少的前置依賴。"""
        missing = []
        deps = STEP_DEPENDENCIES.get(step, [])
        for dep_step in deps:
            output_file = STEP_OUTPUTS.get(dep_step)
            if output_file is None:
                continue
            filepath = self._get_case_dir(case_id) / output_file
            if not filepath.exists():
                missing.append((dep_step, STEP_NAMES.get(dep_step, f"Step {dep_step}"), output_file))
        return missing

    def get_next_steps(self, case_id: str) -> list:
        """
        檢查案例已有的數據，回傳所有可執行的下一步驟列表。

        回傳 [(step_num, step_name)] 的列表。
        """
        available = []
        for step in range(1, 15):
            output_file = STEP_OUTPUTS.get(step)
            # 如果輸出已存在，跳過（除了 step 14 無固定輸出）
            if output_file:
                filepath = self._get_case_dir(case_id) / output_file
                if filepath.exists():
                    continue
            # 檢查依賴
            if self._check_dependencies(case_id, step):
                available.append((step, STEP_NAMES[step]))
        return available

    # ========== 變數填充 ==========

    def _fill_template(self, template: str, variables: dict) -> str:
        """將模板中的 {variable} 佔位符替換為實際值。"""
        result = template
        for key, value in variables.items():
            placeholder = "{" + key + "}"
            if placeholder in result:
                if isinstance(value, (list, tuple)):
                    value_text = "、".join(str(item) for item in value)
                else:
                    value_text = str(value)
                result = result.replace(placeholder, value_text)
        return result

    def _collect_variables(self, case_id: str, step: int, variant: str = None) -> dict:
        """收集指定步驟所需的所有變數。"""
        variables = {}

        # 載入初始化資料
        init_data = self._load_case_init(case_id)
        if init_data:
            variables["category"] = init_data.get("category", "")
            variables["story_elements"] = init_data.get("story_elements", "")
            variables["question"] = get_question(variables["category"])

        # 載入 story_front
        story_front = self._load_case_file(case_id, "story_front.txt")
        if story_front:
            variables["story_front"] = story_front

        # 載入 question
        question = self._load_case_file(case_id, "question.txt")
        if question:
            variables["question"] = question

        # 載入 story_back
        story_back = self._load_case_file(case_id, "story_back.txt")
        if story_back:
            variables["story_back"] = story_back

        # 載入 numbers
        numbers = self._load_case_json(case_id, "numbers.json")
        if numbers:
            variables["n1"] = numbers.get("n1", "")
            variables["n2"] = numbers.get("n2", "")

        # 載入卦象資料（Step 7, 8 需要）。Step 8 的 random_N variant 使用隨機卦。
        gua_data = None
        if step == 8 and variant and variant.startswith("random_"):
            randoms = self._load_case_json(case_id, "random_hexagrams.json")
            try:
                idx = int(variant.split("_", 1)[1]) - 1
            except (IndexError, ValueError):
                idx = -1
            if isinstance(randoms, list) and 0 <= idx < len(randoms):
                gua_data = randoms[idx]
        if gua_data is None:
            gua_data = self._load_case_json(case_id, "hexagram.json")
        if gua_data is None:
            gua_data = self._load_case_json(case_id, "gua_data.json")
        if gua_data:
            variables.update(self._flatten_gua_data(gua_data))

        # 載入候選卦象（Step 7 需要）
        candidates = self._load_case_json(case_id, "candidates.json")
        if candidates:
            variables["candidates_text"] = self._format_candidates(candidates)

        # 載入解卦卡（Step 11, 12 需要）
        card_filename = "card_true.json"
        if variant and variant.startswith("random_"):
            card_filename = f"card_{variant}.json"
        card_data = self._load_case_json(case_id, card_filename)
        if card_data:
            variables["reading_card_text"] = self._format_reading_card(card_data)

        # 載入干擾項（Step 10, 11 需要）
        distractors = self._load_case_json(case_id, "distractors.json")
        if distractors:
            variables["distractors_text"] = self._format_distractors(distractors)

        # 載入故事後續集合（Step 11 需要）
        if step == 11 and story_back and distractors:
            variables["story_backs_text"] = self._format_story_backs(
                case_id, story_back, distractors
            )

        # 載入 claims（Step 13 需要）
        claims_filename = "claims_true.json"
        if variant and variant.startswith("random_"):
            claims_filename = f"claims_{variant}.json"
        claims = self._load_case_json(case_id, claims_filename)
        if claims:
            variables["claims_text"] = self._format_claims(claims)

        # 載入書籍參考（Step 8 需要）
        if step == 8 and gua_data:
            book_ref = self._load_book_reference(gua_data)
            if book_ref:
                variables["book_reference"] = book_ref

        return variables

    def _flatten_gua_data(self, gua_data: dict) -> dict:
        """將卦象資料展平為模板變數。"""
        upper = gua_data.get("upper_trigram_name", "")
        lower = gua_data.get("lower_trigram_name", "")
        changed_use = gua_data.get("changed_use_trigram_name", "")
        mutual_upper = gua_data.get("mutual_upper_trigram_name", "")
        mutual_lower = gua_data.get("mutual_lower_trigram_name", "")

        flat = {
            "ben_gua_name": gua_data.get("ben_gua_name", gua_data.get("hexagram_name", "")),
            "ben_gua_detail": gua_data.get("ben_gua_detail", f"{upper}上{lower}下" if upper and lower else ""),
            "bian_gua_name": gua_data.get("bian_gua_name", gua_data.get("changed_hexagram_name", "")),
            "bian_gua_detail": gua_data.get("bian_gua_detail", f"用卦變為{changed_use}" if changed_use else ""),
            "hu_gua_name": gua_data.get("hu_gua_name", gua_data.get("mutual_hexagram_name", "")),
            "hu_gua_detail": gua_data.get("hu_gua_detail", f"{mutual_upper}上{mutual_lower}下" if mutual_upper and mutual_lower else ""),
            "ti_gua": gua_data.get("ti_gua", gua_data.get("body_trigram_name", "")),
            "yong_gua": gua_data.get("yong_gua", gua_data.get("use_trigram_name", "")),
            "ti_wuxing": gua_data.get("ti_wuxing", gua_data.get("body_element", "")),
            "yong_wuxing": gua_data.get("yong_wuxing", gua_data.get("use_element", "")),
            "ti_yong_relation": gua_data.get("ti_yong_relation", gua_data.get("element_relation", "")),
            "dong_yao": gua_data.get("dong_yao", gua_data.get("moving_line", "")),
            "dong_yao_ci": gua_data.get("dong_yao_ci", "（未提供爻辭，請僅根據卦象結構與已提供資料保守解讀。）"),
        }
        mapping = {
            "ben_gua_name": "ben_gua_name",
            "ben_gua_detail": "ben_gua_detail",
            "bian_gua_name": "bian_gua_name",
            "bian_gua_detail": "bian_gua_detail",
            "hu_gua_name": "hu_gua_name",
            "hu_gua_detail": "hu_gua_detail",
            "ti_gua": "ti_gua",
            "yong_gua": "yong_gua",
            "ti_wuxing": "ti_wuxing",
            "yong_wuxing": "yong_wuxing",
            "ti_yong_relation": "ti_yong_relation",
            "dong_yao": "dong_yao",
            "dong_yao_ci": "dong_yao_ci",
        }
        for template_key, data_key in mapping.items():
            if data_key in gua_data:
                flat[template_key] = gua_data[data_key]
        return flat

    def _format_candidates(self, candidates: dict) -> str:
        """格式化候選卦象為文字。"""
        if isinstance(candidates, list):
            items = candidates
        elif isinstance(candidates, dict) and "candidates" in candidates:
            items = candidates["candidates"]
        else:
            return str(candidates)

        lines = []
        for item in items:
            cid = item.get("id", item.get("candidate_id", "?"))
            if cid == "?":
                cid = f"C{len(lines) + 1}"
            summary = item.get("summary", item.get("text", ""))
            if not summary:
                summary = (
                    f"{item.get('hexagram_name', '')} → {item.get('changed_hexagram_name', '')}；"
                    f"體={item.get('body_trigram_name', '')}，用={item.get('use_trigram_name', '')}，"
                    f"動爻={item.get('moving_line', '')}，體用={item.get('element_relation', '')}"
                )
            lines.append(f"候選 {cid}：{summary}")
        return "\n\n".join(lines)

    def _format_reading_card(self, card_data: dict) -> str:
        """格式化解卦卡為文字。"""
        card = card_data.get("reading_card", card_data)
        fields = [
            "本卦主調", "體用關係", "主要優勢", "主要風險",
            "動爻警訊", "變卦結果", "過程壓力／互卦", "行動建議",
        ]
        lines = []
        for field in fields:
            if field in card:
                lines.append(f"【{field}】{card[field]}")
        return "\n".join(lines)

    def _format_distractors(self, distractors_data: dict) -> str:
        """格式化干擾項為文字。"""
        items = distractors_data.get("distractors", distractors_data)
        if isinstance(items, list):
            lines = []
            for item in items:
                did = item.get("id", "?")
                text = item.get("text", "")
                lines.append(f"{did}：{text}")
            return "\n\n".join(lines)
        return str(items)

    def _format_story_backs(self, case_id: str, real_story_back: str, distractors_data: dict) -> str:
        """
        將真實故事後續和干擾項混合並隨機排列為 S1~S5 格式。
        回傳格式化文字和真實後續的 ID 映射。
        """
        import random

        items = []
        items.append({"type": "real", "text": real_story_back})
        distractor_list = distractors_data.get("distractors", [])
        for d in distractor_list:
            items.append({"type": "distractor", "text": d.get("text", ""), "original_id": d.get("id", "")})

        random.Random(case_id).shuffle(items)

        lines = []
        real_id = None
        for i, item in enumerate(items):
            sid = f"S{i + 1}"
            lines.append(f"{sid}：{item['text']}")
            if item["type"] == "real":
                real_id = sid

        # 將映射存為案例資料（供後續驗證使用）
        mapping = {
            "real_story_id": real_id,
            "order": [
                {"id": f"S{i+1}", "type": item["type"],
                 "original_id": item.get("original_id", "real")}
                for i, item in enumerate(items)
            ],
        }

        map_path = self._get_case_dir(case_id) / "story_back_candidates_map.json"
        map_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")

        candidates_path = self._get_case_dir(case_id) / "story_back_candidates.json"
        candidates_path.write_text(
            json.dumps({"candidates": [
                {"candidate_id": row["id"], "type": row["type"], "text": items[i]["text"]}
                for i, row in enumerate(mapping["order"])
            ]}, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        return "\n\n".join(lines)

    def _format_claims(self, claims_data: dict) -> str:
        """格式化 claims 為文字。"""
        claims = claims_data.get("claims", claims_data)
        if isinstance(claims, list):
            lines = []
            for i, claim in enumerate(claims):
                ctype = claim.get("claim_type", "")
                ctext = claim.get("claim", "")
                lines.append(f"{i + 1}. [{ctype}] {ctext}")
            return "\n".join(lines)
        return str(claims)

    def _load_book_reference(self, gua_data: dict) -> Optional[str]:
        """載入書籍參考資料。"""
        ben_gua = gua_data.get("ben_gua_name", "")
        ref_file = REFERENCE_DIR / f"{ben_gua}.txt"
        if ref_file.exists():
            return ref_file.read_text(encoding="utf-8").strip()
        # 嘗試通用格式
        ref_file = REFERENCE_DIR / f"gua_{ben_gua}.md"
        if ref_file.exists():
            return ref_file.read_text(encoding="utf-8").strip()
        return "（無對應書籍參考資料）"

    # ========== 生成提示詞 ==========

    def generate_step_prompt(self, case_id: str, step: int, variant: str = None) -> dict:
        """
        生成指定案例的指定步驟提示詞。

        Args:
            case_id: 案例 ID
            step: 步驟編號 (1-14)
            variant: 變體標識（如 "random_1"，用於 Step 8/11/12/13 的隨機卦版本）

        Returns:
            dict: {
                "system_prompt": str,
                "user_message": str,
                "save_path": str,
                "output_format": str,
                "step_name": str,
            }
        """
        # 檢查依賴
        if not self._check_dependencies(case_id, step):
            missing = self._get_missing_dependencies(case_id, step)
            missing_str = "\n".join(
                f"  - Step {s}: {name} → 缺少 {f}" for s, name, f in missing
            )
            raise ValueError(
                f"Step {step} 的前置依賴尚未完成：\n{missing_str}"
            )

        # Step 2 是程式碼步驟，直接生成問題
        if step == 2:
            return self._generate_step2(case_id)

        # 載入並解析模板
        if step not in self.templates:
            raise ValueError(f"找不到 Step {step} 的模板")

        sections = self._parse_template(self.templates[step])
        variables = self._collect_variables(case_id, step, variant)

        # 處理 Step 7 的雙模板
        if step == 7:
            user_key = "user_template_a"
            if variant == "1b" and "user_template_b" in sections:
                user_key = "user_template_b"
            elif user_key not in sections:
                user_key = "user_template"
        else:
            user_key = "user_template"

        system_prompt = self._fill_template(sections.get("system_prompt", ""), variables)
        user_template = sections.get(user_key, "")
        expected_output = sections.get("expected_output", "")

        # 填充變數
        user_message = self._fill_template(user_template, variables)

        # 決定儲存路徑
        save_filename = STEP_OUTPUTS.get(step, f"step{step:02d}_output.json")
        if variant:
            name, ext = os.path.splitext(save_filename)
            # 移除 _true 後綴（如果有的話）
            name = name.replace("_true", "")
            save_filename = f"{name}_{variant}{ext}"
        save_path = str(self._get_case_dir(case_id) / save_filename)

        return {
            "system_prompt": system_prompt,
            "user_message": user_message,
            "save_path": save_path,
            "output_format": expected_output,
            "step_name": STEP_NAMES.get(step, f"Step {step}"),
        }

    def _generate_step2(self, case_id: str) -> dict:
        """Step 2 是程式碼步驟，直接生成問題。"""
        init_data = self._load_case_init(case_id)
        if not init_data:
            raise ValueError(f"案例 {case_id} 缺少 init.json")

        category = init_data.get("category", "")
        question = get_question(category)

        save_path = str(self._get_case_dir(case_id) / "question.txt")

        return {
            "system_prompt": "（此步驟為程式碼邏輯，不使用 LLM）",
            "user_message": f"類別：{category}\n生成的問題：{question}",
            "save_path": save_path,
            "output_format": "純文字（由程式碼直接生成）",
            "step_name": STEP_NAMES[2],
            "auto_generated": True,
            "question": question,
        }

    def generate_case_prompts(self, case_id: str) -> list:
        """
        生成案例所有可執行步驟的提示詞。

        只會生成依賴已滿足、且輸出尚未存在的步驟。

        Returns:
            list of (step_number, prompt_dict) tuples
        """
        results = []
        for step, _name in self.get_next_steps(case_id):
            try:
                prompt = self.generate_step_prompt(case_id, step)
                results.append((step, prompt))
            except ValueError as e:
                print(f"[跳過] Step {step}: {e}")
        return results

    # ========== 儲存生成的提示詞 ==========

    def save_prompt(self, case_id: str, step: int, prompt: dict, variant: str = None):
        """
        將生成的提示詞存為可複製貼上的 markdown 檔案。

        存放位置：prompts/generated/{case_id}/
        """
        dir_name = case_id if case_id.startswith("case_") else f"case_{case_id}"
        output_dir = GENERATED_DIR / dir_name
        output_dir.mkdir(parents=True, exist_ok=True)

        variant_suffix = f"_{variant}" if variant else ""
        filename = f"step{step:02d}{variant_suffix}.md"
        filepath = output_dir / filename

        step_name = prompt.get("step_name", STEP_NAMES.get(step, f"Step {step}"))
        system_prompt = prompt["system_prompt"]
        user_message = prompt["user_message"]
        output_format = prompt.get("output_format", "")
        save_path = prompt.get("save_path", "")

        content = f"""# Case {case_id} — Step {step}: {step_name}

## 操作說明
1. 將下方「System Prompt」貼入 LLM 的 system prompt 欄位
2. 將「User Message」貼入對話框送出
3. 將 LLM 回應複製
4. 執行：`python tools/save_response.py {case_id} {step}`
   然後貼入回應

---

## System Prompt

{system_prompt}

---

## User Message

{user_message}

---

## Expected Output Format

{output_format}

---

## Save Path

回應儲存位置：`{save_path}`
"""
        filepath.write_text(content, encoding="utf-8")
        print(f"[已儲存] {filepath}")
        return filepath

    def save_all_prompts(self, case_id: str):
        """生成並儲存案例所有可執行步驟的提示詞。"""
        prompts = self.generate_case_prompts(case_id)
        saved = []
        for step, prompt in prompts:
            filepath = self.save_prompt(case_id, step, prompt)
            saved.append((step, filepath))
        return saved

    # ========== Step 2 自動執行 ==========

    def auto_execute_step2(self, case_id: str) -> str:
        """自動執行 Step 2（問題生成），直接存檔。"""
        prompt = self.generate_step_prompt(case_id, 2)
        question = prompt.get("question", "")
        if not question:
            raise ValueError("無法生成問題")

        case_dir = self._get_case_dir(case_id)
        case_dir.mkdir(parents=True, exist_ok=True)
        question_file = case_dir / "question.txt"
        question_file.write_text(question, encoding="utf-8")
        print(f"[Step 2 自動完成] {question_file}")
        return question


# ===== CLI 入口 =====

def main():
    """命令列介面。"""
    import sys

    usage = """
梅花易數實驗提示詞生成器

用法：
  python tools/prompt_generator.py status <case_id>       — 查看案例狀態與可執行步驟
  python tools/prompt_generator.py generate <case_id> <step>  — 生成指定步驟的提示詞
  python tools/prompt_generator.py generate_all <case_id>     — 生成所有可執行步驟的提示詞
  python tools/prompt_generator.py step2 <case_id>            — 自動執行 Step 2（問題生成）
  python tools/prompt_generator.py list_categories            — 列出所有類別與對應問題
"""

    if len(sys.argv) < 2:
        print(usage)
        return

    command = sys.argv[1]
    gen = PromptGenerator()

    if command == "status":
        if len(sys.argv) < 3:
            print("請提供 case_id")
            return
        case_id = sys.argv[2]
        print(f"\n=== Case {case_id} 狀態 ===\n")

        # 顯示已完成步驟
        case_dir = gen._get_case_dir(case_id)
        print("已完成步驟：")
        for step, output_file in STEP_OUTPUTS.items():
            if output_file and (case_dir / output_file).exists():
                print(f"  [DONE] Step {step}: {STEP_NAMES[step]}")

        # 顯示可執行步驟
        next_steps = gen.get_next_steps(case_id)
        print("\n可執行步驟：")
        if next_steps:
            for step, name in next_steps:
                print(f"  [NEXT] Step {step}: {name}")
        else:
            print("  （全部完成或缺少初始化資料）")

    elif command == "generate":
        if len(sys.argv) < 4:
            print("請提供 case_id 和 step")
            return
        case_id = sys.argv[2]
        step = int(sys.argv[3])
        variant = sys.argv[4] if len(sys.argv) > 4 else None

        try:
            prompt = gen.generate_step_prompt(case_id, step, variant)
            filepath = gen.save_prompt(case_id, step, prompt, variant)
            print(f"\n提示詞已生成：{filepath}")
        except ValueError as e:
            print(f"\n[錯誤] {e}")

    elif command == "generate_all":
        if len(sys.argv) < 3:
            print("請提供 case_id")
            return
        case_id = sys.argv[2]
        saved = gen.save_all_prompts(case_id)
        print(f"\n共生成 {len(saved)} 個提示詞檔案")
        for step, filepath in saved:
            print(f"  Step {step}: {filepath}")

    elif command == "step2":
        if len(sys.argv) < 3:
            print("請提供 case_id")
            return
        case_id = sys.argv[2]
        try:
            question = gen.auto_execute_step2(case_id)
            print(f"\n生成的問題：{question}")
        except ValueError as e:
            print(f"\n[錯誤] {e}")

    elif command == "list_categories":
        print("\n=== 類別與問題對應 ===\n")
        for cat, q in CATEGORY_QUESTIONS.items():
            print(f"  {cat}：{q}")
        print(f"\n  （其他）：關於這個「<類別>」情境，接下來整體狀態會如何發展？")

    else:
        print(f"未知命令：{command}")
        print(usage)


if __name__ == "__main__":
    main()
