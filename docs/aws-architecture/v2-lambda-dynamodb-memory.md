# AWS Architecture v2 — Lambda + Function URL + DynamoDB Checkpointer

**Fecha de deploy:** 2026-04-27  
**Estado:** Activa en producción  
**Cambio respecto a v1:** Memoria de conversación persistida en DynamoDB (antes: in-process MemorySaver)

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
└── Arquitectura: x86_64
       │
       ├── Gemini 2.5 Flash (Google AI)
       ├── Tavily Search API
       ├── YouTube Data API v3
       ├── Open-Meteo API (clima)
       ├── LangSmith (trazas)
       │
       │  checkpoint read/write
       ▼
DynamoDB Table: nomadai-checkpoints
├── Billing: PAY_PER_REQUEST
├── PK: String (partition key)
├── SK: String (sort key)
└── TTL: 30 días (atributo: ttl)
```

---

## Componentes AWS

| Recurso | Identificador |
|---|---|
| ECR Repository | `237216011543.dkr.ecr.us-east-1.amazonaws.com/nomadai` |
| Lambda Function | `arn:aws:lambda:us-east-1:237216011543:function:nomadai` |
| Function URL | `https://3zhz3rksbvalkpzulwoelhlvtu0vlask.lambda-url.us-east-1.on.aws/` |
| IAM Role | `arn:aws:iam::237216011543:role/nomadai-lambda-role` |
| DynamoDB Table | `arn:aws:dynamodb:us-east-1:237216011543:table/nomadai-checkpoints` |
| Log Group | `/aws/lambda/nomadai` |

---

## Por qué se migró a DynamoDB

Con `MemorySaver` (v1), el historial de conversación vivía **en memoria del proceso Lambda**. Si Lambda escalaba a múltiples instancias simultáneas (o la instancia se apagaba por inactividad), el contexto se perdía. Con `DynamoDBSaver`, cada checkpoint se persiste en DynamoDB usando `thread_id` como clave → el estado sobrevive reinicios, cold starts y escalado horizontal.

---

## Permisos DynamoDB en el rol Lambda

Política inline `nomadai-dynamodb-checkpoints` en el rol `nomadai-lambda-role`:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:DeleteItem",
    "dynamodb:Query",
    "dynamodb:BatchWriteItem"
  ],
  "Resource": "arn:aws:dynamodb:us-east-1:237216011543:table/nomadai-checkpoints"
}
```

---

## Limitaciones conocidas

- **Cold start**: primera invocación tras inactividad tarda ~5-10s extra. Mitigación futura: Provisioned Concurrency.
- **Concurrencia**: límite de cuenta en 10 ejecuciones concurrentes.

---

## Comandos de redeploy

```bash
ACCOUNT_ID=237216011543
REGION=us-east-1

aws ecr get-login-password --region $REGION | docker login \
  --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

docker build --platform linux/amd64 --provenance=false -t nomadai .
docker tag nomadai:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/nomadai:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/nomadai:latest

aws lambda update-function-code \
  --function-name nomadai \
  --image-uri $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/nomadai:latest \
  --region $REGION
```
