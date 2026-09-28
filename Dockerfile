FROM node:24.21.0-slim AS base

# Set up non-root user and safe cache locations
ENV APP_HOME="/app"
ENV PNPM_HOME="$APP_HOME/.pnpm"
ENV COREPACK_HOME="$APP_HOME/.corepack"
ENV PATH="$PNPM_HOME:$COREPACK_HOME:$PATH"
ENV PNPM_STORE_PATH="$PNPM_HOME/store"
ENV SKIP_SKILLS_INSTALL=1
# Frontend build stages install the whole workspace. The backend uses Puppeteer
# with system Chromium, so no stage should download a bundled browser at install time.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Create app user and directories with correct permissions
RUN useradd -m -d $APP_HOME appuser \
    && mkdir -p $PNPM_HOME/store $COREPACK_HOME \
    && chown -R appuser:appuser $APP_HOME

# Enable corepack as appuser


USER root
RUN corepack enable
USER appuser

# --- Frontend build stage ---
FROM base AS build-frontend
ARG BUILD_MODE=production
ENV BUILD_MODE=$BUILD_MODE
# Deployment-specific values are injected at build time by whoever builds the
# image (see compose.yaml for local defaults). Vite reads VITE_* from the
# process environment, so these override any .env.<mode> file.
ARG VITE_BACKEND_URL
ARG VITE_ENTRAID_CLIENT_ID
ARG VITE_ENTRAID_AUTHORITY
ARG VITE_ENTRAID_LOGIN_REDIRECT_URI
ARG VITE_ENTRAID_LOGOUT_REDIRECT_URI
ARG VITE_APPINSIGHTS_CONNECTION_STRING
ARG VITE_CONTACT_EMAIL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL \
    VITE_ENTRAID_CLIENT_ID=$VITE_ENTRAID_CLIENT_ID \
    VITE_ENTRAID_AUTHORITY=$VITE_ENTRAID_AUTHORITY \
    VITE_ENTRAID_LOGIN_REDIRECT_URI=$VITE_ENTRAID_LOGIN_REDIRECT_URI \
    VITE_ENTRAID_LOGOUT_REDIRECT_URI=$VITE_ENTRAID_LOGOUT_REDIRECT_URI \
    VITE_APPINSIGHTS_CONNECTION_STRING=$VITE_APPINSIGHTS_CONNECTION_STRING \
    VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL
COPY . /app
WORKDIR /app

# Ensure all relevant directories are owned by appuser to prevent EACCES during pnpm install
USER root
RUN chown -R appuser:appuser /app \
    && [ -d /app/.pnpm ] && chown -R appuser:appuser /app/.pnpm || true \
    && [ -d /app/node_modules ] && chown -R appuser:appuser /app/node_modules || true \
    && [ -d /app/apps/shared/ui/node_modules ] && chown -R appuser:appuser /app/apps/shared/ui/node_modules || true \
    && [ -d /app/apps/shared/ui/.pnpm ] && chown -R appuser:appuser /app/apps/shared/ui/.pnpm || true

USER appuser
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./apps/frontend run build:mode
USER root

# --- PDF Frontend build stage ---
FROM base AS build-pdf-frontend
ARG BUILD_MODE=production
ENV BUILD_MODE=$BUILD_MODE
# Deployment-specific values are injected at build time by whoever builds the
# image (see compose.yaml for local defaults). Vite reads VITE_* from the
# process environment, so these override any .env.<mode> file.
ARG VITE_BACKEND_URL
ARG VITE_ENTRAID_CLIENT_ID
ARG VITE_ENTRAID_AUTHORITY
ARG VITE_ENTRAID_LOGIN_REDIRECT_URI
ARG VITE_ENTRAID_LOGOUT_REDIRECT_URI
ARG VITE_APPINSIGHTS_CONNECTION_STRING
ARG VITE_CONTACT_EMAIL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL \
    VITE_ENTRAID_CLIENT_ID=$VITE_ENTRAID_CLIENT_ID \
    VITE_ENTRAID_AUTHORITY=$VITE_ENTRAID_AUTHORITY \
    VITE_ENTRAID_LOGIN_REDIRECT_URI=$VITE_ENTRAID_LOGIN_REDIRECT_URI \
    VITE_ENTRAID_LOGOUT_REDIRECT_URI=$VITE_ENTRAID_LOGOUT_REDIRECT_URI \
    VITE_APPINSIGHTS_CONNECTION_STRING=$VITE_APPINSIGHTS_CONNECTION_STRING \
    VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL
COPY . /app
WORKDIR /app

# Ensure all relevant directories are owned by appuser to prevent EACCES during pnpm install
USER root
RUN chown -R appuser:appuser /app \
    && [ -d /app/.pnpm ] && chown -R appuser:appuser /app/.pnpm || true \
    && [ -d /app/node_modules ] && chown -R appuser:appuser /app/node_modules || true \
    && [ -d /app/apps/shared/ui/node_modules ] && chown -R appuser:appuser /app/apps/shared/ui/node_modules || true \
    && [ -d /app/apps/shared/ui/.pnpm ] && chown -R appuser:appuser /app/apps/shared/ui/.pnpm || true

USER appuser
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./apps/pdf-frontend run build:mode
USER root

