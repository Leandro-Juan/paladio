# Stage: dependencies
FROM python:3.12-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake git && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/pyproject.toml .
# Create a dummy app directory so pip install . succeeds for the hatchling backend
ENV FASTEMBED_CACHE_PATH=/opt/models/fastembed
RUN mkdir app && touch app/__init__.py && \
    pip install --no-cache-dir "." && \
    rm -rf app /usr/local/lib/python3.12/site-packages/app && \
    python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='nomic-ai/nomic-embed-text-v1.5-Q', cache_dir='/opt/models/fastembed')"

COPY cpp_core /cpp_core
RUN cmake -S /cpp_core -B /cpp_core/build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build /cpp_core/build -j$(nproc) && \
    cp /cpp_core/build/paladio_core*.so /usr/local/lib/python3.12/site-packages/

# Stage: dev (hot reload)
FROM python:3.12-slim AS dev
WORKDIR /app
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY --from=deps /opt/models/fastembed /opt/models/fastembed
ENV FASTEMBED_CACHE_PATH=/opt/models/fastembed
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 libexpat1 tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa \
    poppler-utils fonts-liberation fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/*
COPY backend/pyproject.toml .
RUN mkdir app && touch app/__init__.py && \
    pip install --no-cache-dir ".[dev]" && \
    rm -rf app /usr/local/lib/python3.12/site-packages/app
COPY backend/ .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Stage: production (consumer runtime)
FROM python:3.12-slim AS production
WORKDIR /app
RUN addgroup --system --gid 10001 appgroup && \
    adduser --system --uid 10001 --ingroup appgroup appuser
RUN mkdir -p /data /custom_files /gtfs_feeds && \
    chown -R appuser:appgroup /data /custom_files /gtfs_feeds && \
    chmod 775 /data /custom_files /gtfs_feeds
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY --chown=appuser:appgroup --from=deps /opt/models/fastembed /opt/models/fastembed
ENV FASTEMBED_CACHE_PATH=/opt/models/fastembed \
    ENVIRONMENT=production \
    API_WORKERS=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 libexpat1 tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa \
    poppler-utils fonts-liberation fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/*
USER appuser
COPY --chown=appuser:appgroup backend/pyproject.toml backend/alembic.ini ./
COPY --chown=appuser:appgroup backend/app ./app
COPY --chown=appuser:appgroup backend/migrations ./migrations
COPY --chown=appuser:appgroup backend/scripts ./scripts
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${API_WORKERS:-1}"]
