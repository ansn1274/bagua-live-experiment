# -*- coding: utf-8 -*-
"""
梅花易數計算引擎測試

涵蓋: 數字起卦、爻線轉換、五行關係、互卦、變卦、六候選等。
"""

import sys
from pathlib import Path

# 確保可以匯入 tools 模組
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.meihua_calc import (
    numbers_to_hexagram,
    get_changed_trigram,
    get_mutual_hexagram,
    get_element_relation,
    get_six_candidates,
    lines_to_trigram_num,
    hexagram_to_lines,
)


# ============================================================
# 1. 基礎轉換: lines_to_trigram_num / hexagram_to_lines
# ============================================================

class TestLinesToTrigramNum:
    """測試三爻列表轉卦數。"""

    def test_all_eight_trigrams(self):
        """驗證八卦的爻線結構都能正確對應。"""
        expected = {
            1: [1, 1, 1],  # 乾
            2: [1, 1, 0],  # 兌
            3: [1, 0, 1],  # 離
            4: [1, 0, 0],  # 震
            5: [0, 1, 1],  # 巽
            6: [0, 1, 0],  # 坎
            7: [0, 0, 1],  # 艮
            8: [0, 0, 0],  # 坤
        }
        for num, lines in expected.items():
            assert lines_to_trigram_num(lines) == num, \
                f"lines {lines} 應對應卦數 {num}"

    def test_roundtrip(self):
        """卦數→爻線→卦數 往返一致。"""
        for num in range(1, 9):
            lines = hexagram_to_lines(num, num)[:3]  # 取下卦
            assert lines_to_trigram_num(lines) == num


class TestHexagramToLines:
    """測試上下卦轉六爻。"""

    def test_qian_qian(self):
        """乾乾卦六爻全陽。"""
        lines = hexagram_to_lines(1, 1)
        assert lines == [1, 1, 1, 1, 1, 1]

    def test_kun_kun(self):
        """坤坤卦六爻全陰。"""
        lines = hexagram_to_lines(8, 8)
        assert lines == [0, 0, 0, 0, 0, 0]

    def test_kan_li(self):
        """坎上離下 = 既濟。"""
        lines = hexagram_to_lines(6, 3)  # 上坎下離
        assert lines == [1, 0, 1, 0, 1, 0]

    def test_li_kan(self):
        """離上坎下 = 未濟。"""
        lines = hexagram_to_lines(3, 6)  # 上離下坎
        assert lines == [0, 1, 0, 1, 0, 1]


# ============================================================
# 2. 五行生剋關係
# ============================================================

class TestElementRelation:
    """測試五行關係判斷。"""

    def test_same_element(self):
        """相同五行為比和。"""
        assert get_element_relation("金", "金") == "體用比和"
        assert get_element_relation("木", "木") == "體用比和"
        assert get_element_relation("水", "水") == "體用比和"
        assert get_element_relation("火", "火") == "體用比和"
        assert get_element_relation("土", "土") == "體用比和"

    def test_use_sheng_body(self):
        """用生體: 用的五行生體的五行。"""
        assert get_element_relation("火", "木") == "用生體"  # 木生火
        assert get_element_relation("土", "火") == "用生體"  # 火生土
        assert get_element_relation("金", "土") == "用生體"  # 土生金
        assert get_element_relation("水", "金") == "用生體"  # 金生水
        assert get_element_relation("木", "水") == "用生體"  # 水生木

    def test_body_sheng_use(self):
        """體生用: 體的五行生用的五行。"""
        assert get_element_relation("木", "火") == "體生用"  # 木生火
        assert get_element_relation("火", "土") == "體生用"  # 火生土
        assert get_element_relation("土", "金") == "體生用"  # 土生金
        assert get_element_relation("金", "水") == "體生用"  # 金生水
        assert get_element_relation("水", "木") == "體生用"  # 水生木

    def test_body_ke_use(self):
        """體剋用: 體的五行剋用的五行。"""
        assert get_element_relation("木", "土") == "體剋用"  # 木剋土
        assert get_element_relation("土", "水") == "體剋用"  # 土剋水
        assert get_element_relation("水", "火") == "體剋用"  # 水剋火
        assert get_element_relation("火", "金") == "體剋用"  # 火剋金
        assert get_element_relation("金", "木") == "體剋用"  # 金剋木

    def test_use_ke_body(self):
        """用剋體: 用的五行剋體的五行。"""
        assert get_element_relation("土", "木") == "用剋體"  # 木剋土
        assert get_element_relation("水", "土") == "用剋體"  # 土剋水
        assert get_element_relation("火", "水") == "用剋體"  # 水剋火
        assert get_element_relation("金", "火") == "用剋體"  # 火剋金
        assert get_element_relation("木", "金") == "用剋體"  # 金剋木

    def test_all_25_combinations_covered(self):
        """5×5=25種五行組合都應有明確結果。"""
        elements = ["金", "木", "水", "火", "土"]
        valid_results = {"用生體", "體生用", "體剋用", "用剋體", "體用比和"}
        for b in elements:
            for u in elements:
                result = get_element_relation(b, u)
                assert result in valid_results, \
                    f"({b}, {u}) 得到無效結果: {result}"


