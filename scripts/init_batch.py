#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Initialize a batch of experiment cases.

Usage:
    python scripts/init_batch.py [--n_cases 50] [--k_random 3] [--batch_id auto]

Creates:
- data/cases/case_001/ through case_N/
- Each case gets meta.json with:
  - case_id, batch_id, category, story_elements, k_random,
    created_at, status: "initialized"
"""

import argparse
import json
import sys
import random
from datetime import datetime, timezone
from pathlib import Path

# Ensure tools/ is importable
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# ──────────────────────────────────────────────
#  Story categories & elements
# ──────────────────────────────────────────────

def load_categories() -> dict:
    """Load story categories from config/categories.json."""
    config_path = PROJECT_ROOT / "config" / "categories.json"
    data = json.loads(config_path.read_text(encoding="utf-8"))
    return {
        item["name"]: item.get("elements", [])
        for item in data.get("categories", [])
    }


def generate_batch_id() -> str:
    """Generate batch ID from timestamp."""
    return datetime.now().strftime("batch_%Y%m%d_%H%M%S")


def init_batch(n_cases: int, k_random: int, batch_id: str) -> Path:
    """
    Initialize a batch of cases.

    Returns path to the batch directory.
    """
    cases_dir = PROJECT_ROOT / "data" / "cases"
    cases_dir.mkdir(parents=True, exist_ok=True)

    # Store batch metadata
    summary_dir = PROJECT_ROOT / "data" / "summary"
    summary_dir.mkdir(parents=True, exist_ok=True)

    batch_meta = {
        "batch_id": batch_id,
        "n_cases": n_cases,
        "k_random": k_random,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "categories": list(load_categories().keys()),
    }

    batch_meta_path = summary_dir / f"{batch_id}_meta.json"
    batch_meta_path.write_text(json.dumps(batch_meta, ensure_ascii=False, indent=2), encoding="utf-8")

    categories = load_categories()
    categories_list = list(categories.keys())

    created = []
    next_index = 1
    for i in range(1, n_cases + 1):
        while True:
            case_id = f"case_{next_index:03d}"
            next_index += 1
            if not (cases_dir / case_id).exists():
                break
        case_dir = cases_dir / case_id
        case_dir.mkdir(parents=True, exist_ok=True)

        # Assign category round-robin then random within remainder
        category = categories_list[(i - 1) % len(categories_list)]
        elements_pool = categories[category]
        n_elements = min(3, len(elements_pool))
        story_elements = random.sample(elements_pool, n_elements)

        meta = {
            "case_id": case_id,
            "batch_id": batch_id,
            "category": category,
            "story_elements": story_elements,
            "k_random": k_random,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "initialized",
            "steps_completed": [],
        }

        meta_path = case_dir / "meta.json"
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        created.append(case_id)

    print(f"[OK] Batch '{batch_id}' initialized with {n_cases} cases.")
    print(f"   K random hexagrams per case: {k_random}")
    print(f"   Batch metadata: {batch_meta_path}")
    print(f"   Cases directory: {cases_dir}")
    print()

    # Summary by category
    cat_counts = {}
    for i in range(1, n_cases + 1):
        cat = categories_list[(i - 1) % len(categories_list)]
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    print("   Category distribution:")
    for cat, count in cat_counts.items():
        print(f"     {cat}: {count} cases")

    return cases_dir


def main():
    parser = argparse.ArgumentParser(
        description="初始化梅花易數實驗批次 — Initialize a batch of experiment cases",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/init_batch.py
  python scripts/init_batch.py --n_cases 100 --k_random 5
  python scripts/init_batch.py --batch_id my_pilot_batch
        """,
    )
    parser.add_argument(
        "--n_cases",
        type=int,
        default=50,
        help="Number of cases to create (default: 50)",
    )
    parser.add_argument(
        "--k_random",
        type=int,
        default=3,
        help="Number of random hexagram controls per case (default: 3)",
    )
    parser.add_argument(
        "--batch_id",
        type=str,
        default="auto",
        help="Batch identifier (default: auto-generated from timestamp)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for reproducibility",
    )

    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    batch_id = args.batch_id if args.batch_id != "auto" else generate_batch_id()
    init_batch(args.n_cases, args.k_random, batch_id)


if __name__ == "__main__":
    main()
