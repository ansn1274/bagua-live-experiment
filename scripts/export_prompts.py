#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
匯出待執行提示詞 — Export pending prompts for the current batch.

Usage:
    python scripts/export_prompts.py [--step N] [--batch_id latest] [--dry_run]

Behavior:
1. 掃描 data/cases/ 中所有案例
2. 對每個案例判斷已完成的步驟
3. 根據依賴關係，生成下一步可用的提示詞
4. 存入 prompts/generated/case_XXX/ 供手動複製貼上
5. 列印生成摘要

Options:
  --step N:       只生成指定步驟的提示詞
  --batch_id:     指定批次（預設：latest / all）
  --dry_run:      只顯示要生成什麼，不實際寫入
"""

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.prompt_generator import PromptGenerator, STEP_NAMES, STEP_OUTPUTS, get_question


def find_cases(batch_id: str = "latest") -> list:
    """掃描所有案例目錄，回傳 (case_id, case_dir, meta) 列表。"""
    cases_dir = PROJECT_ROOT / "data" / "cases"
    if not cases_dir.exists():
        return []

    cases = []
    for case_dir in sorted(cases_dir.iterdir()):
        if not case_dir.is_dir():
            continue

        meta_path = case_dir / "meta.json"
        if not meta_path.exists():
            continue

        meta = json.loads(meta_path.read_text(encoding="utf-8"))

        # 篩選批次
        if batch_id != "latest" and meta.get("batch_id") != batch_id:
            continue

        case_id = case_dir.name  # e.g., "case_001"
        cases.append((case_id, case_dir, meta))

    return cases


def auto_execute_step2(case_id: str, case_dir: Path, meta: dict):
    """Step 2 是程式碼步驟，直接生成 question.txt。"""
    question_path = case_dir / "question.txt"
    if question_path.exists():
        return False  # 已存在

    category = meta.get("category", "")
    question = get_question(category)
    question_path.write_text(question, encoding="utf-8")
    return True


def auto_compute_hexagram(case_id: str, case_dir: Path, meta: dict):
    """Step 3 完成後，自動計算卦象和隨機卦。"""
    numbers_path = case_dir / "numbers.json"
    hexagram_path = case_dir / "hexagram.json"
    random_path = case_dir / "random_hexagrams.json"

    if not numbers_path.exists() or hexagram_path.exists():
        return False

    from tools.meihua_calc import numbers_to_hexagram, get_six_candidates
    from tools.random_hexagram import generate_procedure_matched_random

    numbers = json.loads(numbers_path.read_text(encoding="utf-8"))
    n1 = numbers["n1"]
    n2 = numbers["n2"]

    # 計算真卦
    hexagram = numbers_to_hexagram(n1, n2)
    hexagram_path.write_text(
        json.dumps(hexagram, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    # 計算六候選
    candidates = get_six_candidates(
        hexagram["body_trigram_name"],
        hexagram["use_trigram_name"]
    )
    candidates_path = case_dir / "candidates.json"
    candidates_path.write_text(
        json.dumps({"candidates": candidates}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    # 生成隨機卦
    k = meta.get("k_random", 3)
    randoms = generate_procedure_matched_random(k, hexagram)
    random_path.write_text(
        json.dumps(randoms, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    return True


def main():
    parser = argparse.ArgumentParser(
        description="匯出待執行提示詞 — Export pending prompts",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--step", type=int, default=None,
                        help="只生成指定步驟 (1-14)")
    parser.add_argument("--batch_id", type=str, default="latest",
                        help="批次 ID（預設：latest / all）")
    parser.add_argument("--dry_run", action="store_true",
                        help="只顯示要生成什麼，不實際寫入")
    args = parser.parse_args()

    cases = find_cases(args.batch_id)
    if not cases:
        print("No cases found. Run init_batch.py first.")
        return

    generator = PromptGenerator()
    generated_count = 0
    skipped_count = 0
    auto_count = 0

    for case_id, case_dir, meta in cases:
        # 自動執行 Step 2（程式碼步驟）
        if auto_execute_step2(case_id, case_dir, meta):
            auto_count += 1

        # 自動計算卦象（如果 Step 3 已完成）
        if auto_compute_hexagram(case_id, case_dir, meta):
            auto_count += 1

        # 取得可執行的下一步
        next_steps = generator.get_next_steps(case_id)

        if args.step is not None:
            # 只處理指定步驟
            next_steps = [(s, n) for s, n in next_steps if s == args.step]

        if not next_steps:
            skipped_count += 1
            continue

        for step_num, step_name in next_steps:
            # 跳過 Step 2（已自動處理）和 Step 14（全域摘要）
            if step_num == 2 or step_num == 14:
                continue

            try:
                prompt = generator.generate_step_prompt(case_id, step_num)

                if args.dry_run:
                    print(f"  [DRY] {case_id}: Step {step_num} ({step_name})")
                else:
                    generator.save_prompt(case_id, step_num, prompt)

                    # 確定輸出檔名
                    output_dir = PROJECT_ROOT / "prompts" / "generated" / case_id
                    md_files = sorted(output_dir.glob(f"step{step_num:02d}*.md"))
                    out_name = md_files[-1].name if md_files else f"step_{step_num:02d}.md"
                    print(f"  [OK] {case_id}: step {step_num} -> {out_name}")

                generated_count += 1

            except ValueError as e:
                if not args.dry_run:
                    print(f"  [SKIP] {case_id}: step {step_num} - {e}")
                skipped_count += 1

            # 對 Step 8 和 11，還需生成隨機卦版本
            if step_num in (8, 11, 12, 13):
                random_hexagrams_path = case_dir / "random_hexagrams.json"
                if random_hexagrams_path.exists():
                    randoms = json.loads(random_hexagrams_path.read_text(encoding="utf-8"))
                    for ri, _rh in enumerate(randoms):
                        variant = f"random_{ri + 1}"
                        try:
                            prompt_r = generator.generate_step_prompt(case_id, step_num, variant=variant)
                            if not args.dry_run:
                                generator.save_prompt(case_id, step_num, prompt_r, variant=variant)
                            generated_count += 1
                        except ValueError:
                            pass

    print()
    print("-" * 50)
    summary = f"Generated {generated_count} prompts"
    if auto_count:
        summary += f", auto-computed {auto_count} steps"
    if skipped_count:
        summary += f", skipped {skipped_count} cases"
    print(f"[Summary] {summary}")
    print(f"[Output]  {PROJECT_ROOT / 'prompts' / 'generated'}")


if __name__ == "__main__":
    main()
