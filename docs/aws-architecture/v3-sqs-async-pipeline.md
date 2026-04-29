# v3 — Async Pipeline con SQS

**Fecha:** 2026-04-28  
**Sobre la versión anterior:** v2 (Lambda + DynamoDB checkpoints)

---

## Problema que resuelve

En v2 el endpoint `/chat` bloqueaba la conexión HTTP durante ~89 segundos mientras el pipeline LangGraph procesaba. Esto tiene dos problemas:
- El browser mantiene la conexión abierta todo ese tiempo (frágil ante cortes de red)
- El usuario no recibe feedback de progreso

Con v3 el request HTTP retorna en ~100ms. El procesamiento pesado ocurre en background.

---

## Arquitectura

```
Browser
  │
  ├─ POST /chat/async ──► Lambda (HTTP) ──► SQS Queue
  │       ↓ {job_id}                      nomadai-chat-jobs
  │
  ├─ GET /chat/status/{job_id}  (polling cada 3s)
  │       ↓ {status: "pending" | "done" | "error"}
  │
  └─ Cuando status="done" → muestra resultado
                                             │
                              SQS trigger    ▼
                           Lambda (mismo contenedor)
                                   │
                             LangGraph pipeline (~89s)
                                   │
                            DynamoDB nomadai-jobs
                             (guarda resultado)
```

---

## Componentes AWS

| Servicio | Recurso | Propósito |
|---|---|---|
| Lambda | `nomadai` | Sirve HTTP (FastAPI) Y procesa SQS — mismo contenedor |
| SQS | `nomadai-chat-jobs` | Cola de mensajes entre el endpoint HTTP y el procesador |
| DynamoDB | `nomadai-jobs` | Almacena resultados temporales de jobs (TTL: 24h) |
| DynamoDB | `nomadai-checkpoints` | Estado LangGraph (sin cambios) |
| DynamoDB | `nomadai-profiles` | Perfiles de usuario (sin cambios) |
| S3 | `nomadai-checkpoints-offload` | Offload de checkpoints >350KB (sin cambios) |
| ECR | `nomadai` | Imagen Docker |

---

## Cómo un Lambda sirve dos propósitos

`handler.py` detecta el tipo de evento antes de procesarlo:

```python
def handler(event, context):
    records = event.get("Records", [])
    if records and records[0].get("eventSource") == "aws:sqs":
        return _process_sqs(event)      # ← evento de SQS
    return _http_handler(event, context) # ← request HTTP
```

AWS envía eventos con estructuras diferentes según el origen:
- **Function URL** → `{"requestContext": {"http": {...}}, "body": "...", ...}`
- **SQS Event Source Mapping** → `{"Records": [{"eventSource": "aws:sqs", "body": "..."}]}`

### Por qué un solo Lambda y no dos

Podríamos tener un Lambda para HTTP y otro para SQS. Pero con un solo contenedor:
- Un solo build/deploy
- El código del pipeline LangGraph no se duplica
- Menos IAM roles y recursos que mantener

El trade-off: si el pipeline está tardando 89s y llegan muchos requests HTTP simultáneos, Lambda puede estar ocupado. En práctica con `batch-size 1` SQS invoca una instancia Lambda separada por mensaje.

---

## SQS: configuración clave

- **VisibilityTimeout: 360s** — mayor que el timeout de Lambda (300s). Si Lambda no termina en 360s, SQS hace el mensaje visible de nuevo para reintento. Si fuera menor que el timeout de Lambda, el mensaje se procesaría dos veces.
- **MessageRetentionPeriod: 3600s** — mensajes sin procesar se borran en 1 hora.
- **BatchSize: 1** — Lambda procesa un mensaje a la vez. Cada chat = una invocación Lambda separada.

---

## Event Source Mapping

```bash
aws lambda create-event-source-mapping \
  --function-name nomadai \
  --event-source-arn arn:aws:sqs:us-east-1:237216011543:nomadai-chat-jobs \
  --batch-size 1
```

Esto hace que Lambda "escuche" la cola automáticamente. AWS se encarga del polling interno — no hay código extra para eso.

---

## Endpoints

