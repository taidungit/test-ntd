# syntax=docker/dockerfile:1.7

# ---- builder: resolve deps into an isolated venv ----
    FROM python:3.12-slim AS builder
    ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
    RUN python -m venv /opt/venv
    ENV PATH="/opt/venv/bin:$PATH"
    WORKDIR /build
    COPY requirements.txt .
    RUN pip install -r requirements.txt
    
    # ---- base: slim runtime, non-root user, no build tools ----
    FROM python:3.12-slim AS base
    ENV PYTHONDONTWRITEBYTECODE=1 \
        PYTHONUNBUFFERED=1 \
        PATH="/opt/venv/bin:$PATH"
    RUN groupadd --system app && useradd --system --gid app --home-dir /app app
    WORKDIR /app
    COPY --from=builder /opt/venv /opt/venv
    EXPOSE 8000
    
    # ---- dev: code is bind-mounted by compose, hot reload ----
    FROM base AS dev
    USER app
    CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
    
    # ---- prod: code baked in, no reload, multiple workers ----
    FROM base AS prod
    COPY --chown=app:app . .
    USER app
    CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]