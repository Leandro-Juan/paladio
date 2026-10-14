from unittest.mock import AsyncMock, patch

import httpx
import numpy as np
import pytest
from app.infrastructure.providers.ollama_embedding_provider import (
    EmbeddingProviderError,
    OllamaEmbeddingProvider,
)


@pytest.fixture
def valid_768_vec():
    # Deterministic non-uniform vector
    rng = np.random.RandomState(42)
    v = rng.randn(768).astype(np.float32)
    return (v / np.linalg.norm(v)).tolist()


@pytest.mark.asyncio
async def test_ollama_embedding_prefix(valid_768_vec):
    provider = OllamaEmbeddingProvider(model="nomic-embed-text")
    assert (
        provider._prefix_text("cathedral", input_type="document")
        == "search_document: cathedral"
    )
    assert (
        provider._prefix_text("cathedral", input_type="query")
        == "search_query: cathedral"
    )


@pytest.mark.asyncio
async def test_ollama_embed_text_success(valid_768_vec):
    provider = OllamaEmbeddingProvider()
    mock_resp = httpx.Response(
        status_code=200,
        json={"embeddings": [valid_768_vec]},
        request=httpx.Request("POST", "http://test/api/embed"),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        vec = await provider.embed_text("historic church", input_type="document")

        assert len(vec) == 768
        assert abs(np.linalg.norm(vec) - 1.0) < 1e-4
        assert mock_post.call_count >= 1
        call_args = mock_post.call_args[1]["json"]
        assert call_args["input"] == ["search_document: historic church"]


@pytest.mark.asyncio
async def test_ollama_embed_batch_success(valid_768_vec):
    provider = OllamaEmbeddingProvider()
    mock_resp = httpx.Response(
        status_code=200,
        json={"embeddings": [valid_768_vec, valid_768_vec]},
        request=httpx.Request("POST", "http://test/api/embed"),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        texts = ["historic cathedral", "romantic sunset view"]
        embs = await provider.embed_batch(texts, input_type="query")

        assert len(embs) == 2
        for e in embs:
            assert len(e) == 768
            assert abs(np.linalg.norm(e) - 1.0) < 1e-4


@pytest.mark.asyncio
async def test_ollama_rejects_uniform_vector():
    provider = OllamaEmbeddingProvider()
    uniform_vec = (np.full(768, 1.0 / np.sqrt(768), dtype=np.float32)).tolist()
    mock_resp = httpx.Response(
        status_code=200,
        json={"embeddings": [uniform_vec]},
        request=httpx.Request("POST", "http://test/api/embed"),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        with pytest.raises(EmbeddingProviderError, match="uniform vector"):
            await provider.embed_text("some text")


@pytest.mark.asyncio
async def test_ollama_raises_on_connection_failure():
    provider = OllamaEmbeddingProvider()
    with patch("httpx.AsyncClient.post", side_effect=httpx.ConnectError("Ollama down")):
        with pytest.raises(
            EmbeddingProviderError, match="All Ollama embedding candidates failed"
        ):
            await provider.embed_text("cathedral")


@pytest.mark.asyncio
async def test_ollama_rejects_empty_text():
    provider = OllamaEmbeddingProvider()
    with pytest.raises(EmbeddingProviderError, match="empty text"):
        await provider.embed_text("   ")
