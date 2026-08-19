# Stage: dependencies
FROM python:3.12-slim AS deps
RUN apt-get update && apt-get install -y build-essential cmake git
WORKDIR /app
COPY backend/pyproject.toml .
# Create a dummy app directory so pip install . succeeds for the hatchling backend
RUN mkdir app && touch app/__init__.py && \
    pip install --no-cache-dir . && \
    rm -rf app

COPY cpp_core /cpp_core
WORKDIR /cpp_core/build
RUN rm -rf * && cmake .. && make -j4
RUN cp paladio_core*.so /usr/local/lib/python3.12/site-packages/

# Stage: dev (hot reload)
FROM python:3.12-slim AS dev
WORKDIR /app
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
RUN apt-get update && apt-get install -y libstdc++6
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN playwright install --with-deps chromium
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
RUN apt-get update && apt-get install -y libstdc++6 && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN playwright install --with-deps chromium
USER appuser
COPY --chown=appuser:appgroup backend/ .
ENV NODE_ENV=production
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