# --- PDF Frontend Nginx stage ---
FROM nginx:stable-alpine AS pdf-frontend

COPY --from=build-pdf-frontend /app/apps/pdf-frontend/dist /usr/share/nginx/html/

COPY ./docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY ./docker/nginx/nginx-pdf-frontend.conf /etc/nginx/conf.d/default.conf

# forward request and error logs to docker log collector
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
  && ln -sf /dev/stderr /var/log/nginx/error.log

# Add non-privileged user
RUN adduser -D -u 1001 appuser
RUN touch /var/run/nginx.pid && chown 1001:1001 /var/run/nginx.pid

RUN mkdir -p /var/cache/nginx/client_temp && chown -R appuser:appuser /var/cache/nginx
# Make sure appuser can change files that change in runtime
RUN touch /run/nginx.pid && \
  chown -R appuser \
  /run/nginx.pid \
  /var/cache/nginx \
  /usr/share/nginx/html/index.html

USER appuser

EXPOSE 5174
ENTRYPOINT ["nginx", "-g", "daemon off;"]

# --- Frontend Nginx stage ---
FROM nginx:stable-alpine AS frontend

COPY --from=build-frontend /app/apps/frontend/dist /usr/share/nginx/html/

COPY ./docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY ./docker/nginx/nginx-frontend.conf /etc/nginx/conf.d/default.conf

# forward request and error logs to docker log collector
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
  && ln -sf /dev/stderr /var/log/nginx/error.log

# Add non-privileged user
RUN adduser -D -u 1001 appuser
RUN touch /var/run/nginx.pid && chown 1001:1001 /var/run/nginx.pid

RUN mkdir -p /var/cache/nginx/client_temp && chown -R appuser:appuser /var/cache/nginx
# Make sure appuser can change files that change in runtime
RUN touch /run/nginx.pid && \
  chown -R appuser \
  /run/nginx.pid \
  /var/cache/nginx \
  /usr/share/nginx/html/index.html

USER appuser

EXPOSE 5173
ENTRYPOINT ["nginx", "-g", "daemon off;"]

# --- Backend runtime stage ---
FROM base AS backend
COPY . /usr/src/app
WORKDIR /usr/src/app

# Ensure correct ownership and create a dedicated pnpm temp directory
USER root
RUN chown -R appuser:appuser /usr/src/app \
    && mkdir -p /usr/src/app/.pnpm_tmp \
    && chown -R appuser:appuser /usr/src/app/.pnpm_tmp

# Set PNPM_TMPDIR environment variable for safe temp file location
ENV PNPM_TMPDIR=/usr/src/app/.pnpm_tmp
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    dnsutils \
    curl \
    strace \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*
USER appuser
RUN pnpm install --frozen-lockfile
WORKDIR /usr/src/app/apps/backend
EXPOSE 3000
CMD ["pnpm", "start"]

# --- AI Service runtime stage ---
# Base must satisfy pyproject's requires-python (>=3.13,<3.14). With a base
# outside that range, uv sync silently downloads a managed CPython into
# /root/.local/share/uv, which appuser can't read at runtime — the container
# then dies on start with "failed to canonicalize /app/.venv/bin/python3".
FROM python:3.13-slim AS ai-service

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install CA certificates — required for TLS connections to Azure services
RUN apt-get update && apt-get install -y --no-install-recommends \
    bind9-dnsutils \
    ca-certificates \
    curl \
    iproute2 \
    iputils-ping \
    jq \
    netcat-openbsd \
    openssl \
    procps \
    traceroute \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV UV_NO_DEV=1
# Fail the build loudly on a base/requires-python mismatch instead of letting
# uv download a managed interpreter that only root can read.
ENV UV_PYTHON_DOWNLOADS=never

RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

WORKDIR /app

COPY apps/ai-service/pyproject.toml apps/ai-service/uv.lock* ./

RUN uv sync --frozen --no-install-project

# Pre-bake docling's layout model into the image. Uploads extract with docling
# (its heading-based sections are what the effects engine needs); downloading the
# layout model from HuggingFace on the first conversion took minutes and overran
# the analyze-document timeout. Baking it makes the first conversion start in
# seconds. Only the layout model is needed — do_ocr/do_table_structure are off —
# so skip tableformer/OCR/vision models to keep the image lean. Consumed offline
# at runtime via DOCLING_ARTIFACTS_PATH (see extractor.py + manifests).
ENV DOCLING_ARTIFACTS_PATH=/app/models/docling
RUN uv run python -c "from pathlib import Path; from docling.utils.model_downloader import download_models; download_models(output_dir=Path('/app/models/docling'), with_layout=True, with_tableformer=False, with_code_formula=False, with_picture_classifier=False, with_rapidocr=False, with_easyocr=False)"

COPY apps/ai-service/main.py ./
COPY apps/ai-service/src/ ./src/
COPY apps/ai-service/config/ ./config/

RUN mkdir -p /app/data && \
    mkdir -p /tmp/ai-service && \
    chown -R appuser:appgroup /tmp/ai-service && \
    chown -R appuser:appgroup /app/models && \
    chown -R appuser:appgroup /app

USER appuser
EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--log-level", "info"]
