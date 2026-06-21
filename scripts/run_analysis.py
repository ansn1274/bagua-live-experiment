#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Run complete analysis on all finished cases.

Usage:
    python scripts/run_analysis.py [--batch_id latest] [--verbose]

Behavior:
1. Load all cases with complete data
2. Run Layer 1 analysis (1A and 1B if available)
3. Run Layer 2 analysis (2A and 2B if available)
4. Run statistical tests
5. Save results to data/summary/batch_XXX_results.json
6. Print formatted summary to console
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.layer1_analysis import Layer1Analyzer
from tools.layer2_analysis import Layer2Analyzer
from tools import stats


def load_all_cases(batch_id: str = "latest") -> list:
    """Load all case data from data/cases/."""
    cases_dir = PROJECT_ROOT / "data" / "cases"
    if not cases_dir.exists():
        return []

    cases = []
    for case_path in sorted(cases_dir.iterdir()):
        if not case_path.is_dir():
            continue

        meta_path = case_path / "meta.json"
        if not meta_path.exists():
            continue

        meta = json.loads(meta_path.read_text(encoding="utf-8"))

        # Filter by batch if specified
        if batch_id != "latest" and meta.get("batch_id") != batch_id:
            continue

        case_data = {"meta": meta, "case_dir": str(case_path)}

        # Load available data files
        for filename in [
            "hexagram.json",
            "random_hexagrams.json",
            "eval_1a.json",
            "eval_1b.json",
            "card_true.json",
            "eval_2a_true.json",
            "candidate_rank.json",
            "candidate_rank_1a.json",
            "candidate_rank_1b.json",
            "story_back_candidates_map.json",
        ]:
            fpath = case_path / filename
            if fpath.exists():
                key = filename.replace(".json", "")
                case_data[key] = json.loads(fpath.read_text(encoding="utf-8"))

        if "candidate_rank" in case_data and "candidate_rank_1a" not in case_data:
            case_data["candidate_rank_1a"] = case_data["candidate_rank"]

        if "story_back_candidates_map" in case_data:
            case_data["actual_back_id"] = case_data["story_back_candidates_map"].get("real_story_id", "")

        # Load random card evaluations
        random_evals = []
        k = meta.get("k_random", 3)
        for ri in range(1, k + 1):
            rpath = case_path / f"eval_2a_random_{ri}.json"
            if not rpath.exists():
                rpath = case_path / f"eval_2a_random_{ri:02d}.json"
            if rpath.exists():
                random_evals.append(
                    json.loads(rpath.read_text(encoding="utf-8"))
                )
        if random_evals:
            case_data["eval_2a_random"] = random_evals

        # Load text files
        for txt_name in ["story_front.txt", "question.txt", "story_back.txt"]:
            tpath = case_path / txt_name
            if tpath.exists():
                key = txt_name.replace(".txt", "")
                case_data[key] = tpath.read_text(encoding="utf-8")

        # Load claim data (Layer 2B)
        claims_true_path = case_path / "claim_evidence_true.json"
        if claims_true_path.exists():
            case_data["claims_true"] = json.loads(
                claims_true_path.read_text(encoding="utf-8")
            )
        claims_random = []
        for ri in range(1, k + 1):
            crpath = case_path / f"claim_evidence_random_{ri}.json"
            if not crpath.exists():
                crpath = case_path / f"claim_evidence_random_{ri:02d}.json"
            if crpath.exists():
                claims_random.append(
                    json.loads(crpath.read_text(encoding="utf-8"))
                )
        if claims_random:
            case_data["claims_random"] = claims_random

        cases.append(case_data)

    return cases


def run_layer1(cases: list, verbose: bool = False) -> dict:
    """Run Layer 1 analysis on all cases."""
    analyzer = Layer1Analyzer()
    results = []

    for case_data in cases:
        if "eval_1a" not in case_data:
            continue
        try:
            result = analyzer.analyze_case(case_data)
            result["case_id"] = case_data["meta"]["case_id"]
            results.append(result)
        except Exception as e:
            if verbose:
                print(f"  [WARN] Layer 1 error for {case_data['meta']['case_id']}: {e}")

    if not results:
        return {"layer1a": None, "layer1b": None, "case_results": []}

    aggregate = analyzer.aggregate(results)
    aggregate["case_results"] = results
    return aggregate


def run_layer2(cases: list, verbose: bool = False) -> dict:
    """Run Layer 2 analysis on all cases."""
    analyzer = Layer2Analyzer()
    results = []

    for case_data in cases:
        if "eval_2a_true" not in case_data:
            continue
        if "eval_2a_random" not in case_data:
            continue

        try:
            result = analyzer.analyze_case(case_data)
            result["case_id"] = case_data["meta"]["case_id"]
            results.append(result)
        except Exception as e:
            if verbose:
                print(f"  [WARN] Layer 2 error for {case_data['meta']['case_id']}: {e}")

    if not results:
        return {"n_cases": 0, "case_results": []}

    aggregate = analyzer.aggregate(results)
    aggregate["case_results"] = results
    return aggregate


