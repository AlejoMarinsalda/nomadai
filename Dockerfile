# syntax=docker/dockerfile:1.4
#
# Multi-stage build:
#   builder  — instala deps + genera índice FAISS (usa GOOGLE_API_KEY como secret)
#   runtime  — imagen Lambda limpia; copia solo el índice generado, sin secretos en layers
#
# Build:
#   docker build --secret id=google_api_key,env=GOOGLE_API_KEY \
#                --platform linux/amd64 --provenance=false -t nomadai .

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/python:3.12-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY data/ ./data/
COPY scripts/ ./scripts/

RUN --mount=type=secret,id=google_api_key \
    GOOGLE_API_KEY=$(cat /run/secrets/google_api_key) \
    python scripts/build_rag_index.py --output-dir /build/rag_index --skip-upload

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM public.ecr.aws/lambda/python:3.12

COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY app/     ${LAMBDA_TASK_ROOT}/app/
COPY handler.py ${LAMBDA_TASK_ROOT}/

# Índice RAG generado en el builder — no hay secretos en esta layer
COPY --from=builder /build/rag_index ${LAMBDA_TASK_ROOT}/rag_index

CMD ["handler.handler"]
