"""
Layer 2 Analysis — 解卦分析有效性

Computes:
1. MRR (Mean Reciprocal Rank)
2. delta_MRR (true − mean_random)
3. Pairwise win rate
4. Top-1 hit rate
5. Rank differences
6. Claim evidence scores (Layer 2B)
"""

import json
import math
from pathlib import Path
from typing import List, Optional


class Layer2Analyzer:
    """Analyzes Layer 2 (解卦分析) validity metrics."""

    def analyze_case(self, case_data: dict) -> dict:
        """
        Analyze a single case for Layer 2 metrics.

        Input case_data contains:
        - eval_2a_true: list of candidate IDs ranked for the true card
        - eval_2a_random: list of K lists, each a ranking for a random card
        - actual_back_id: which candidate ID is the actual story back
        - claims_true: list of {claim, score} for the true card (optional, 2B)
        - claims_random: list of K lists of {claim, score} (optional, 2B)

        Returns per-case Layer 2 metrics.
        """
        actual_id = case_data.get("actual_back_id", "")

        # --- True card ---
        ranking_true_data = case_data.get("eval_2a_true", [])
        ranking_true = (
            ranking_true_data.get("ranking", [])
            if isinstance(ranking_true_data, dict)
            else ranking_true_data
        )
        mrr_true = self.compute_mrr(ranking_true, actual_id)
        rank_true = self._find_rank(ranking_true, actual_id)
        top1_true = rank_true == 1

        # --- Random cards ---
        rankings_random = []
        for item in case_data.get("eval_2a_random", []):
            if isinstance(item, dict):
                rankings_random.append(item.get("ranking", []))
            else:
                rankings_random.append(item)
        mrr_randoms = []
        rank_randoms = []
        top1_randoms = []
        pairwise_wins = []

        for ranking_rand in rankings_random:
            mrr_r = self.compute_mrr(ranking_rand, actual_id)
            rank_r = self._find_rank(ranking_rand, actual_id)
            mrr_randoms.append(mrr_r)
            rank_randoms.append(rank_r)
            top1_randoms.append(rank_r == 1)
            pairwise_wins.append(mrr_true > mrr_r)

        mean_mrr_random = (
            sum(mrr_randoms) / len(mrr_randoms) if mrr_randoms else 0.0
        )
        delta_mrr = mrr_true - mean_mrr_random

        mean_rank_random = (
            sum(rank_randoms) / len(rank_randoms) if rank_randoms else 0.0
        )
        delta_rank = (
            mean_rank_random - rank_true
        )  # positive = true is better (lower rank)

        pairwise_win_rate = (
            sum(1 for w in pairwise_wins if w) / len(pairwise_wins)
            if pairwise_wins
            else 0.0
        )

        # --- Layer 2B: Claim evidence scores ---
        claim_score_true = None
        claim_scores_random = None
        delta_claim = None

        claims_true = case_data.get("claims_true")
        claims_random = case_data.get("claims_random")

        if claims_true is not None:
            claim_score_true = self._compute_claim_score(claims_true)

        if claims_random is not None:
            claim_scores_random = [
                self._compute_claim_score(cr) for cr in claims_random
            ]

        if claim_score_true is not None and claim_scores_random:
            mean_claim_random = sum(claim_scores_random) / len(claim_scores_random)
            delta_claim = claim_score_true - mean_claim_random

        return {
            "mrr_true": mrr_true,
            "mrr_randoms": mrr_randoms,
            "mean_mrr_random": mean_mrr_random,
            "delta_mrr": delta_mrr,
            "rank_true": rank_true,
            "rank_randoms": rank_randoms,
            "mean_rank_random": mean_rank_random,
            "delta_rank": delta_rank,
            "top1_true": top1_true,
            "top1_randoms": top1_randoms,
            "pairwise_wins": pairwise_wins,
            "pairwise_win_rate": pairwise_win_rate,
            "claim_score_true": claim_score_true,
            "claim_scores_random": claim_scores_random,
            "delta_claim": delta_claim,
        }

    def compute_mrr(self, ranking: list, actual_id: str) -> float:
        """MRR = 1 / rank_of_actual. Returns 0 if not found."""
        rank = self._find_rank(ranking, actual_id)
        if rank == 0:
            return 0.0
        return 1.0 / rank

    def _find_rank(self, ranking: list, actual_id: str) -> int:
        """Find 1-based rank of actual_id in ranking list. Returns 0 if not found."""
        for i, item in enumerate(ranking):
            # Handle both plain ID lists and dicts with 'id' key
            item_id = item if isinstance(item, str) else item.get("id", item.get("candidate_id", ""))
            if item_id == actual_id:
                return i + 1
        return 0

    def _compute_claim_score(self, claims: list) -> float:
        """
        Compute aggregate claim evidence score.
        claims: list of {claim: str, score: float} or just list of floats.
        Returns mean score.
        """
        if isinstance(claims, dict):
            claims = claims.get("claim_scores", claims.get("claims", []))

        if not claims:
            return 0.0
        scores = []
        for c in claims:
            if isinstance(c, (int, float)):
                scores.append(float(c))
            elif isinstance(c, dict):
                scores.append(float(c.get("score", 0)))
        return sum(scores) / len(scores) if scores else 0.0

    def aggregate(self, case_results: list) -> dict:
        """
        Aggregate Layer 2 results across all cases.

        Returns comprehensive summary statistics.
        """
        if not case_results:
            return {"n_cases": 0}

        n = len(case_results)
        K = len(case_results[0].get("mrr_randoms", []))

        mrr_trues = [cr["mrr_true"] for cr in case_results]
        mrr_randoms_means = [cr["mean_mrr_random"] for cr in case_results]
        delta_mrrs = [cr["delta_mrr"] for cr in case_results]
        pairwise_rates = [cr["pairwise_win_rate"] for cr in case_results]
        top1_trues = [1.0 if cr["top1_true"] else 0.0 for cr in case_results]
        top1_randoms_means = [
            (sum(1 for t in cr["top1_randoms"] if t) / len(cr["top1_randoms"]))
            if cr["top1_randoms"]
            else 0.0
            for cr in case_results
        ]
        ranks_true = [cr["rank_true"] for cr in case_results]
        ranks_random_means = [cr["mean_rank_random"] for cr in case_results]
        delta_ranks = [cr["delta_rank"] for cr in case_results]

        sorted_delta_mrr = sorted(delta_mrrs)
        n_d = len(sorted_delta_mrr)
        median_delta_mrr = (
            sorted_delta_mrr[n_d // 2]
            if n_d % 2 == 1
            else (sorted_delta_mrr[n_d // 2 - 1] + sorted_delta_mrr[n_d // 2]) / 2.0
        )

        result = {
            "n_cases": n,
            "K": K,
            "mean_mrr_true": sum(mrr_trues) / n,
            "mean_mrr_random": sum(mrr_randoms_means) / n,
            "mean_delta_mrr": sum(delta_mrrs) / n,
            "median_delta_mrr": median_delta_mrr,
            "mean_pairwise_win_rate": sum(pairwise_rates) / n,
            "top1_rate_true": sum(top1_trues) / n,
            "top1_rate_random": sum(top1_randoms_means) / n,
            "mean_rank_true": sum(ranks_true) / n,
            "mean_rank_random": sum(ranks_random_means) / n,
            "mean_delta_rank": sum(delta_ranks) / n,
            "delta_mrrs": delta_mrrs,
            "pairwise_win_rates": pairwise_rates,
            "ranks_true": ranks_true,
            "ranks_random": ranks_random_means,
        }

        # --- Layer 2B aggregate ---
        claims_true = [
            cr["claim_score_true"]
            for cr in case_results
            if cr.get("claim_score_true") is not None
        ]
        claims_random_all = [
            sum(cr["claim_scores_random"]) / len(cr["claim_scores_random"])
            for cr in case_results
            if cr.get("claim_scores_random")
        ]
        delta_claims = [
            cr["delta_claim"]
            for cr in case_results
            if cr.get("delta_claim") is not None
        ]

        if claims_true:
            result["mean_claim_true"] = sum(claims_true) / len(claims_true)
            result["mean_claim_random"] = (
                sum(claims_random_all) / len(claims_random_all)
                if claims_random_all
                else None
            )
            result["mean_delta_claim"] = (
                sum(delta_claims) / len(delta_claims) if delta_claims else None
            )
        else:
            result["mean_claim_true"] = None
            result["mean_claim_random"] = None
            result["mean_delta_claim"] = None

        return result
