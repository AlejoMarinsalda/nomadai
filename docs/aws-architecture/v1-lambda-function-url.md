# AWS Architecture v1 — Lambda + Function URL

**Fecha de deploy:** 2026-04-26  
**Estado:** Activa en producción

---

## Diagrama

```
Usuario (browser)
       │
       │  HTTPS
       ▼
Lambda Function URL
(us-east-1, AuthType: NONE)
https://3zhz3rksbvalkpzulwoelhlvtu0vlask.lambda-url.us-east-1.on.aws/
       │
       │  invoca
       ▼
Lambda Function: nomadai
├── Runtime: Container Image (Python 3.12)
├── Base image: public.ecr.aws/lambda/python:3.12
├── Handler: handler.handler (Mangum → FastAPI)
├── Timeout: 120s
├── Memory: 1024 MB
├── Arquitectura: x86_64
└── Region: us-east-1
       │
       ├── Gemini 2.5 Flash (Google AI)
       ├── Tavily Search API
       ├── YouTube Data API v3
       ├── Open-Meteo API (clima)
       └── LangSmith (trazas)
```

---

## Componentes AWS

| Recurso | Identificador |
|---|---|
| ECR Repository | `237216011543.dkr.ecr.us-east-1.amazonaws.com/nomadai` |
| Lambda Function | `arn:aws:lambda:us-east-1:237216011543:function:nomadai` |
| Function URL | `https://3zhz3rksbvalkpzulwoelhlvtu0vlask.lambda-url.us-east-1.on.aws/` |
| IAM Role | `arn:aws:iam::237216011543:role/nomadai-lambda-role` |
| IAM User (deploy) | `nomadai-dev` |
| Log Group | `/aws/lambda/nomadai` |

---

## Permisos de la Function URL

Se requieren **dos** statements en la resource-based policy (error común: agregar solo el primero):

```json
{
  "Statement": [
    {
      "Sid": "FunctionURLAllowPublicAccess",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "lambda:InvokeFunctionUrl",
      "Condition": { "StringEquals": { "lambda:FunctionUrlAuthType": "NONE" } }
    },
    {
      "Sid": "FunctionURLInvokeFunction",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "lambda:InvokeFunction",
      "Condition": { "Bool": { "lambda:InvokedViaFunctionUrl": "true" } }
    }
  ]
}
```

---

## Stack de la aplicación

| Capa | Tecnología |
|---|---|
| HTTP adapter | Mangum 0.19 (Lambda ↔ FastAPI/ASGI) |
| API framework | FastAPI 0.115 |
| AI framework | LangGraph 0.2 + LangChain 0.3 |
| LLM | Gemini 2.5 Flash (`langchain-google-genai`) |
| Memoria de conversación | LangGraph `MemorySaver` (in-process, instancia Lambda) |
| Búsqueda web | Tavily Python SDK |
| Videos | YouTube Data API v3 |
| Clima | Open-Meteo (HTTP, sin API key) |
| Trazas | LangSmith |

---

## Variables de entorno en Lambda

```
GOOGLE_API_KEY
GOOGLE_MODEL_ID=gemini-2.5-flash
TAVILY_API_KEY
YOUTUBE_API_KEY
LANGSMITH_TRACING=true
LANGSMITH_API_KEY
LANGSMITH_PROJECT=nomadai
LOG_LEVEL=INFO
```

---

## Limitaciones conocidas

- **MemorySaver en memoria**: el historial de conversación vive en la instancia Lambda. Si Lambda escala a múltiples instancias concurrentes, sesiones distintas pueden caer en instancias distintas y perder contexto. Mitigación futura: migrar a DynamoDB checkpointer.
- **Cold start**: primera invocación tras inactividad tarda ~5-10s extra. Mitigación futura: Provisioned Concurrency (1 instancia, ~$10-12/mes).
- **Concurrencia**: límite de cuenta en 10 ejecuciones concurrentes.

---

## Comandos de redeploy

```bash
# Desde nomadai/
ACCOUNT_ID=237216011543
REGION=us-east-1

# Build y push nueva imagen
aws ecr get-login-password --region $REGION | docker login \
  --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

docker build --platform linux/amd64 --provenance=false -t nomadai .
docker tag nomadai:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/nomadai:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/nomadai:latest

# Actualizar Lambda con nueva imagen
aws lambda update-function-code \
  --function-name nomadai \
  --image-uri $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/nomadai:latest \
  --region $REGION
```
