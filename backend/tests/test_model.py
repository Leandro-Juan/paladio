import pytest
from app.engine.scoring.model import HeuristicScorer

def test_heuristic_scorer_forward():
    scorer = HeuristicScorer()
    poi = {"cost_eur": 10.0, "category": "ATTRACTION", "rating": 4.5, "reviews": 500}
    score = scorer(poi)
    assert 0 <= score <= 100
    assert score > 50

def test_heuristic_scorer_deterministic():
    scorer = HeuristicScorer()
    poi = {"cost_eur": 10.0, "category": "ATTRACTION", "rating": 4.5, "reviews": 500}
    assert scorer(poi) == scorer(poi), "Scorer should be deterministic"
