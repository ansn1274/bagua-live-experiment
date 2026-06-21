"""
Statistical Testing for Bagua Experiment

Pure Python implementation — NO scipy/numpy dependencies.
Uses only the math and random standard library modules.

Implements:
- Paired t-test
- Wilcoxon signed-rank test
- Bootstrap confidence interval
- Effect size (Cohen's d)
- One-sample t-test against baseline
- Binomial test for proportions
- Descriptive statistics
- Full test suite runner
"""

import math
import random as _random
from typing import List, Tuple, Optional

# ──────────────────────────────────────────────
#  Internal helpers
# ──────────────────────────────────────────────

def _mean(data: List[float]) -> float:
    """Arithmetic mean."""
    if not data:
        return 0.0
    return sum(data) / len(data)


def _variance(data: List[float], ddof: int = 1) -> float:
    """Sample variance with given delta degrees of freedom."""
    n = len(data)
    if n <= ddof:
        return 0.0
    m = _mean(data)
    return sum((x - m) ** 2 for x in data) / (n - ddof)


def _std(data: List[float], ddof: int = 1) -> float:
    """Sample standard deviation."""
    return math.sqrt(_variance(data, ddof))


def _median(data: List[float]) -> float:
    """Median of sorted data."""
    s = sorted(data)
    n = len(s)
    if n == 0:
        return 0.0
    if n % 2 == 1:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2.0


def _quantile(data: List[float], q: float) -> float:
    """Approximate quantile using linear interpolation."""
    s = sorted(data)
    n = len(s)
    if n == 0:
        return 0.0
    if n == 1:
        return s[0]
    pos = q * (n - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return s[lo]
    frac = pos - lo
    return s[lo] * (1 - frac) + s[hi] * frac


# ──────────────────────────────────────────────
#  t-distribution CDF approximation
# ──────────────────────────────────────────────

def _log_gamma(x: float) -> float:
    """Lanczos approximation of log(Gamma(x))."""
    if x <= 0:
        return float('inf')
    coefficients = [
        76.18009172947146,
        -86.50532032941677,
        24.01409824083091,
        -1.231739572450155,
        0.1208650973866179e-2,
        -0.5395239384953e-5,
    ]
    y = x
    tmp = x + 5.5
    tmp -= (x - 0.5) * math.log(tmp)
    ser = 1.000000000190015
    for c in coefficients:
        y += 1.0
        ser += c / y
    return -tmp + math.log(2.5066282746310005 * ser / x)


def _beta_inc_cf(a: float, b: float, x: float) -> float:
    """Regularized incomplete beta function via continued fraction (Lentz)."""
    max_iter = 200
    eps = 1e-12

    # When x == 0 or x == 1
    if x < 0 or x > 1:
        return 0.0
    if x == 0 or x == 1:
        return x

    # Front factor
    lbeta = _log_gamma(a + b) - _log_gamma(a) - _log_gamma(b)
    front = math.exp(
        lbeta + a * math.log(x) + b * math.log(1.0 - x)
    ) / a

    # Modified Lentz's method
    f = 1.0
    c = 1.0
    d = 1.0 - (a + b) * x / (a + 1.0)
    if abs(d) < eps:
        d = eps
    d = 1.0 / d
    f = d

    for m in range(1, max_iter + 1):
        # Even step
        m2 = 2 * m
        num = m * (b - m) * x / ((a + m2 - 1) * (a + m2))
        d = 1.0 + num * d
        if abs(d) < eps:
            d = eps
        c = 1.0 + num / c
        if abs(c) < eps:
            c = eps
        d = 1.0 / d
        f *= c * d

        # Odd step
        num = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1))
        d = 1.0 + num * d
        if abs(d) < eps:
            d = eps
        c = 1.0 + num / c
        if abs(c) < eps:
            c = eps
        d = 1.0 / d
        delta = c * d
        f *= delta

        if abs(delta - 1.0) < eps:
            break

    return front * f


