# -*- coding: utf-8 -*-
"""
隨機卦象生成器測試

涵蓋: 程序匹配隨機、結構均勻隨機的正確性與約束條件。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.meihua_calc import numbers_to_hexagram
from tools.random_hexagram import (
    generate_procedure_matched_random,
    generate_structure_uniform_random,
)


def _hexagram_sig(h: dict) -> tuple:
    """取得卦象簽名 (本卦名, 動爻)。"""
    return (h["hexagram_name"], h["moving_line"])


# ============================================================
# 1. 程序匹配隨機 (procedure-matched)
# ============================================================

class TestProcedureMatchedRandom:
    """測試程序匹配隨機生成器。"""

    def test_generates_correct_count(self):
        """生成指定數量的隨機卦象。"""
        true_hex = numbers_to_hexagram(5, 3)
        randoms = generate_procedure_matched_random(5, true_hex, seed=42)
        assert len(randoms) == 5

    def test_no_duplicate_with_true(self):
        """隨機卦象不與真實卦象重複 (本卦+動爻)。"""
        true_hex = numbers_to_hexagram(5, 3)
        true_sig = _hexagram_sig(true_hex)
        randoms = generate_procedure_matched_random(20, true_hex, seed=42)
        for r in randoms:
            assert _hexagram_sig(r) != true_sig, \
                "隨機卦象不應與真實卦象的本卦+動爻相同"

    def test_no_duplicates_among_randoms(self):
        """隨機卦象批次內無重複 (本卦+動爻)。"""
        true_hex = numbers_to_hexagram(5, 3)
        randoms = generate_procedure_matched_random(20, true_hex, seed=42)
        sigs = [_hexagram_sig(r) for r in randoms]
        assert len(sigs) == len(set(sigs)), \
            "隨機卦象批次內不應有重複"

    def test_n1_n2_in_range(self):
        """程序匹配隨機的 n1, n2 應在 1-999 範圍。"""
        true_hex = numbers_to_hexagram(5, 3)
        randoms = generate_procedure_matched_random(10, true_hex, seed=42)
        for r in randoms:
            assert 1 <= r["n1"] <= 999, f"n1={r['n1']} 超出範圍"
            assert 1 <= r["n2"] <= 999, f"n2={r['n2']} 超出範圍"

    def test_has_all_required_keys(self):
        """隨機卦象包含所有必要欄位。"""
        true_hex = numbers_to_hexagram(5, 3)
        randoms = generate_procedure_matched_random(3, true_hex, seed=42)
        required_keys = {
            "n1", "n2",
            "upper_trigram_num", "lower_trigram_num",
            "upper_trigram_name", "lower_trigram_name",
            "moving_line", "body_trigram_name", "use_trigram_name",
            "hexagram_name", "changed_hexagram_name",
            "changed_use_trigram_name",
            "mutual_hexagram_name",
            "body_element", "use_element", "element_relation",
            "all_lines",
        }
        for r in randoms:
            for key in required_keys:
                assert key in r, f"隨機卦象缺少欄位: {key}"

    def test_seed_reproducibility(self):
        """相同種子產生相同結果。"""
        true_hex = numbers_to_hexagram(5, 3)
        run1 = generate_procedure_matched_random(5, true_hex, seed=123)
        run2 = generate_procedure_matched_random(5, true_hex, seed=123)
        for r1, r2 in zip(run1, run2):
            assert _hexagram_sig(r1) == _hexagram_sig(r2)

    def test_different_seeds_differ(self):
        """不同種子產生不同結果。"""
        true_hex = numbers_to_hexagram(5, 3)
        run1 = generate_procedure_matched_random(10, true_hex, seed=1)
        run2 = generate_procedure_matched_random(10, true_hex, seed=2)
        sigs1 = set(_hexagram_sig(r) for r in run1)
        sigs2 = set(_hexagram_sig(r) for r in run2)
        # 不太可能完全相同
        assert sigs1 != sigs2


# ============================================================
# 2. 結構均勻隨機 (structure-uniform)
# ============================================================

class TestStructureUniformRandom:
    """測試結構均勻隨機生成器。"""

    def test_generates_correct_count(self):
        """生成指定數量的隨機卦象。"""
        true_hex = numbers_to_hexagram(1, 1)
        randoms = generate_structure_uniform_random(10, true_hex, seed=42)
        assert len(randoms) == 10

    def test_no_duplicate_with_true(self):
        """隨機卦象不與真實卦象重複。"""
        true_hex = numbers_to_hexagram(1, 1)
        true_combo = (
            true_hex["upper_trigram_num"],
            true_hex["lower_trigram_num"],
            true_hex["moving_line"],
        )
        randoms = generate_structure_uniform_random(50, true_hex, seed=42)
        for r in randoms:
            combo = (r["upper_trigram_num"], r["lower_trigram_num"], r["moving_line"])
            assert combo != true_combo, \
                "不應與真實卦象的(上卦, 下卦, 動爻)相同"

    def test_no_duplicates_among_randoms(self):
        """批次內無重複 (上卦+下卦+動爻)。"""
        true_hex = numbers_to_hexagram(1, 1)
        randoms = generate_structure_uniform_random(50, true_hex, seed=42)
        combos = [
            (r["upper_trigram_num"], r["lower_trigram_num"], r["moving_line"])
            for r in randoms
        ]
        assert len(combos) == len(set(combos)), \
            "批次內不應有重複"

    def test_max_383(self):
        """最多可生成383個 (384-1 排除真實)。"""
        true_hex = numbers_to_hexagram(1, 1)
        randoms = generate_structure_uniform_random(383, true_hex, seed=42)
        assert len(randoms) == 383

    def test_request_more_than_available(self):
        """要求超過383個時, 最多返回383個。"""
        true_hex = numbers_to_hexagram(1, 1)
        randoms = generate_structure_uniform_random(500, true_hex, seed=42)
        assert len(randoms) == 383

    def test_has_all_required_keys(self):
        """隨機卦象包含所有必要欄位。"""
        true_hex = numbers_to_hexagram(5, 3)
        randoms = generate_structure_uniform_random(3, true_hex, seed=42)
        required_keys = {
            "upper_trigram_num", "lower_trigram_num",
            "upper_trigram_name", "lower_trigram_name",
            "moving_line", "body_trigram_name", "use_trigram_name",
            "hexagram_name", "changed_hexagram_name",
            "changed_use_trigram_name",
            "mutual_hexagram_name",
            "body_element", "use_element", "element_relation",
            "all_lines",
        }
        for r in randoms:
            for key in required_keys:
                assert key in r, f"隨機卦象缺少欄位: {key}"

    def test_seed_reproducibility(self):
        """相同種子產生相同結果。"""
        true_hex = numbers_to_hexagram(5, 3)
        run1 = generate_structure_uniform_random(10, true_hex, seed=99)
        run2 = generate_structure_uniform_random(10, true_hex, seed=99)
        for r1, r2 in zip(run1, run2):
            assert r1["upper_trigram_num"] == r2["upper_trigram_num"]
            assert r1["lower_trigram_num"] == r2["lower_trigram_num"]
            assert r1["moving_line"] == r2["moving_line"]

    def test_valid_element_relations(self):
        """所有生成的卦象五行關係都是有效值。"""
        true_hex = numbers_to_hexagram(2, 5)
        randoms = generate_structure_uniform_random(30, true_hex, seed=42)
        valid = {"用生體", "體生用", "體剋用", "用剋體", "體用比和"}
        for r in randoms:
            assert r["element_relation"] in valid

    def test_moving_line_range(self):
        """所有動爻位置在 1-6 範圍內。"""
        true_hex = numbers_to_hexagram(3, 7)
        randoms = generate_structure_uniform_random(50, true_hex, seed=42)
        for r in randoms:
            assert 1 <= r["moving_line"] <= 6

    def test_trigram_num_range(self):
        """所有卦數在 1-8 範圍內。"""
        true_hex = numbers_to_hexagram(3, 7)
        randoms = generate_structure_uniform_random(50, true_hex, seed=42)
        for r in randoms:
            assert 1 <= r["upper_trigram_num"] <= 8
            assert 1 <= r["lower_trigram_num"] <= 8
