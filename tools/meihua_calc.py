# -*- coding: utf-8 -*-
"""
梅花易數核心計算引擎

提供數字起卦、體用分析、變卦互卦計算等核心功能。
"""

import json
from pathlib import Path
from typing import Optional

# === 載入設定檔 ===
_CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"

with open(_CONFIG_DIR / "trigrams.json", "r", encoding="utf-8") as f:
    _TRIGRAMS_DATA = json.load(f)

with open(_CONFIG_DIR / "hexagrams.json", "r", encoding="utf-8") as f:
    _HEXAGRAMS_DATA = json.load(f)

_TRIGRAMS = _TRIGRAMS_DATA["trigrams"]
_NAME_TO_NUM = _TRIGRAMS_DATA["name_to_number"]
_HEXAGRAM_LOOKUP = _HEXAGRAMS_DATA["lookup"]

# === 五行生剋關係表 ===
_SHENG_CYCLE = {"木": "火", "火": "土", "土": "金", "金": "水", "水": "木"}
_KE_CYCLE = {"木": "土", "土": "水", "水": "火", "火": "金", "金": "木"}


def _trigram_num_to_name(num: int) -> str:
    """將卦數(1-8)轉換為卦名。"""
    return _TRIGRAMS[str(num)]["name"]


def _trigram_num_to_lines(num: int) -> list:
    """將卦數(1-8)轉換為爻線列表 [底, 中, 頂]。"""
    return list(_TRIGRAMS[str(num)]["lines"])


def _trigram_num_to_element(num: int) -> str:
    """將卦數(1-8)轉換為五行。"""
    return _TRIGRAMS[str(num)]["element"]


def lines_to_trigram_num(lines: list) -> int:
    """
    將三爻列表 [底, 中, 頂] (1=陽 0=陰) 轉換為先天八卦數。

    轉換公式: trigram_num = 8 - (bottom*4 + middle*2 + top)
    """
    bottom, middle, top = lines[0], lines[1], lines[2]
    val = bottom * 4 + middle * 2 + top
    return 8 - val


def hexagram_to_lines(upper_num: int, lower_num: int) -> list:
    """
    將上下卦數轉換為六爻列表 [底到頂]。

    下卦三爻在前(位置1-3), 上卦三爻在後(位置4-6)。
    """
    lower_lines = _trigram_num_to_lines(lower_num)
    upper_lines = _trigram_num_to_lines(upper_num)
    return lower_lines + upper_lines


def get_changed_trigram(trigram_num: int, line_position: int) -> int:
    """
    翻轉一個經卦中的某一爻, 得到變卦經卦。

    Args:
        trigram_num: 經卦數 (1-8)
        line_position: 爻位 (1-3, 1=底爻)

    Returns:
        變化後的經卦數 (1-8)
    """
    lines = _trigram_num_to_lines(trigram_num)
    idx = line_position - 1  # 轉為 0-indexed
    lines[idx] = 1 - lines[idx]  # 翻轉陰陽
    return lines_to_trigram_num(lines)


def get_mutual_hexagram(lines: list) -> tuple:
    """
    從六爻列表提取互卦。

    互卦下卦: 第2,3,4爻 (lines[1], lines[2], lines[3])
    互卦上卦: 第3,4,5爻 (lines[2], lines[3], lines[4])

    Args:
        lines: 六爻列表 [底到頂]

    Returns:
        (上卦數, 下卦數) tuple
    """
    lower_mutual = [lines[1], lines[2], lines[3]]
    upper_mutual = [lines[2], lines[3], lines[4]]
    return (lines_to_trigram_num(upper_mutual), lines_to_trigram_num(lower_mutual))


def get_element_relation(body_element: str, use_element: str) -> str:
    """
    計算體用五行關係。

    五行相生: 木生火, 火生土, 土生金, 金生水, 水生木
    五行相剋: 木剋土, 土剋水, 水剋火, 火剋金, 金剋木

    Returns:
        "用生體" | "體生用" | "體剋用" | "用剋體" | "體用比和"
    """
    if body_element == use_element:
        return "體用比和"
    if _SHENG_CYCLE.get(use_element) == body_element:
        return "用生體"
    if _SHENG_CYCLE.get(body_element) == use_element:
        return "體生用"
    if _KE_CYCLE.get(body_element) == use_element:
        return "體剋用"
    if _KE_CYCLE.get(use_element) == body_element:
        return "用剋體"
    # 不應走到這裡
    return "未知關係"


