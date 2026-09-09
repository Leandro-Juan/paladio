import pytest
import numpy as np
from app.infrastructure.providers.ollama_embedding_provider import (
    OllamaEmbeddingProvider,
)


@pytest.mark.asyncio
async def test_ollama_embedding_provider():
    provider = OllamaEmbeddingProvider()
    assert provider.dimension == 768

    text = "historic gothic cathedral with ornate bell towers"
    emb = await provider.embed_text(text)

    assert isinstance(emb, list)
    assert len(emb) == 768
    # Assert unit L2 norm
    arr = np.array(emb, dtype=np.float32)
    norm = np.linalg.norm(arr)
    assert abs(norm - 1.0) < 1e-4


@pytest.mark.asyncio
async def test_ollama_embedding_batch():
    provider = OllamaEmbeddingProvider()
    texts = [
        "authentic tapas bar and local wine",
        "scenic viewpoint over the river horizon",
    ]
    batch_embs = await provider.embed_batch(texts)

    assert len(batch_embs) == 2
    for emb in batch_embs:
        assert len(emb) == 768
        norm = np.linalg.norm(np.array(emb, dtype=np.float32))
        assert abs(norm - 1.0) < 1e-4