| Método | Path | Descripción |
|---|---|---|
| POST | `/chat/async` | Envía mensaje a SQS, retorna `{job_id}` en ~100ms |
| GET | `/chat/status/{job_id}` | Consulta resultado en DynamoDB |
| POST | `/chat` | Endpoint síncrono original (sigue funcionando) |

---

## Ciclo de vida de un mensaje en la cola

Cuando un mensaje entra a SQS pasa por estos estados:

```
POST /chat/async enviado  →  "Messages available" = 1   (visible, esperando Lambda)
Lambda lo toma            →  "Messages available" = 0   (invisible durante VisibilityTimeout)
Lambda termina OK         →  mensaje se borra            (desaparece para siempre)
Lambda falla              →  mensaje reaparece           (después de 360s, para reintento)
```

Por eso al hacer "Poll for messages" en la consola SQS durante el procesamiento siempre
vas a ver 0 mensajes — no es un error, el mensaje está "in flight". Para monitorear
actividad real, usá la pestaña **Monitoring** → gráfico "Number of messages received".

---

## Comportamiento a escala

### 5000 sesiones paralelas

El límite de cuenta de Lambda es 1000 ejecuciones simultáneas. Con 5000 mensajes en SQS:

```
Con SQS:
  Todos los usuarios    → job_id en ~100ms  ✓  (ningún request se pierde)
  Usuarios 1-1000       → resultado en ~56s
  Usuarios 1001-5000    → esperan en cola, resultado en ~224s  (4000/1000 × 56s)

Sin SQS (sync):
  Usuarios 1-1000       → respuesta en ~56s
  Usuarios 1001-5000    → timeout, conexión HTTP cortada, request perdido  ✗
```

SQS se vuelve **más** valioso a mayor escala — es el buffer que garantiza que ningún
request se pierda aunque Lambda esté saturado.

### Cuellos de botella reales a escala

1. **Lambda concurrency (1000)** — se resuelve pidiendo aumento de quota a AWS
2. **Rate limits de APIs externas** — Gemini, Tavily y YouTube tienen cuotas por minuto.
   1000 Lambdas simultáneas haciendo 3 llamadas a Gemini = 3000 req/min. Requiere
   exponential backoff y posiblemente una cola por API.
3. **DynamoDB** — PAY_PER_REQUEST escala automáticamente, no es un cuello de botella.

### Por qué los followups también deben ir por SQS a escala

Los followups son rápidos (~10s vs ~56s del pipeline completo). A priori parece que
deberían ir por el endpoint síncrono. Pero a escala alta esto genera **contención**:

```
Sin SQS para followups (sync):
  1000 Lambdas atendiendo conexiones HTTP de followup (10s c/u)
  + 4000 mensajes de pipeline esperando en SQS
  = esos 1000 Lambdas NO pueden procesar el pipeline mientras tienen la conexión abierta

Con todo por SQS:
  Lambda nunca mantiene conexiones HTTP abiertas
  Procesa followups (10s) y los libera rápido para el siguiente mensaje
  SQS regula el orden sin contención entre tipos de request
```

El desacoplamiento de SQS elimina la presión del HTTP server del procesamiento.
A mayor escala, ese desacoplamiento vale más.

---

## Costo adicional vs v2

A 300 usuarios, 5 mensajes/día:
- SQS: ~135,000 operaciones/mes → dentro del free tier (1M) → **$0**
- DynamoDB jobs: ~1.35M reads/mes → ~$0.09/mes
- Lambda polling: ~350,000 invocaciones extra → ~$0.07/mes
- **Total adicional: ~$0.16/mes**

---

## Comandos de re-deploy

```bash
# Desde nomadai/
docker build --platform linux/amd64 --provenance=false -t nomadai .
docker tag nomadai:latest 237216011543.dkr.ecr.us-east-1.amazonaws.com/nomadai:latest
docker push 237216011543.dkr.ecr.us-east-1.amazonaws.com/nomadai:latest
aws lambda update-function-code \
  --function-name nomadai \
  --image-uri 237216011543.dkr.ecr.us-east-1.amazonaws.com/nomadai:latest
aws lambda wait function-updated --function-name nomadai
```
