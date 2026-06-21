#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
儲存 LLM 回應 — Save an LLM response for a specific case and step.

Usage:
    python scripts/save_response.py <case_id> <step_num> [--variant VARIANT]

Behavior:
1. 提示使用者貼入回應（從 stdin 讀取直到空行或 EOF）
2. 使用 ResponseValidator 驗證格式
3. 驗證通過則存入 data/cases/case_XXX/
4. 驗證失敗則顯示錯誤並詢問重試
5. 更新 meta.json 狀態
6. 顯示下一步指引

Steps:
  1  - story_front（故事前半段）          → story_front.txt
  3  - number_pick（直覺取數）            → numbers.json（自動觸發卦象計算）
  4  - story_back（故事後半段）           → story_back.txt
  5  - eval_1a（Layer 1A 體用評分）       → eval_1a.json
  6  - eval_1b（Layer 1B 體用評分）       → eval_1b.json
  7  - candidate_rank（六候選排序）       → candidate_rank.json
  8  - hexagram_card（解卦卡生成）        → card_true.json / card_random_X.json
  9  - distractor_gen（Distractor 生成）  → distractors.json
  10 - distractor_qc（Distractor QC）     → distractor_qc.json
  11 - eval_2a（Layer 2A 排序）           → eval_2a_true.json / eval_2a_random_X.json
  12 - claim_extract（Claim 拆解）        → claims_true.json / claims_random_X.json
  13 - claim_evidence（Claim 評分）       → claim_evidence_true.json / claim_evidence_random_X.json

Note: Step 2 (question) 由程式自動生成，不需手動輸入。
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.response_validator import ResponseValidator
from tools.prompt_generator import STEP_NAMES, STEP_OUTPUTS


def get_case_dir(case_id: str) -> Path:
    """取得案例資料目錄。"""
    if not case_id.startswith("case_"):
        case_id = f"case_{case_id}"
    return PROJECT_ROOT / "data" / "cases" / case_id


def load_meta(case_dir: Path) -> dict:
    """載入案例 metadata。"""
    meta_path = case_dir / "meta.json"
    if not meta_path.exists():
        print(f"Error: meta.json not found in {case_dir}")
        sys.exit(1)
    return json.loads(meta_path.read_text(encoding="utf-8"))


def save_meta(case_dir: Path, meta: dict):
    """儲存案例 metadata。"""
    meta_path = case_dir / "meta.json"
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def read_response() -> str:
    """從 stdin 讀取回應，直到連續空行或 EOF。"""
    print("\nPaste the LLM response below.")
    print("(End with TWO empty lines or Ctrl+Z on Windows / Ctrl+D on Unix)\n")
    print("-" * 60)

    lines = []
    empty_count = 0
    try:
        while True:
            line = input()
            if line.strip() == "":
                empty_count += 1
                if empty_count >= 2 and lines:
                    break
                lines.append(line)
            else:
                empty_count = 0
                lines.append(line)
    except EOFError:
        pass

    return "\n".join(lines).strip()


def get_save_filename(step: int, variant: str = None) -> str:
    """取得儲存檔名。"""
    base = STEP_OUTPUTS.get(step, f"step{step:02d}_output.json")
    if base is None:
        base = f"step{step:02d}_output.json"

    if variant:
        import os
        name, ext = os.path.splitext(base)
        name = name.replace("_true", "")
        return f"{name}_{variant}{ext}"
    return base


def is_text_step(step: int) -> bool:
    """判斷此步驟是否為純文字輸出（非 JSON）。"""
    return step in (1, 4)