def _regularized_beta(x: float, a: float, b: float) -> float:
    """Regularized incomplete beta function I_x(a, b)."""
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    # Use symmetry relation for numerical stability
    if x > (a + 1) / (a + b + 2):
        return 1.0 - _beta_inc_cf(b, a, 1.0 - x)
    return _beta_inc_cf(a, b, x)


def _t_cdf(t_val: float, df: float) -> float:
    """CDF of Student's t-distribution at t_val with df degrees of freedom."""
    x = df / (df + t_val * t_val)
    beta_val = _regularized_beta(x, df / 2.0, 0.5)
    cdf = 1.0 - 0.5 * beta_val
    if t_val < 0:
        cdf = 1.0 - cdf
    return cdf


def _t_pvalue_two_sided(t_val: float, df: float) -> float:
    """Two-sided p-value for t-distribution."""
    cdf = _t_cdf(abs(t_val), df)
    return 2.0 * (1.0 - cdf)


# ──────────────────────────────────────────────
#  Normal CDF approximation (for Wilcoxon / Binomial)
# ──────────────────────────────────────────────

def _norm_cdf(z: float) -> float:
    """Standard normal CDF using Abramowitz & Stegun approximation."""
    if z < -8:
        return 0.0
    if z > 8:
        return 1.0
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _norm_pvalue_two_sided(z: float) -> float:
    """Two-sided p-value for standard normal."""
    return 2.0 * (1.0 - _norm_cdf(abs(z)))


# ──────────────────────────────────────────────
#  Public API
# ──────────────────────────────────────────────

def paired_t_test(x: List[float], y: List[float]) -> dict:
    """
    Paired t-test: H0: mean(x - y) = 0

    Returns: t_stat, p_value, df, significant_005, mean_diff, se_diff
    """
    if len(x) != len(y):
        raise ValueError("x and y must have the same length")

    diffs = [a - b for a, b in zip(x, y)]
    n = len(diffs)
    if n < 2:
        return {
            "t_stat": 0.0,
            "p_value": 1.0,
            "df": 0,
            "significant_005": False,
            "mean_diff": _mean(diffs),
            "se_diff": 0.0,
        }

    mean_d = _mean(diffs)
    sd_d = _std(diffs, ddof=1)
    se_d = sd_d / math.sqrt(n)

    if se_d == 0:
        t_stat = 0.0
        p_value = 1.0 if mean_d == 0 else 0.0
    else:
        t_stat = mean_d / se_d
        df = n - 1
        p_value = _t_pvalue_two_sided(t_stat, df)

    return {
        "t_stat": t_stat,
        "p_value": p_value,
        "df": n - 1,
        "significant_005": p_value < 0.05,
        "mean_diff": mean_d,
        "se_diff": se_d,
    }


def one_sample_t_test(x: List[float], mu0: float = 0) -> dict:
    """
    One-sample t-test: H0: mean(x) = mu0

    Returns: t_stat, p_value, df, mean, se, significant_005
    """
    n = len(x)
    if n < 2:
        return {
            "t_stat": 0.0,
            "p_value": 1.0,
            "df": 0,
            "mean": _mean(x),
            "se": 0.0,
            "significant_005": False,
        }

    mean_x = _mean(x)
    sd_x = _std(x, ddof=1)
    se_x = sd_x / math.sqrt(n)

    if se_x == 0:
        t_stat = 0.0
        p_value = 1.0 if mean_x == mu0 else 0.0
    else:
        t_stat = (mean_x - mu0) / se_x
        df = n - 1
        p_value = _t_pvalue_two_sided(t_stat, df)

    return {
        "t_stat": t_stat,
        "p_value": p_value,
        "df": n - 1,
        "mean": mean_x,
        "se": se_x,
        "significant_005": p_value < 0.05,
    }


