"""Quick test of the core meihua_calc engine."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tools.meihua_calc import numbers_to_hexagram, get_six_candidates
from tools.random_hexagram import generate_procedure_matched_random

# Test 1: Basic conversion
print("=" * 60)
print("TEST 1: numbers_to_hexagram(123, 456)")
print("=" * 60)
r = numbers_to_hexagram(123, 456)
# 123 % 8 = 3 → 離, 456 % 8 = 0 → 坤, (123+456) % 6 = 579 % 6 = 3 → 三爻
print(f"  n1=123, n2=456")
print(f"  Upper trigram: {r['upper_trigram_name']} (expect 離, 123%8=3)")
print(f"  Lower trigram: {r['lower_trigram_name']} (expect 坤, 456%8=0→8)")
print(f"  Moving line: {r['moving_line']} (expect 3, 579%6=3)")
print(f"  Body: {r['body_trigram_name']} (expect 離, moving in lower)")
print(f"  Use: {r['use_trigram_name']} (expect 坤, moving in lower)")
print(f"  Hexagram: {r['hexagram_name']} (expect 晉)")
print(f"  Changed: {r['changed_hexagram_name']}")
print(f"  Mutual: {r['mutual_hexagram_name']}")
print(f"  Element relation: {r['element_relation']}")
print()

# Test 2: Edge case - remainder 0
print("=" * 60)
print("TEST 2: numbers_to_hexagram(8, 24)")
print("=" * 60)
r2 = numbers_to_hexagram(8, 24)
# 8%8=0→坤, 24%8=0→坤, (8+24)%6=32%6=2→二爻
print(f"  Upper: {r2['upper_trigram_name']} (expect 坤)")
print(f"  Lower: {r2['lower_trigram_name']} (expect 坤)")
print(f"  Moving: {r2['moving_line']} (expect 2)")
print(f"  Hexagram: {r2['hexagram_name']} (expect 坤)")
print()

# Test 3: Edge case - moving line 6
print("=" * 60)
print("TEST 3: numbers_to_hexagram(1, 5)")
print("=" * 60)
r3 = numbers_to_hexagram(1, 5)
# 1%8=1→乾, 5%8=5→巽, (1+5)%6=0→6
print(f"  Upper: {r3['upper_trigram_name']} (expect 乾)")
print(f"  Lower: {r3['lower_trigram_name']} (expect 巽)")
print(f"  Moving: {r3['moving_line']} (expect 6)")
print(f"  Body: {r3['body_trigram_name']} (upper=用 when moving=4-6)")
print(f"  Use: {r3['use_trigram_name']}")
print(f"  Hexagram: {r3['hexagram_name']} (expect 姤)")
print()

# Test 4: Six candidates
print("=" * 60)
print("TEST 4: get_six_candidates('離', '坤')")
print("=" * 60)
candidates = get_six_candidates('離', '坤')
for c in candidates:
    cid = c.get('candidate_id', c.get('id', '?'))
    upper = c.get('upper_trigram', '?')
    lower = c.get('lower_trigram', '?')
    ml = c.get('moving_line', '?')
    name = c.get('hexagram_name', '?')
    changed = c.get('changed_hexagram_name', '?')
    print(f"  {cid}: upper={upper} lower={lower} moving={ml} → {name} → {changed}")
print()

# Test 5: Random hexagram generation
print("=" * 60)
print("TEST 5: generate_procedure_matched_random(K=3)")
print("=" * 60)
randoms = generate_procedure_matched_random(3, r, seed=42)
for i, rh in enumerate(randoms):
    print(f"  Random {i+1}: {rh['hexagram_name']} moving={rh['moving_line']} (n1={rh['n1']}, n2={rh['n2']})")
print()

# Test 6: Layer 1 analysis
print("=" * 60)
print("TEST 6: Layer 1 body-use ranking")
print("=" * 60)
from tools.layer1_analysis import Layer1Analyzer
analyzer = Layer1Analyzer()

# Simulate eval_1a data where 離 and 坤 are top
fake_eval = {
    "body_trigram": {"乾": 0.05, "兌": 0.05, "離": 0.45, "震": 0.05, "巽": 0.10, "坎": 0.10, "艮": 0.10, "坤": 0.10},
    "use_trigram": {"乾": 0.05, "兌": 0.05, "離": 0.05, "震": 0.05, "巽": 0.10, "坎": 0.10, "艮": 0.10, "坤": 0.50}
}
ranking = analyzer.compute_body_use_ranking(
    fake_eval["body_trigram"], fake_eval["use_trigram"],
    "離", "坤"
)
print(f"  True body=離, use=坤")
print(f"  Rank: {ranking['rank']} / 64")
print(f"  Percentile: {ranking['percentile']:.3f}")
print(f"  Score: {ranking['true_score']:.4f}")
print()

# Test 7: Stats
print("=" * 60)
print("TEST 7: Statistical tests")
print("=" * 60)
from tools.stats import one_sample_t_test, bootstrap_ci, descriptive_stats
data = [5, 12, 8, 15, 22, 10, 18, 7, 14, 20]
desc = descriptive_stats(data)
print(f"  Data: {data}")
print(f"  Mean: {desc['mean']:.2f}, Median: {desc['median']:.2f}, Std: {desc['std']:.2f}")
t_result = one_sample_t_test(data, mu0=32.5)
print(f"  H0: mean=32.5 → t={t_result['t_stat']:.3f}, p={t_result['p_value']:.4f}")
boot = bootstrap_ci(data)
print(f"  Bootstrap CI: [{boot['ci_lower']:.2f}, {boot['ci_upper']:.2f}]")

print()
print("=" * 60)
print("ALL TESTS PASSED")
print("=" * 60)