def auto_compute_hexagram(case_dir: Path, meta: dict):
    """Step 3 完成後，自動計算卦象和隨機卦。"""
    numbers_path = case_dir / "numbers.json"
    hexagram_path = case_dir / "hexagram.json"

    if not numbers_path.exists() or hexagram_path.exists():
        return

    from tools.meihua_calc import numbers_to_hexagram, get_six_candidates
    from tools.random_hexagram import generate_procedure_matched_random

    numbers = json.loads(numbers_path.read_text(encoding="utf-8"))
    n1 = numbers["n1"]
    n2 = numbers["n2"]

    # 計算真卦
    hexagram = numbers_to_hexagram(n1, n2)
    hexagram_path.write_text(
        json.dumps(hexagram, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  -> Hexagram: {hexagram['hexagram_name']} (body={hexagram['body_trigram_name']}, use={hexagram['use_trigram_name']}, moving={hexagram['moving_line']})")

    # 計算六候選
    candidates = get_six_candidates(
        hexagram["body_trigram_name"],
        hexagram["use_trigram_name"]
    )
    (case_dir / "candidates.json").write_text(
        json.dumps({"candidates": candidates}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"  -> 6 candidates generated")

    # 生成隨機卦
    k = meta.get("k_random", 3)
    randoms = generate_procedure_matched_random(k, hexagram)
    (case_dir / "random_hexagrams.json").write_text(
        json.dumps(randoms, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  -> {k} random hexagrams generated")


def main():
    parser = argparse.ArgumentParser(
        description="Save LLM response for a case step",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("case_id", type=str, help="Case ID (e.g., case_001 or 001)")
    parser.add_argument("step_num", type=int, help="Step number (1-13)")
    parser.add_argument("--variant", type=str, default=None,
                        help="Variant ID (e.g., random_1 for random hexagram versions)")
    args = parser.parse_args()

    case_dir = get_case_dir(args.case_id)
    if not case_dir.exists():
        print(f"Error: Case directory not found: {case_dir}")
        sys.exit(1)

    meta = load_meta(case_dir)
    step = args.step_num
    step_name = STEP_NAMES.get(step, f"Step {step}")

    print(f"\nCase: {case_dir.name}")
    print(f"Step {step}: {step_name}")
    if args.variant:
        print(f"Variant: {args.variant}")

    # 讀取回應
    response = read_response()
    if not response:
        print("\nNo response received. Exiting.")
        return

    # 驗證
    validator = ResponseValidator()
    filename = get_save_filename(step, args.variant)

    if is_text_step(step):
        # 純文字步驟，直接儲存
        save_path = case_dir / filename
        save_path.write_text(response, encoding="utf-8")
        print(f"\n[OK] Saved to {save_path}")
    else:
        # JSON 步驟，驗證後儲存
        result = validator.validate(step, response)
        if result["valid"]:
            save_path = case_dir / filename
            save_path.write_text(
                json.dumps(result["data"], ensure_ascii=False, indent=2),
                encoding="utf-8"
            )
            print(f"\n[OK] Saved to {save_path}")
        else:
            print(f"\n[WARN] Validation issues:")
            for err in result.get("errors", []):
                print(f"  - {err}")

            # 嘗試保存清理後的版本
            if result.get("data"):
                save_path = case_dir / filename
                save_path.write_text(
                    json.dumps(result["data"], ensure_ascii=False, indent=2),
                    encoding="utf-8"
                )
                print(f"\n[OK] Saved cleaned version to {save_path}")
            else:
                print("\nCould not parse response. Please check format and retry.")
                # 儲存原始回應供 debug
                raw_path = case_dir / f"raw_step{step:02d}{'_' + args.variant if args.variant else ''}.txt"
                raw_path.write_text(response, encoding="utf-8")
                print(f"Raw response saved to {raw_path}")
                return

    # 更新 meta
    completed = meta.get("steps_completed", [])
    step_key = step if not args.variant else f"{step}_{args.variant}"
    if step_key not in completed:
        completed.append(step_key)
        meta["steps_completed"] = completed
        meta["last_updated"] = datetime.now(timezone.utc).isoformat()
        save_meta(case_dir, meta)

    # Step 3 後自動計算卦象
    if step == 3 and not args.variant:
        print("\nAuto-computing hexagram...")
        auto_compute_hexagram(case_dir, meta)

    # 顯示下一步
    print(f"\n{'=' * 50}")
    print("Next: run 'python scripts/export_prompts.py' to generate next prompts")


if __name__ == "__main__":
    main()
