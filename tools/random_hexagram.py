# -*- coding: utf-8 -*-
"""
隨機卦象生成器

提供兩種隨機生成方式:
1. 程序匹配隨機 (procedure-matched): 模擬真實起卦流程
2. 結構均勻隨機 (structure-uniform): 從384種組合中均勻抽樣
"""

import random
from typing import Optional

from .meihua_calc import numbers_to_hexagram, _build_hexagram


def _hexagram_signature(hexagram: dict) -> tuple:
    """取得卦象的唯一識別簽名 (本卦名 + 動爻)。"""
    return (hexagram["hexagram_name"], hexagram["moving_line"])


def generate_procedure_matched_random(K: int, true_hexagram: dict,
                                       seed: Optional[int] = None) -> list:
    """
    生成 K 個程序匹配的隨機卦象。

    流程:
    1. 隨機取 fake_n1 = randint(1, 999)
    2. 隨機取 fake_n2 = randint(1, 999)
    3. 使用相同規則轉換為卦象
    4. 若本卦+動爻與真實卦象相同, 重新抽取
    5. 若本卦+動爻與批次中其他隨機卦象相同, 重新抽取

    Args:
        K: 要生成的隨機卦象數量
        true_hexagram: 真實卦象字典 (numbers_to_hexagram 的輸出)
        seed: 隨機種子 (可選, 用於重現性)

    Returns:
        K 個卦象字典的列表
    """
    if seed is not None:
        random.seed(seed)

    true_sig = _hexagram_signature(true_hexagram)
    results = []
    used_sigs = set()
    used_sigs.add(true_sig)

    max_attempts = K * 100  # 防止無限迴圈
    attempts = 0

    while len(results) < K and attempts < max_attempts:
        attempts += 1
        fake_n1 = random.randint(1, 999)
        fake_n2 = random.randint(1, 999)
        hexagram = numbers_to_hexagram(fake_n1, fake_n2)
        sig = _hexagram_signature(hexagram)

        if sig in used_sigs:
            continue

        used_sigs.add(sig)
        results.append(hexagram)

    return results


def generate_structure_uniform_random(K: int, true_hexagram: dict,
                                       seed: Optional[int] = None) -> list:
    """
    從384種可能的 (本卦+動爻) 組合中均勻抽樣。

    384 = 8(上卦) × 8(下卦) × 6(動爻)
    排除真實卦象, 確保批次內無重複。

    Args:
        K: 要生成的隨機卦象數量 (K <= 383)
        true_hexagram: 真實卦象字典
        seed: 隨機種子 (可選)

    Returns:
        K 個卦象字典的列表
    """
    if seed is not None:
        random.seed(seed)

    # 建構所有384種組合
    all_combos = []
    for upper in range(1, 9):
        for lower in range(1, 9):
            for moving in range(1, 7):
                all_combos.append((upper, lower, moving))

    # 排除真實卦象
    true_combo = (
        true_hexagram["upper_trigram_num"],
        true_hexagram["lower_trigram_num"],
        true_hexagram["moving_line"],
    )
    available = [c for c in all_combos if c != true_combo]

    # 均勻抽樣
    selected = random.sample(available, min(K, len(available)))

    results = []
    for upper_num, lower_num, moving_line in selected:
        hexagram = _build_hexagram(upper_num, lower_num, moving_line)
        results.append(hexagram)

    return results