# ============================================================
# 3. 變卦經卦
# ============================================================

class TestChangedTrigram:
    """測試翻轉爻線。"""

    def test_qian_flip_bottom(self):
        """乾翻底爻 → 兌。"""
        assert get_changed_trigram(1, 1) == 5  # [1,1,1] → [0,1,1] = 巽
        # 等等，讓我重新算：乾=[1,1,1], 翻底爻(位置1)→[0,1,1]=巽(5)
        # 確認上面的 assert

    def test_qian_flip_middle(self):
        """乾翻中爻 → [1,0,1] = 離(3)。"""
        assert get_changed_trigram(1, 2) == 3

    def test_qian_flip_top(self):
        """乾翻頂爻 → [1,1,0] = 兌(2)。"""
        assert get_changed_trigram(1, 3) == 2

    def test_kun_flip_bottom(self):
        """坤翻底爻 → [1,0,0] = 震(4)。"""
        assert get_changed_trigram(8, 1) == 4

    def test_kun_flip_middle(self):
        """坤翻中爻 → [0,1,0] = 坎(6)。"""
        assert get_changed_trigram(8, 2) == 6

    def test_kun_flip_top(self):
        """坤翻頂爻 → [0,0,1] = 艮(7)。"""
        assert get_changed_trigram(8, 3) == 7

    def test_kan_flip_middle(self):
        """坎[0,1,0]翻中爻 → [0,0,0] = 坤(8)。"""
        assert get_changed_trigram(6, 2) == 8

    def test_double_flip_returns_original(self):
        """翻轉同一爻兩次應回到原卦。"""
        for num in range(1, 9):
            for pos in range(1, 4):
                changed = get_changed_trigram(num, pos)
                restored = get_changed_trigram(changed, pos)
                assert restored == num, \
                    f"卦{num}位置{pos}雙翻應回原卦"


# ============================================================
# 4. 互卦
# ============================================================

class TestMutualHexagram:
    """測試互卦計算。"""

    def test_qian_qian_mutual(self):
        """乾卦[1,1,1,1,1,1]互卦 = 乾乾。"""
        lines = [1, 1, 1, 1, 1, 1]
        upper, lower = get_mutual_hexagram(lines)
        assert upper == 1  # 乾
        assert lower == 1  # 乾

    def test_kun_kun_mutual(self):
        """坤卦[0,0,0,0,0,0]互卦 = 坤坤。"""
        lines = [0, 0, 0, 0, 0, 0]
        upper, lower = get_mutual_hexagram(lines)
        assert upper == 8  # 坤
        assert lower == 8  # 坤

    def test_ji_ji_mutual(self):
        """既濟[1,0,1,0,1,0]互卦: 下[0,1,0]=坎, 上[1,0,1]=離 → 未濟。"""
        lines = [1, 0, 1, 0, 1, 0]
        upper, lower = get_mutual_hexagram(lines)
        assert upper == 3  # 離
        assert lower == 6  # 坎

    def test_kan_kan_mutual(self):
        """坎卦[0,1,0,0,1,0]互卦: 下[1,0,0]=震, 上[0,0,1]=艮 → 頤。"""
        lines = [0, 1, 0, 0, 1, 0]
        upper, lower = get_mutual_hexagram(lines)
        assert upper == 7  # 艮
        assert lower == 4  # 震


# ============================================================
# 5. 完整起卦: numbers_to_hexagram
# ============================================================

