import math

import pytest

from snip_unimernet.recognizer import summarize_log_probs


def test_summarize_log_probs_returns_geometric_mean_and_min() -> None:
    mean, minimum = summarize_log_probs([math.log(0.9), math.log(0.4), math.log(1.0)])

    assert mean == pytest.approx((0.9 * 0.4 * 1.0) ** (1 / 3))
    assert minimum == pytest.approx(0.4)


def test_summarize_log_probs_handles_empty_output() -> None:
    assert summarize_log_probs([]) == (0.0, 0.0)
