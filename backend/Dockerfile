# Stage: dependencies
FROM python:3.12-slim AS deps
RUN apt-get update && apt-get install -y build-essential cmake git
WORKDIR /app
COPY backend/pyproject.toml .
# Create a dummy app directory so pip install . succeeds for the hatchling backend
ENV FASTEMBED_CACHE_PATH=/opt/models/fastembed
RUN mkdir app && touch app/__init__.py && \
    pip install --no-cache-dir ".[dev]" && \
    rm -rf app && \
    python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='nomic-ai/nomic-embed-text-v1.5-Q', cache_dir='/opt/models/fastembed')"

COPY cpp_core /cpp_core
WORKDIR /cpp_core/build
RUN rm -rf * && cmake .. && make -j4
RUN cp paladio_core*.so /usr/local/lib/python3.12/site-packages/

# Stage: dev (hot reload)
FROM python:3.12-slim AS dev
WORKDIR /app
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY --from=deps /opt/models/fastembed /opt/models/fastembed
ENV FASTEMBED_CACHE_PATH=/opt/models/fastembed
RUN apt-get update && apt-get install -y libstdc++6 libexpat1 tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa poppler-utils fonts-liberation fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY backend/ .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Stage: production
FROM python:3.12-slim AS production
WORKDIR /app
RUN addgroup --system appgroup && adduser --system --group appuser
USER root
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY --chown=appuser:appgroup --from=deps /opt/models/fastembed /opt/models/fastembed
ENV FASTEMBED_CACHE_PATH=/opt/models/fastembed
RUN apt-get update && apt-get install -y libstdc++6 libexpat1 tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa poppler-utils fonts-liberation fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
USER appuser
COPY --chown=appuser:appgroup backend/ .
ENV NODE_ENV=production
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