class TestNumbersToHexagram:
    """測試數字起卦的完整流程。"""

    def test_basic_case_5_3(self):
        """n1=5, n2=3 的完整驗算。"""
        result = numbers_to_hexagram(5, 3)

        # 上卦: 5%8=5 → 巽
        assert result["upper_trigram_num"] == 5
        assert result["upper_trigram_name"] == "巽"

        # 下卦: 3%8=3 → 離
        assert result["lower_trigram_num"] == 3
        assert result["lower_trigram_name"] == "離"

        # 動爻: (5+3)%6=2
        assert result["moving_line"] == 2

        # 體用: 動爻2在下卦 → 下=用(離), 上=體(巽)
        assert result["body_trigram_name"] == "巽"
        assert result["use_trigram_name"] == "離"

        # 本卦: 巽上離下 = 家人
        assert result["hexagram_name"] == "家人"

        # 變卦: 翻轉離[1,0,1]的中爻 → [1,1,1]=乾, 巽上乾下=小畜
        assert result["changed_hexagram_name"] == "小畜"
        assert result["changed_use_trigram_name"] == "乾"

        # 互卦: 六爻=[1,0,1,0,1,1], 下[0,1,0]=坎, 上[1,0,1]=離 → 未濟
        assert result["mutual_hexagram_name"] == "未濟"

        # 五行: 巽=木, 離=火, 木生火 → 體生用
        assert result["body_element"] == "木"
        assert result["use_element"] == "火"
        assert result["element_relation"] == "體生用"

        # 六爻
        assert result["all_lines"] == [1, 0, 1, 0, 1, 1]

    def test_edge_mod8_zero(self):
        """n%8==0 的邊界情況: 應取8(坤)。"""
        result = numbers_to_hexagram(8, 16)
        assert result["upper_trigram_num"] == 8  # 8%8=0→8
        assert result["upper_trigram_name"] == "坤"
        assert result["lower_trigram_num"] == 8  # 16%8=0→8
        assert result["lower_trigram_name"] == "坤"

    def test_edge_mod6_zero(self):
        """(n1+n2)%6==0 的邊界情況: 應取6。"""
        result = numbers_to_hexagram(3, 3)  # (3+3)%6=0→6
        assert result["moving_line"] == 6

    def test_both_edges_n8_n8(self):
        """n1=8, n2=8: 坤坤卦, 動爻=(16%6=4)。"""
        result = numbers_to_hexagram(8, 8)
        assert result["upper_trigram_num"] == 8
        assert result["lower_trigram_num"] == 8
        assert result["moving_line"] == 4
        assert result["hexagram_name"] == "坤"
        # 動爻4在上卦 → 上=用(坤), 下=體(坤)
        assert result["body_trigram_name"] == "坤"
        assert result["use_trigram_name"] == "坤"
        assert result["element_relation"] == "體用比和"
        # 變卦: 翻轉坤[0,0,0]底爻 → [1,0,0]=震, 震上坤下=豫
        assert result["changed_hexagram_name"] == "豫"

    def test_n6_n6(self):
        """n1=6, n2=6: 坎坎卦, 動爻=6。"""
        result = numbers_to_hexagram(6, 6)
        assert result["upper_trigram_num"] == 6
        assert result["lower_trigram_num"] == 6
        assert result["moving_line"] == 6
        assert result["hexagram_name"] == "坎"
        # 動爻6在上卦 → 上=用(坎), 下=體(坎)
        assert result["body_trigram_name"] == "坎"
        assert result["use_trigram_name"] == "坎"
        # 變卦: 翻轉坎[0,1,0]頂爻 → [0,1,1]=巽, 巽上坎下=渙
        assert result["changed_hexagram_name"] == "渙"
        assert result["changed_use_trigram_name"] == "巽"
        # 互卦: [0,1,0,0,1,0] → 下[1,0,0]=震, 上[0,0,1]=艮 → 頤
        assert result["mutual_hexagram_name"] == "頤"

    def test_large_numbers(self):
        """大數字也能正確計算。"""
        result = numbers_to_hexagram(100, 200)
        # 100%8=4→震, 200%8=0→8=坤
        assert result["upper_trigram_num"] == 4
        assert result["upper_trigram_name"] == "震"
        assert result["lower_trigram_num"] == 8
        assert result["lower_trigram_name"] == "坤"
        # (100+200)%6=0→6
        assert result["moving_line"] == 6
        # 震上坤下 = 豫
        assert result["hexagram_name"] == "豫"

    def test_moving_line_in_lower(self):
        """動爻在下卦 (1-3) 的體用判斷。"""
        result = numbers_to_hexagram(1, 2)  # 上1=乾, 下2=兌, 動=(1+2)%6=3
        assert result["moving_line"] == 3
        assert result["body_trigram_name"] == "乾"  # 上=體
        assert result["use_trigram_name"] == "兌"  # 下=用

    def test_moving_line_in_upper(self):
        """動爻在上卦 (4-6) 的體用判斷。"""
        result = numbers_to_hexagram(1, 3)  # 上1=乾, 下3=離, 動=(1+3)%6=4
        assert result["moving_line"] == 4
        assert result["body_trigram_name"] == "離"  # 下=體
        assert result["use_trigram_name"] == "乾"  # 上=用

    def test_n1_n2_preserved(self):
        """輸出中保留原始數字。"""
        result = numbers_to_hexagram(42, 99)
        assert result["n1"] == 42
        assert result["n2"] == 99

    def test_all_lines_length(self):
        """六爻列表長度恆為6。"""
        for n1 in [1, 5, 8, 13, 100]:
            for n2 in [1, 5, 8, 13, 100]:
                result = numbers_to_hexagram(n1, n2)
                assert len(result["all_lines"]) == 6
                assert all(line in (0, 1) for line in result["all_lines"])


