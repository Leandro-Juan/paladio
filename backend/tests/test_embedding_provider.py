from unittest.mock import patch

import numpy as np
import pytest
from app.infrastructure.providers.onnx_embedding_provider import (
    EmbeddingProviderError,
    OnnxEmbeddingProvider,
)


@pytest.fixture
def valid_768_vec():
    rng = np.random.RandomState(42)
    v = rng.randn(768).astype(np.float32)
    return v / np.linalg.norm(v)


def test_onnx_embedding_prefix():
    provider = OnnxEmbeddingProvider(model="nomic-ai/nomic-embed-text-v1.5-Q")
    assert (
        provider._prefix_text("cathedral", input_type="document")
        == "search_document: cathedral"
    )
    assert (
        provider._prefix_text("cathedral", input_type="query")
        == "search_query: cathedral"
    )
    assert (
        provider._prefix_text("search_query: cathedral", input_type="query")
        == "search_query: cathedral"
    )


@pytest.mark.asyncio
async def test_onnx_embed_text_success(valid_768_vec):
    provider = OnnxEmbeddingProvider()
    with patch.object(
        provider, "_embed_sync", return_value=[valid_768_vec * 3.0]
    ) as mock_sync:
        vec = await provider.embed_text("historic church", input_type="document")

        assert len(vec) == 768
        assert abs(np.linalg.norm(vec) - 1.0) < 1e-4
        mock_sync.assert_called_once_with(["search_document: historic church"], 1)


@pytest.mark.asyncio
async def test_onnx_embed_batch_success(valid_768_vec):
    provider = OnnxEmbeddingProvider()
    with patch.object(
        provider, "_embed_sync", return_value=[valid_768_vec, valid_768_vec * 2.0]
    ) as mock_sync:
        texts = ["historic cathedral", "romantic sunset view"]
        embs = await provider.embed_batch(texts, input_type="query")

        assert len(embs) == 2
        for e in embs:
            assert len(e) == 768
            assert abs(np.linalg.norm(e) - 1.0) < 1e-4
        mock_sync.assert_called_once_with(
            ["search_query: historic cathedral", "search_query: romantic sunset view"],
            128,
        )


@pytest.mark.asyncio
async def test_onnx_rejects_uniform_vector():
    provider = OnnxEmbeddingProvider()
    uniform_vec = np.full(768, 1.0 / np.sqrt(768), dtype=np.float32)

    with patch.object(provider, "_embed_sync", return_value=[uniform_vec]):
        with pytest.raises(EmbeddingProviderError, match="uniform vector"):
            await provider.embed_text("some text")


@pytest.mark.asyncio
async def test_onnx_rejects_empty_text():
    provider = OnnxEmbeddingProvider()
    with pytest.raises(EmbeddingProviderError, match="empty text"):
        await provider.embed_text("   ")


@pytest.mark.asyncio
async def test_onnx_real_inference_unit_norm():
    provider = OnnxEmbeddingProvider()
    v_art = await provider.embed_text(
        "fine arts museum paintings gallery", input_type="query"
    )
    v_prado = await provider.embed_text(
        "Museo del Prado European paintings museum", input_type="document"
    )
    v_bar = await provider.embed_text(
        "late night cocktail bar clubbing music", input_type="document"
    )
    assert provider.dimension == 768
    assert len(v_art) == 768
    assert abs(np.linalg.norm(v_art) - 1.0) < 1e-4
    assert float(np.dot(v_art, v_prado)) > float(np.dot(v_art, v_bar))