def _build_hexagram(upper_num: int, lower_num: int, moving_line: int,
                    n1: Optional[int] = None, n2: Optional[int] = None) -> dict:
    """
    從上下卦數和動爻位置建構完整卦象資料。

    Args:
        upper_num: 上卦數 (1-8)
        lower_num: 下卦數 (1-8)
        moving_line: 動爻位置 (1-6)
        n1: 原始數字1 (可選)
        n2: 原始數字2 (可選)

    Returns:
        完整的卦象字典
    """
    upper_name = _trigram_num_to_name(upper_num)
    lower_name = _trigram_num_to_name(lower_num)

    # 本卦
    hexagram_name = _HEXAGRAM_LOOKUP[upper_name][lower_name]["name"]

    # 六爻
    all_lines = hexagram_to_lines(upper_num, lower_num)

    # 體用判斷: 動爻在下卦(1-3)→下=用,上=體; 動爻在上卦(4-6)→上=用,下=體
    if moving_line <= 3:
        body_trigram_name = upper_name
        use_trigram_name = lower_name
        body_num = upper_num
        use_num = lower_num
        # 變卦: 翻轉下卦(用卦)中對應爻
        changed_use_num = get_changed_trigram(lower_num, moving_line)
        changed_upper_num = upper_num
        changed_lower_num = changed_use_num
    else:
        body_trigram_name = lower_name
        use_trigram_name = upper_name
        body_num = lower_num
        use_num = upper_num
        # 變卦: 翻轉上卦(用卦)中對應爻 (4→1, 5→2, 6→3)
        line_in_upper = moving_line - 3
        changed_use_num = get_changed_trigram(upper_num, line_in_upper)
        changed_upper_num = changed_use_num
        changed_lower_num = lower_num

    changed_upper_name = _trigram_num_to_name(changed_upper_num)
    changed_lower_name = _trigram_num_to_name(changed_lower_num)
    changed_hexagram_name = _HEXAGRAM_LOOKUP[changed_upper_name][changed_lower_name]["name"]
    changed_use_trigram_name = _trigram_num_to_name(changed_use_num)

    # 互卦
    mutual_upper_num, mutual_lower_num = get_mutual_hexagram(all_lines)
    mutual_upper_name = _trigram_num_to_name(mutual_upper_num)
    mutual_lower_name = _trigram_num_to_name(mutual_lower_num)
    mutual_hexagram_name = _HEXAGRAM_LOOKUP[mutual_upper_name][mutual_lower_name]["name"]

    # 五行
    body_element = _trigram_num_to_element(body_num)
    use_element = _trigram_num_to_element(use_num)
    element_relation = get_element_relation(body_element, use_element)

    return {
        "n1": n1,
        "n2": n2,
        "upper_trigram_num": upper_num,
        "lower_trigram_num": lower_num,
        "upper_trigram_name": upper_name,
        "lower_trigram_name": lower_name,
        "moving_line": moving_line,
        "body_trigram_name": body_trigram_name,
        "use_trigram_name": use_trigram_name,
        "hexagram_name": hexagram_name,
        "changed_hexagram_name": changed_hexagram_name,
        "changed_use_trigram_name": changed_use_trigram_name,
        "mutual_hexagram_name": mutual_hexagram_name,
        "mutual_upper_trigram_name": mutual_upper_name,
        "mutual_lower_trigram_name": mutual_lower_name,
        "body_element": body_element,
        "use_element": use_element,
        "element_relation": element_relation,
        "all_lines": all_lines,
    }


def numbers_to_hexagram(n1: int, n2: int) -> dict:
    """
    將兩個數字轉換為完整卦象資料。

    起卦規則:
    - 上卦: n1 % 8 (結果為0則取8)
    - 下卦: n2 % 8 (結果為0則取8)
    - 動爻: (n1 + n2) % 6 (結果為0則取6)

    體用判斷:
    - 動爻 1,2,3 → 下卦=用, 上卦=體
    - 動爻 4,5,6 → 上卦=用, 下卦=體

    Args:
        n1: 第一個數字 (正整數)
        n2: 第二個數字 (正整數)

    Returns:
        包含本卦、變卦、互卦、體用五行關係的完整字典
    """
    upper_num = n1 % 8
    if upper_num == 0:
        upper_num = 8
    lower_num = n2 % 8
    if lower_num == 0:
        lower_num = 8
    moving_line = (n1 + n2) % 6
    if moving_line == 0:
        moving_line = 6

    return _build_hexagram(upper_num, lower_num, moving_line, n1=n1, n2=n2)


def get_six_candidates(body_trigram: str, use_trigram: str) -> list:
    """
    給定體卦和用卦名稱, 產生六個候選卦象。

    C1-C3: upper=體, lower=用, 動爻=1,2,3 (動爻在下卦=用卦)
    C4-C6: upper=用, lower=體, 動爻=4,5,6 (動爻在上卦=用卦)

    Args:
        body_trigram: 體卦名稱 (如 "乾")
        use_trigram: 用卦名稱 (如 "坎")

    Returns:
        六個候選卦象字典的列表
    """
    body_num = _NAME_TO_NUM[body_trigram]
    use_num = _NAME_TO_NUM[use_trigram]

    candidates = []

    # C1-C3: upper=body, lower=use, moving=1,2,3
    for moving in range(1, 4):
        result = _build_hexagram(body_num, use_num, moving)
        result["candidate_id"] = f"C{moving}"
        candidates.append(result)

    # C4-C6: upper=use, lower=body, moving=4,5,6
    for moving in range(4, 7):
        result = _build_hexagram(use_num, body_num, moving)
        result["candidate_id"] = f"C{moving}"
        candidates.append(result)

    return candidates