def wilcoxon_signed_rank(
    x: List[float], y: Optional[List[float]] = None, mu0: float = 0
) -> dict:
    """
    Wilcoxon signed-rank test.
    If y provided: test x - y = 0
    If y not provided: test x - mu0 = 0

    Uses normal approximation for p-value when n > 20.
    Returns: W_stat, p_value_approx, n_nonzero
    """
    if y is not None:
        if len(x) != len(y):
            raise ValueError("x and y must have the same length")
        diffs = [a - b for a, b in zip(x, y)]
    else:
        diffs = [a - mu0 for a in x]

    # Remove zeros
    nonzero = [(abs(d), d) for d in diffs if d != 0]
    n_nz = len(nonzero)

    if n_nz < 2:
        return {"W_stat": 0.0, "p_value_approx": 1.0, "n_nonzero": n_nz}

    # Rank by absolute value
    nonzero.sort(key=lambda t: t[0])

    # Assign ranks with tie averaging
    ranks = [0.0] * n_nz
    i = 0
    while i < n_nz:
        j = i
        while j < n_nz and nonzero[j][0] == nonzero[i][0]:
            j += 1
        avg_rank = (i + 1 + j) / 2.0
        for k in range(i, j):
            ranks[k] = avg_rank
        i = j

    # W+ = sum of ranks for positive differences
    W_plus = sum(ranks[i] for i in range(n_nz) if nonzero[i][1] > 0)
    W_minus = sum(ranks[i] for i in range(n_nz) if nonzero[i][1] < 0)
    W = min(W_plus, W_minus)

    # Normal approximation
    mu_W = n_nz * (n_nz + 1) / 4.0
    sigma_W = math.sqrt(n_nz * (n_nz + 1) * (2 * n_nz + 1) / 24.0)

    if sigma_W == 0:
        z = 0.0
    else:
        z = (W - mu_W) / sigma_W

    p_value = _norm_pvalue_two_sided(z)

    return {
        "W_stat": W,
        "W_plus": W_plus,
        "W_minus": W_minus,
        "p_value_approx": p_value,
        "n_nonzero": n_nz,
        "z_approx": z,
    }


def bootstrap_ci(
    data: List[float],
    n_boot: int = 10000,
    alpha: float = 0.05,
    seed: int = 42,
) -> dict:
    """
    Bootstrap confidence interval for the mean.

    Returns: mean, ci_lower, ci_upper, alpha, n_boot
    """
    if not data:
        return {
            "mean": 0.0,
            "ci_lower": 0.0,
            "ci_upper": 0.0,
            "alpha": alpha,
            "n_boot": n_boot,
        }

    rng = _random.Random(seed)
    n = len(data)
    boot_means = []

    for _ in range(n_boot):
        sample = [rng.choice(data) for _ in range(n)]
        boot_means.append(sum(sample) / n)

    boot_means.sort()
    lo_idx = int(math.floor((alpha / 2) * n_boot))
    hi_idx = int(math.floor((1 - alpha / 2) * n_boot)) - 1
    lo_idx = max(0, min(lo_idx, n_boot - 1))
    hi_idx = max(0, min(hi_idx, n_boot - 1))

    return {
        "mean": _mean(data),
        "ci_lower": boot_means[lo_idx],
        "ci_upper": boot_means[hi_idx],
        "alpha": alpha,
        "n_boot": n_boot,
    }


def cohens_d(
    x: List[float], y: Optional[List[float]] = None, mu0: float = 0
) -> float:
    """
    Cohen's d effect size.
    If y provided: paired d = mean(x-y) / std(x-y)
    If y not provided: d = (mean(x) - mu0) / std(x)

    Returns float. Returns 0.0 if std is zero.
    """
    if y is not None:
        diffs = [a - b for a, b in zip(x, y)]
        sd = _std(diffs, ddof=1)
        if sd == 0:
            return 0.0
        return _mean(diffs) / sd
    else:
        sd = _std(x, ddof=1)
        if sd == 0:
            return 0.0
        return (_mean(x) - mu0) / sd