def run_stats(layer1_agg: dict, layer2_agg: dict) -> dict:
    """Run statistical tests on aggregated results."""
    stat_results = {}

    # Layer 1 stats
    l1a = layer1_agg.get("layer1a")
    if l1a and l1a.get("ranks"):
        ranks = [float(r) for r in l1a["ranks"]]

        # Body-Use rank: test if significantly better than chance (32.5)
        stat_results["layer1a_rank"] = stats.full_test_suite(
            ranks, baseline=32.5, label="Layer 1A Body-Use Rank vs Chance (32.5)"
        )

        # Percentile test: test if > 0.5 (chance level)
        if l1a.get("n_cases", 0) > 0:
            percentiles = [
                1.0 - (r - 1) / 63.0 for r in ranks
            ]
            stat_results["layer1a_percentile"] = stats.full_test_suite(
                percentiles, baseline=0.5, label="Layer 1A Percentile vs 0.5"
            )

        # Local rank test: test if < 3.5 (chance for 6 candidates)
        local_ranks = l1a.get("local_ranks", [])
        if local_ranks:
            stat_results["layer1a_local_rank"] = stats.full_test_suite(
                [float(r) for r in local_ranks],
                baseline=3.5,
                label="Layer 1A Local Rank vs Chance (3.5)",
            )

        # Top-1 rate binomial test
        top1_count = sum(1 for r in ranks if r == 1)
        stat_results["layer1a_top1_binom"] = stats.binomial_test(
            top1_count, len(ranks), p0=1 / 64
        )

    # Layer 1B stats
    l1b = layer1_agg.get("layer1b")
    if l1b and l1b.get("ranks"):
        ranks_b = [float(r) for r in l1b["ranks"]]
        stat_results["layer1b_rank"] = stats.full_test_suite(
            ranks_b, baseline=32.5, label="Layer 1B Body-Use Rank vs Chance (32.5)"
        )

    # Layer 2 stats
    if layer2_agg.get("n_cases", 0) > 0:
        delta_mrrs = layer2_agg.get("delta_mrrs", [])
        if delta_mrrs:
            stat_results["layer2_delta_mrr"] = stats.full_test_suite(
                delta_mrrs, baseline=0, label="Layer 2 delta-MRR vs 0"
            )

        pw_rates = layer2_agg.get("pairwise_win_rates", [])
        if pw_rates:
            stat_results["layer2_pairwise"] = stats.full_test_suite(
                pw_rates, baseline=0.5, label="Layer 2 Pairwise Win Rate vs 0.5"
            )

            # Binomial on overall pairwise wins
            total_wins = sum(1 for r in pw_rates if r > 0.5)
            stat_results["layer2_pairwise_binom"] = stats.binomial_test(
                total_wins, len(pw_rates), p0=0.5
            )

        # MRR comparison: paired test (true vs random)
        case_results = layer2_agg.get("case_results", [])
        if case_results:
            mrr_trues = [cr["mrr_true"] for cr in case_results]
            mrr_randoms = [cr["mean_mrr_random"] for cr in case_results]
            stat_results["layer2_mrr_paired"] = stats.paired_t_test(
                mrr_trues, mrr_randoms
            )
            stat_results["layer2_mrr_paired"]["label"] = "Paired t-test: MRR true vs random"

            # Wilcoxon on paired MRR
            stat_results["layer2_mrr_wilcoxon"] = stats.wilcoxon_signed_rank(
                mrr_trues, mrr_randoms
            )
            stat_results["layer2_mrr_wilcoxon"]["label"] = "Wilcoxon: MRR true vs random"

        # Claim score delta if available
        delta_claims = [
            cr.get("delta_claim")
            for cr in case_results
            if cr.get("delta_claim") is not None
        ] if case_results else []
        if delta_claims:
            stat_results["layer2b_delta_claim"] = stats.full_test_suite(
                delta_claims, baseline=0, label="Layer 2B delta-Claim vs 0"
            )

    return stat_results


