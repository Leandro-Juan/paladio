import os

import httpx
import numpy as np
import pytest
from app.engine.scoring.features import TAG_KEYS
from app.engine.scoring.semantic_learning import (
    CATEGORY_ANCHORS,
    SemanticLearningEngine,
)
from app.infrastructure.providers.ollama_embedding_provider import (
    OllamaEmbeddingProvider,
)


def is_ollama_online() -> bool:
    """Checks if Ollama is accessible and has nomic-embed-text ready across host or Docker container."""
    env_base = os.getenv("OLLAMA_BASE_URL")
    if env_base:
        urls_to_try = [env_base.rstrip("/")]
    else:
        urls_to_try = [
            "http://127.0.0.1:11435",
            "http://localhost:11435",
            "http://llm:11434",
            "http://localhost:11434",
        ]
    for base in urls_to_try:
        if not base:
            continue
        try:
            resp = httpx.get(f"{base}/api/tags", timeout=1.5)
            if resp.status_code == 200:
                models = [m.get("name", "") for m in resp.json().get("models", [])]
                if any("nomic-embed-text" in m for m in models):
                    return True
        except (httpx.HTTPError, OSError):
            continue
    return False


ollama_required = pytest.mark.skipif(
    not is_ollama_online(),
    reason="Requires live Ollama container running nomic-embed-text embedding model",
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


@ollama_required
@pytest.mark.asyncio
async def test_semantic_projection_to_8d():
    provider = OllamaEmbeddingProvider()
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