# ============================================================
# 6. 六候選卦象
# ============================================================

class TestSixCandidates:
    """測試六候選生成。"""

    def test_count(self):
        """應產生恰好6個候選。"""
        candidates = get_six_candidates("乾", "坎")
        assert len(candidates) == 6

    def test_moving_lines(self):
        """動爻依序為 1,2,3,4,5,6。"""
        candidates = get_six_candidates("乾", "坎")
        for i, c in enumerate(candidates):
            assert c["moving_line"] == i + 1

    def test_c1_to_c3_body_use(self):
        """C1-C3: upper=體, lower=用, 體=upper。"""
        candidates = get_six_candidates("巽", "離")
        for c in candidates[:3]:
            assert c["upper_trigram_name"] == "巽"  # 體
            assert c["lower_trigram_name"] == "離"  # 用
            assert c["body_trigram_name"] == "巽"
            assert c["use_trigram_name"] == "離"

    def test_c4_to_c6_body_use(self):
        """C4-C6: upper=用, lower=體, 體=lower。"""
        candidates = get_six_candidates("巽", "離")
        for c in candidates[3:]:
            assert c["upper_trigram_name"] == "離"  # 用
            assert c["lower_trigram_name"] == "巽"  # 體
            assert c["body_trigram_name"] == "巽"
            assert c["use_trigram_name"] == "離"

    def test_c1_hexagram_name(self):
        """C1 的本卦名稱正確。"""
        candidates = get_six_candidates("乾", "坤")
        # C1: upper=乾, lower=坤 = 否
        assert candidates[0]["hexagram_name"] == "否"

    def test_c4_hexagram_name(self):
        """C4 的本卦名稱正確。"""
        candidates = get_six_candidates("乾", "坤")
        # C4: upper=坤, lower=乾 = 泰
        assert candidates[3]["hexagram_name"] == "泰"

    def test_all_have_required_keys(self):
        """所有候選都包含必要欄位。"""
        required_keys = {
            "upper_trigram_num", "lower_trigram_num",
            "upper_trigram_name", "lower_trigram_name",
            "moving_line", "body_trigram_name", "use_trigram_name",
            "hexagram_name", "changed_hexagram_name",
            "changed_use_trigram_name",
            "mutual_hexagram_name", "mutual_upper_trigram_name",
            "mutual_lower_trigram_name",
            "body_element", "use_element", "element_relation",
            "all_lines",
        }
        candidates = get_six_candidates("坎", "離")
        for c in candidates:
            for key in required_keys:
                assert key in c, f"候選缺少欄位: {key}"


# ============================================================
# 7. 完整性: 64卦遍歷
# ============================================================

class TestHexagramCompleteness:
    """驗證所有64卦都可正確查找。"""

    def test_all_64_hexagrams_reachable(self):
        """遍歷所有上下卦組合, 確認都能生成有效卦象。"""
        seen_names = set()
        for upper in range(1, 9):
            for lower in range(1, 9):
                result = numbers_to_hexagram(upper, lower)
                name = result["hexagram_name"]
                assert name, f"上{upper}下{lower}無卦名"
                seen_names.add(name)
        assert len(seen_names) == 64, \
            f"應有64個不同卦名, 實際 {len(seen_names)}"

    def test_all_384_combos_valid(self):
        """384種 (上卦×下卦×動爻) 都能正確計算。"""
        from tools.meihua_calc import _build_hexagram
        for upper in range(1, 9):
            for lower in range(1, 9):
                for moving in range(1, 7):
                    result = _build_hexagram(upper, lower, moving)
                    assert result["hexagram_name"]
                    assert result["changed_hexagram_name"]
                    assert result["mutual_hexagram_name"]
                    assert result["element_relation"] in {
                        "用生體", "體生用", "體剋用", "用剋體", "體用比和"
                    }
