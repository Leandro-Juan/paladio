import math

import numpy as np
import pytest
from app.engine.scoring.features import TAG_KEYS
from app.engine.scoring.semantic_learning import (
    CATEGORY_ANCHORS,
    SemanticLearningEngine,
)
from app.infrastructure.providers.onnx_embedding_provider import (
    OnnxEmbeddingProvider,
)


def test_ema_formula_and_normalization():
    v_hist = [1.0, 0.0, 0.0]
    v_prompt = [0.0, 1.0, 0.0]
    gamma = 0.20

    v_new = SemanticLearningEngine.apply_ema_update(v_hist, v_prompt, gamma=gamma)
    assert len(v_new) == 3

    # Expected unnormalized: (0.8, 0.2, 0.0), norm = sqrt(0.64 + 0.04) = sqrt(0.68) ≈ 0.8246
    arr = np.array(v_new)
    assert abs(np.linalg.norm(arr) - 1.0) < 1e-4
    assert arr[0] > arr[1]  # Historical bias preserved


@pytest.mark.asyncio
async def test_semantic_projection_to_8d():
    provider = OnnxEmbeddingProvider()
    anchors = {}
    for k, text in CATEGORY_ANCHORS.items():
        anchors[k] = await provider.embed_text(text)

    engine = SemanticLearningEngine(anchors)
    art_prompt_vec = await provider.embed_text(
        "art gallery modern fine art paintings and sculptures"
    )

    harmonics = engine.project_to_8d_harmonics(art_prompt_vec)

    # All 8 keys present
    for k in TAG_KEYS:
        assert k in harmonics
        assert 0.0 <= harmonics[k] <= 1.0

    # Art & culture should be significantly higher than nightlife or shopping
    assert harmonics["art_culture"] >= 0.85
    assert harmonics["art_culture"] > harmonics["nightlife"]


def test_signed_ema_positive_negative_decay_and_norm():
    dim = 768
    base = [1.0] + [0.0] * (dim - 1)
    target_vec = [0.0, 1.0] + [0.0] * (dim - 2)

    # Positive polarity pulls toward target vector and remains unit-normalized
    pulled = SemanticLearningEngine.apply_signed_ema_update(
        base, target_vec, polarity=1.0, weight=1.0, base_gamma=0.5
    )
    assert math.isclose(sum(x * x for x in pulled), 1.0, rel_tol=1e-5)
    assert pulled[1] > 0.0

    # Negative polarity pushes away from target vector without destabilizing unit norm
    pushed = SemanticLearningEngine.apply_signed_ema_update(
        pulled, target_vec, polarity=-1.0, weight=1.0, base_gamma=0.5
    )
    assert math.isclose(sum(x * x for x in pushed), 1.0, rel_tol=1e-5)
    assert pushed[1] < pulled[1]

    # Elapsed time decay keeps unit norm safely when polarity=0
    decayed = SemanticLearningEngine.apply_signed_ema_update(
        base,
        target_vec,
        polarity=0.0,
        weight=0.0,
        base_gamma=0.25,
        age_days=360.0,
        half_life_days=180.0,
    )
    assert math.isclose(sum(x * x for x in decayed), 1.0, rel_tol=1e-5)
