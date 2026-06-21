"""
Layer 1 Analysis — 取數生成有效性

Computes:
1. Body/Use combination ranking (64 combinations)
2. Six-candidate local ranking

The 8 trigrams: 乾 兌 離 震 巽 坎 艮 坤
Body-Use grid: 8×8 = 64 combinations
Score(body, use) = P_body(body) × P_use(use)
"""

import json
import math
from pathlib import Path
from typing import List, Optional

TRIGRAMS = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"]


class Layer1Analyzer:
    """Analyzes Layer 1 (取數生成) validity metrics."""

    def analyze_case(self, case_data: dict) -> dict:
        """
        Analyze a single case for Layer 1 metrics.

        Input case_data contains:
        - hexagram: true hexagram data (from meihua_calc)
        - eval_1a: {body_trigram: {trigramName: prob, ...}, use_trigram: {trigramName: prob, ...}}
        - eval_1b: same format (optional)
        - candidate_rank_1a: {rankings: [{id, score}, ...], true_id: str}
        - candidate_rank_1b: same format (optional)

        Returns dict with layer1a and optionally layer1b results.
        """
        result = {}

        hexagram = case_data.get("hexagram", {})
        true_body = hexagram.get("body_trigram", hexagram.get("body_trigram_name", ""))
        true_use = hexagram.get("use_trigram", hexagram.get("use_trigram_name", ""))

        # --- Layer 1A ---
        eval_1a = case_data.get("eval_1a")
        if eval_1a:
            body_probs = eval_1a.get("body_trigram", {})
            use_probs = eval_1a.get("use_trigram", {})

            # Normalize probabilities (fill missing trigrams with small epsilon)
            body_probs = self._normalize_probs(body_probs)
            use_probs = self._normalize_probs(use_probs)

            ranking_result = self.compute_body_use_ranking(
                body_probs, use_probs, true_body, true_use
            )

            local_result = {"true_local_rank": None, "candidate_scores": []}
            candidate_rank_1a = case_data.get("candidate_rank_1a")
            if candidate_rank_1a:
                if "true_id" not in candidate_rank_1a and hexagram.get("moving_line"):
                    candidate_rank_1a["true_id"] = f"C{hexagram['moving_line']}"
                local_result = self.compute_local_ranking(
                    candidate_rank_1a.get("rankings", candidate_rank_1a.get("scores", [])),
                    candidate_rank_1a.get("true_id", ""),
                )

            result["layer1a"] = {
                "true_body": true_body,
                "true_use": true_use,
                "body_use_score": ranking_result["true_score"],
                "body_use_log_score": ranking_result["true_log_score"],
                "body_use_rank": ranking_result["rank"],
                "body_use_percentile": ranking_result["percentile"],
                "all_64_scores": ranking_result["all_scores"],
                "body_probs": body_probs,
                "use_probs": use_probs,
                "true_local_rank": local_result["true_local_rank"],
                "candidate_scores": local_result["candidate_scores"],
            }

        # --- Layer 1B ---
        eval_1b = case_data.get("eval_1b")
        if eval_1b:
            body_probs_b = self._normalize_probs(eval_1b.get("body_trigram", {}))
            use_probs_b = self._normalize_probs(eval_1b.get("use_trigram", {}))

            ranking_result_b = self.compute_body_use_ranking(
                body_probs_b, use_probs_b, true_body, true_use
            )

            local_result_b = {"true_local_rank": None, "candidate_scores": []}
            candidate_rank_1b = case_data.get("candidate_rank_1b")
            if candidate_rank_1b:
                if "true_id" not in candidate_rank_1b and hexagram.get("moving_line"):
                    candidate_rank_1b["true_id"] = f"C{hexagram['moving_line']}"
                local_result_b = self.compute_local_ranking(
                    candidate_rank_1b.get("rankings", candidate_rank_1b.get("scores", [])),
                    candidate_rank_1b.get("true_id", ""),
                )

            result["layer1b"] = {
                "true_body": true_body,
                "true_use": true_use,
                "body_use_score": ranking_result_b["true_score"],
                "body_use_log_score": ranking_result_b["true_log_score"],
                "body_use_rank": ranking_result_b["rank"],
                "body_use_percentile": ranking_result_b["percentile"],
                "all_64_scores": ranking_result_b["all_scores"],
                "body_probs": body_probs_b,
                "use_probs": use_probs_b,
                "true_local_rank": local_result_b["true_local_rank"],
                "candidate_scores": local_result_b["candidate_scores"],
            }
        else:
            result["layer1b"] = None

        return result

    def _normalize_probs(self, probs: dict) -> dict:
        """Ensure all 8 trigrams have probabilities, fill missing with epsilon."""
        epsilon = 1e-10
        normalized = {}
        for t in TRIGRAMS:
            normalized[t] = probs.get(t, epsilon)

        # Re-normalize to sum to 1
        total = sum(normalized.values())
        if total > 0:
            normalized = {k: v / total for k, v in normalized.items()}
        return normalized

    def compute_body_use_ranking(
        self,
        body_probs: dict,
        use_probs: dict,
        true_body: str,
        true_use: str,
    ) -> dict:
        """
        Compute 64 body-use combinations and rank.

        score(A, B) = P_body(A) × P_use(B)
        log_score = log(P_body(A)) + log(P_use(B))

        Returns rank (1=best), percentile, all scores sorted.
        """
        all_scores = []
        for body in TRIGRAMS:
            for use in TRIGRAMS:
                bp = body_probs.get(body, 1e-10)
                up = use_probs.get(use, 1e-10)
                score = bp * up
                log_score = math.log(bp + 1e-15) + math.log(up + 1e-15)
                all_scores.append(
                    {
                        "body": body,
                        "use": use,
                        "score": score,
                        "log_score": log_score,
                    }
                )

        all_scores.sort(key=lambda x: x["score"], reverse=True)

        # Find true rank
        rank = 64  # default if not found
        for i, s in enumerate(all_scores):
            if s["body"] == true_body and s["use"] == true_use:
                rank = i + 1
                break

        percentile = 1.0 - (rank - 1) / 63.0

        true_bp = body_probs.get(true_body, 1e-10)
        true_up = use_probs.get(true_use, 1e-10)

        return {
            "rank": rank,
            "percentile": percentile,
            "true_score": true_bp * true_up,
            "true_log_score": math.log(true_bp + 1e-15) + math.log(true_up + 1e-15),
            "all_scores": all_scores,
        }

    def compute_local_ranking(
        self, rankings: list, true_candidate_id: str
    ) -> dict:
        """
        Find true candidate rank in 6-candidate ranking.

        Parameters:
            rankings: list of {id: str, score: float} sorted by score desc
            true_candidate_id: the ID of the true candidate

        Returns:
            true_local_rank (1-6), candidate_scores list
        """
        if not rankings:
            return {"true_local_rank": None, "candidate_scores": []}

        # Sort by score descending if not already
        sorted_rankings = sorted(rankings, key=lambda x: x.get("score", 0), reverse=True)

        true_local_rank = None
        for i, r in enumerate(sorted_rankings):
            candidate_id = r.get("id", r.get("candidate_id", ""))
            if candidate_id == true_candidate_id:
                true_local_rank = i + 1
                break

        return {
            "true_local_rank": true_local_rank,
            "candidate_scores": sorted_rankings,
        }

    def aggregate(self, case_results: list) -> dict:
        """
        Aggregate Layer 1 results across all cases.

        Returns summary statistics for layer1a and layer1b.
        """
        result = {}

        for layer_key in ("layer1a", "layer1b"):
            layer_data = [
                cr[layer_key]
                for cr in case_results
                if cr.get(layer_key) is not None
            ]

            if not layer_data:
                result[layer_key] = None
                continue

            ranks = [d["body_use_rank"] for d in layer_data]
            percentiles = [d["body_use_percentile"] for d in layer_data]
            local_ranks = [
                d["true_local_rank"]
                for d in layer_data
                if d.get("true_local_rank") is not None
            ]

            n = len(ranks)
            sorted_ranks = sorted(ranks)
            median_rank = sorted_ranks[n // 2] if n % 2 == 1 else (sorted_ranks[n // 2 - 1] + sorted_ranks[n // 2]) / 2.0

            sorted_local = sorted(local_ranks) if local_ranks else []
            n_local = len(sorted_local)
            median_local = (
                sorted_local[n_local // 2]
                if n_local % 2 == 1
                else (sorted_local[n_local // 2 - 1] + sorted_local[n_local // 2]) / 2.0
            ) if n_local > 0 else None

            top1 = sum(1 for r in ranks if r == 1) / n if n else 0
            top3 = sum(1 for r in ranks if r <= 3) / n if n else 0

            # Aggregate body-use probability heatmaps
            body_use_matrix = {}
            for body in TRIGRAMS:
                body_use_matrix[body] = {}
                for use in TRIGRAMS:
                    body_use_matrix[body][use] = 0.0

            for d in layer_data:
                bp = d.get("body_probs", {})
                up = d.get("use_probs", {})
                for body in TRIGRAMS:
                    for use in TRIGRAMS:
                        body_use_matrix[body][use] += (
                            bp.get(body, 0) * up.get(use, 0)
                        )

            # Average the matrix
            for body in TRIGRAMS:
                for use in TRIGRAMS:
                    body_use_matrix[body][use] /= n

            result[layer_key] = {
                "n_cases": n,
                "mean_body_use_rank": sum(ranks) / n,
                "median_body_use_rank": median_rank,
                "mean_percentile": sum(percentiles) / n,
                "mean_local_rank": sum(local_ranks) / n_local if n_local else None,
                "median_local_rank": median_local,
                "top1_rate": top1,
                "top3_rate": top3,
                "ranks": ranks,
                "local_ranks": local_ranks,
                "body_use_matrix": body_use_matrix,
            }

        return result