def binomial_test(successes: int, n: int, p0: float = 0.5) -> dict:
    """
    Binomial test: H0: p = p0
    Uses normal approximation when n*p0 > 5 and n*(1-p0) > 5.

    Returns: observed_p, p_value, n, successes
    """
    if n <= 0:
        return {"observed_p": 0.0, "p_value": 1.0, "n": 0, "successes": 0}

    observed_p = successes / n

    if n * p0 > 5 and n * (1 - p0) > 5:
        # Normal approximation with continuity correction
        se = math.sqrt(p0 * (1 - p0) / n)
        if se == 0:
            z = 0.0
        else:
            # continuity correction
            correction = 0.5 / n
            z = (abs(observed_p - p0) - correction) / se
            z = max(z, 0)
        p_value = _norm_pvalue_two_sided(z)
    else:
        # Exact binomial (for small n)
        p_value = _exact_binomial_pvalue(successes, n, p0)

    return {
        "observed_p": observed_p,
        "p_value": p_value,
        "n": n,
        "successes": successes,
    }


def _exact_binomial_pvalue(k: int, n: int, p0: float) -> float:
    """Exact two-sided binomial p-value by summing tails."""

    def _binom_pmf(x: int, n: int, p: float) -> float:
        """Binomial PMF using log for numerical stability."""
        if x < 0 or x > n:
            return 0.0
        log_coeff = (
            _log_gamma(n + 1) - _log_gamma(x + 1) - _log_gamma(n - x + 1)
        )
        if p == 0:
            return 1.0 if x == 0 else 0.0
        if p == 1:
            return 1.0 if x == n else 0.0
        log_prob = log_coeff + x * math.log(p) + (n - x) * math.log(1 - p)
        return math.exp(log_prob)

    # P(X = k) under H0
    p_k = _binom_pmf(k, n, p0)

    # Sum probabilities of all outcomes as extreme or more extreme
    p_value = 0.0
    for i in range(n + 1):
        p_i = _binom_pmf(i, n, p0)
        if p_i <= p_k + 1e-12:
            p_value += p_i

    return min(p_value, 1.0)


def descriptive_stats(data: List[float]) -> dict:
    """
    Basic descriptive statistics.

    Returns: mean, median, std, min, max, q25, q75, n
    """
    if not data:
        return {
            "mean": 0.0,
            "median": 0.0,
            "std": 0.0,
            "min": 0.0,
            "max": 0.0,
            "q25": 0.0,
            "q75": 0.0,
            "n": 0,
        }

    return {
        "mean": _mean(data),
        "median": _median(data),
        "std": _std(data, ddof=1) if len(data) > 1 else 0.0,
        "min": min(data),
        "max": max(data),
        "q25": _quantile(data, 0.25),
        "q75": _quantile(data, 0.75),
        "n": len(data),
    }


def full_test_suite(
    data: List[float], baseline: float = 0, label: str = ""
) -> dict:
    """
    Run all applicable tests on a single list of values.

    Runs:
    - Descriptive stats
    - One-sample t-test (vs baseline)
    - Wilcoxon signed-rank test (vs baseline)
    - Bootstrap CI
    - Cohen's d

    Returns combined results dict.
    """
    desc = descriptive_stats(data)
    t_test = one_sample_t_test(data, mu0=baseline)
    wilcoxon = wilcoxon_signed_rank(data, mu0=baseline)
    bootstrap = bootstrap_ci(data)
    d = cohens_d(data, mu0=baseline)

    return {
        "label": label,
        "baseline": baseline,
        "descriptive": desc,
        "one_sample_t": t_test,
        "wilcoxon": wilcoxon,
        "bootstrap_ci": bootstrap,
        "cohens_d": d,
        "significant_t": t_test["significant_005"],
        "significant_w": wilcoxon["p_value_approx"] < 0.05,
    }