def print_summary(layer1_agg: dict, layer2_agg: dict, stat_results: dict):
    """Print formatted summary to console."""
    print("\n" + "=" * 60)
    print("  梅花易數實驗 — 分析結果摘要")
    print("=" * 60)

    # Layer 1
    l1a = layer1_agg.get("layer1a")
    if l1a:
        print(f"\n{'-' * 40}")
        print("  Layer 1A: 取數生成有效性")
        print(f"{'-' * 40}")
        print(f"  Cases analyzed: {l1a.get('n_cases', 0)}")
        print(f"  Mean Body-Use Rank: {l1a.get('mean_body_use_rank', 0):.2f} / 64")
        print(f"  Median Body-Use Rank: {l1a.get('median_body_use_rank', 0):.1f}")
        print(f"  Mean Percentile: {l1a.get('mean_percentile', 0):.3f}")
        print(f"  Top-1 Rate: {l1a.get('top1_rate', 0):.1%}")
        print(f"  Top-3 Rate: {l1a.get('top3_rate', 0):.1%}")

        if l1a.get("mean_local_rank") is not None:
            print(f"  Mean Local Rank (6-way): {l1a['mean_local_rank']:.2f}")

        # Stats
        sr = stat_results.get("layer1a_rank", {})
        ot = sr.get("one_sample_t", {})
        if ot:
            sig = "YES" if ot.get("significant_005") else "No"
            print(f"  t-test vs chance (32.5): p={ot.get('p_value', 1):.4f} {sig}")
            print(f"  Cohen's d: {sr.get('cohens_d', 0):.3f}")
    else:
        print("\n  Layer 1: No data available yet")

    # Layer 2
    if layer2_agg.get("n_cases", 0) > 0:
        print(f"\n{'-' * 40}")
        print("  Layer 2: 解卦分析有效性")
        print(f"{'-' * 40}")
        print(f"  Cases analyzed: {layer2_agg['n_cases']}")
        print(f"  K random controls: {layer2_agg.get('K', 0)}")
        print(f"  Mean MRR (true):   {layer2_agg.get('mean_mrr_true', 0):.4f}")
        print(f"  Mean MRR (random): {layer2_agg.get('mean_mrr_random', 0):.4f}")
        print(f"  Mean Δ-MRR:        {layer2_agg.get('mean_delta_mrr', 0):+.4f}")
        print(f"  Median Δ-MRR:      {layer2_agg.get('median_delta_mrr', 0):+.4f}")
        print(f"  Pairwise Win Rate: {layer2_agg.get('mean_pairwise_win_rate', 0):.1%}")
        print(f"  Top-1 Rate (true): {layer2_agg.get('top1_rate_true', 0):.1%}")
        print(f"  Top-1 Rate (rand): {layer2_agg.get('top1_rate_random', 0):.1%}")

        sr_mrr = stat_results.get("layer2_delta_mrr", {})
        ot_mrr = sr_mrr.get("one_sample_t", {})
        if ot_mrr:
            sig = "YES" if ot_mrr.get("significant_005") else "No"
            print(f"  Δ-MRR t-test vs 0: p={ot_mrr.get('p_value', 1):.4f} {sig}")
            print(f"  Cohen's d: {sr_mrr.get('cohens_d', 0):.3f}")

        if layer2_agg.get("mean_claim_true") is not None:
            print(f"\n  Layer 2B Claims:")
            print(f"    Mean claim (true):   {layer2_agg['mean_claim_true']:.4f}")
            print(f"    Mean claim (random): {layer2_agg.get('mean_claim_random', 0):.4f}")
            print(f"    Δ-Claim:             {layer2_agg.get('mean_delta_claim', 0):+.4f}")
    else:
        print("\n  Layer 2: No data available yet")

    print(f"\n{'=' * 60}")


def main():
    parser = argparse.ArgumentParser(
        description="執行完整分析 — Run complete analysis on all finished cases",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/run_analysis.py
  python scripts/run_analysis.py --verbose
  python scripts/run_analysis.py --batch_id batch_20260101_120000
        """,
    )
    parser.add_argument(
        "--batch_id",
        type=str,
        default="latest",
        help="Batch ID to analyze (default: latest / all)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed per-case output",
    )

    args = parser.parse_args()

    print("Loading cases...")
    cases = load_all_cases(args.batch_id)
    print(f"   Found {len(cases)} cases")

    if not cases:
        print("No cases found. Run init_batch.py first.")
        return

    # Run analyses
    print("\nRunning Layer 1 analysis...")
    layer1_agg = run_layer1(cases, args.verbose)

    print("Running Layer 2 analysis...")
    layer2_agg = run_layer2(cases, args.verbose)

    print("Running statistical tests...")
    stat_results = run_stats(layer1_agg, layer2_agg)

    # Save results
    summary_dir = PROJECT_ROOT / "data" / "summary"
    summary_dir.mkdir(parents=True, exist_ok=True)

    batch_id = args.batch_id if args.batch_id != "latest" else "latest"
    results = {
        "batch_id": batch_id,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "n_cases_total": len(cases),
        "layer1": layer1_agg,
        "layer2": layer2_agg,
        "statistics": stat_results,
        "trigrams": ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"],
    }

    # Remove non-serializable items
    for case in results.get("layer1", {}).get("case_results", []):
        if "case_dir" in case:
            del case["case_dir"]

    output_path = summary_dir / f"{batch_id}_results.json"
    output_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print(f"\nResults saved to: {output_path}")

    # Print summary
    print_summary(layer1_agg, layer2_agg, stat_results)


if __name__ == "__main__":
    main()
