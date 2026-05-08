# NomadAI — Technical Review & Scalability Assessment
**Fecha:** Mayo 2026 | **Revisión:** v1.0 | **Alcance:** Full-stack, infraestructura, seguridad, escalabilidad

---

## 1. Lo que se construyó

### Producto
NomadAI es un recomendador inteligente de destinos para nómadas digitales. El usuario completa un onboarding visual (presupuesto, clima, hobbies, zona horaria, nacionalidad), el sistema corre un pipeline de IA que analiza miles de ciudades y devuelve las 3 mejores recomendaciones personalizadas, con costos, clima, visa, videos de YouTube, links de alojamiento y vuelos.

### Stack tecnológico
| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS v3 |
| Backend | FastAPI + LangGraph + LangChain |
| LLM | Gemini 2.5 Flash (Google) |
| Búsqueda web | Tavily API |
| Vector DB | Qdrant Cloud |
| Base de datos | DynamoDB (perfiles, reportes, jobs, rate limits, checkpoints) |
| Storage | S3 (checkpoints grandes, RAG) |
| Queue | SQS (jobs async) |
| Compute | AWS Lambda (container image) |
| CDN | CloudFront (pendiente, esperando aprobación AWS) |
| Dominio | nomadai.fit (Namecheap) |
| Auth | Google OAuth + Guest mode |
| CI/CD | GitHub Actions (develop → nomadai-dev, main → nomadai) |
| Observabilidad | LangSmith + CloudWatch |
| i18n | react-i18next (ES + EN, autodetección por navegador) |

### Funcionalidades implementadas
- **Onboarding visual multi-step** con slider de presupuesto, cards de clima, tags de hobbies, hobbies custom
- **Pipeline async de IA** (SQS → Lambda → LangGraph): profile → destination → enrichment → compiler → followup
- **Página de resultados** "Vete a Lisbon." con match score, stats grid, por qué tú/por qué ahora, alternativas
- **Página de detalle del destino** con breakdown de costos, gráfico de clima 12 meses, visa, YouTube, alojamiento, links de vuelos
- **Chat de seguimiento** contextual (followup node con checkpoints LangGraph)
- **Historial** con cards navegables → ReportDetail con tabs por ciudad y secciones desplegables
- **Sidebar** con sesiones guardadas, eliminar, navegación a detalle
- **RAG** con Qdrant Cloud (visa + clima por ciudad/nacionalidad, ~21 destinos)
- **Rate limiting** por usuario en DynamoDB (sliding window)
- **Entornos dev/prod** separados con infraestructura AWS independiente
- **Internacionalización** ES/EN en todo el frontend
- **Diseño nuevo** cream/naranja/serif (Cormorant Garamond) en toda la app

---

## 2. Problemas críticos — corregir antes de lanzar a producción

### 2.1 Seguridad

#### 🔴 CORS completamente abierto
**Archivo:** `app/api/main.py:48-53`
```python
app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)  # ← RIESGO
```
**Fix:**
```python
allow_origins=["https://nomadai.fit", "https://www.nomadai.fit"]
```

#### 🔴 `/chat/status/{job_id}` sin autenticación
**Archivo:** `app/api/main.py:230-236`

Cualquiera puede enumerar job_ids y leer resultados de otros usuarios.

**Fix:**
```python
@app.get("/chat/status/{job_id}")
def chat_status(job_id: str, current_user: str = Depends(get_current_user)):
    job = get_job(job_id)
    if not job or job.get("user_id") != current_user:
        raise HTTPException(403, "Not authorized")
    return job
```

#### 🔴 Google OAuth token en localStorage (vulnerable a XSS)
**Archivo:** `frontend/src/hooks/useAuth.tsx:26-32`
```typescript
localStorage.setItem('nomadai_credential', credential)  // ← RIESGO
```
**Fix:** Usar httpOnly cookies o una sesión de corta duración en memoria + refresh token en httpOnly cookie.

#### 🟡 `dangerouslySetInnerHTML` sin sanitización HTML
**Archivos:** `Chat.tsx:306`, `ReportDetail.tsx:189,222`, `DestinationDetail.tsx`

El Markdown generado por el LLM se renderiza directamente como HTML. Un contenido malicioso podría ejecutar JS.

**Fix:**
```bash
npm install dompurify @types/dompurify
```
```typescript
import DOMPurify from 'dompurify'
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(content)) }}
```

#### 🟡 Guest mode sin rate limiting efectivo
**Archivo:** `app/services/auth.py:21-22`

Un atacante genera 1000 guest UUIDs y hace 1000 jobs SQS sin límite.

**Fix:** Aplicar rate limiting también a guest tokens, y considerar un captcha invisible (Cloudflare Turnstile) antes de acceso a `/chat/async`.

#### 🟡 Errores del servidor exponen detalles internos
**Archivo:** `app/api/main.py:208`
```python
raise HTTPException(status_code=500, detail=str(e))  # ← expone stack trace
```
**Fix:**
```python
raise HTTPException(status_code=500, detail="Internal error")
# Loguear el detalle solo en servidor
```

---

### 2.2 Escalabilidad

#### 🔴 LLM reinicializado en cada llamada al nodo
**Archivos:** Todos los nodos (`profile_node.py`, `destination_node.py`, etc.)

Cada invocación crea una nueva instancia `ChatGoogleGenerativeAI` con overhead de autenticación.

**Fix:** Cache a nivel de módulo:
```python
# app/llm.py
from functools import lru_cache
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings

@lru_cache(maxsize=1)
def get_llm() -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )
```

#### 🔴 Lambda timeout 120s con pipeline que puede tardar 90s+
**Problema:** Con APIs externas lentas (Gemini 8-15s, Tavily 3-5s × 3 destinos), el pipeline puede exceder el timeout.

**Fix inmediato:**
```bash
aws lambda update-function-configuration --function-name nomadai --timeout 300
```
```bash
aws sqs set-queue-attributes \
  --queue-url ... \
  --attributes VisibilityTimeout=360
```

#### 🟡 Sin caché para consultas RAG repetidas
Usuarios diferentes preguntando sobre "Buenos Aires visa" ejecutan Qdrant N veces.

**Fix:**
```python
from functools import lru_cache

@lru_cache(maxsize=500)
def search_rag_cached(query: str, k: int = 3) -> tuple[str, ...]:
    return tuple(search_rag(query, k))
```

#### 🟡 Sin timeouts en llamadas a APIs externas
**Archivos:** `app/tools/search_tool.py`, `app/tools/weather_tool.py`, `app/tools/youtube_tool.py`

Si Tavily se congela, Lambda espera hasta el timeout global.

**Fix:**
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=5))
def search_web(query: str, max_results: int = 3) -> list[str]:
    try:
        response = client.search(query=query, max_results=max_results, timeout=5)
        return [r["content"] for r in response.get("results", [])]
    except TimeoutError:
        return []
```

---

### 2.3 CI/CD

#### 🔴 Deploy no requiere que pasen los tests
**Archivo:** `.github/workflows/deploy.yml`

El workflow de deploy corre en paralelo al de CI, no depende de él.

**Fix:**
```yaml
jobs:
  deploy:
    needs: [test]  # ← AGREGAR ESTA LÍNEA
```

#### 🔴 Sin smoke tests post-deploy
```yaml
- name: Smoke test
  run: |
    URL=$(aws lambda get-function-url-config --function-name $LAMBDA --query FunctionUrl --output text)
    curl -f "${URL}health" || exit 1
```

---

### 2.4 Resiliencia

#### 🔴 Sin retry logic con backoff exponencial
Los nodos del pipeline fallan directamente si una API externa devuelve error transitorio. Instalar `tenacity` y decorar todas las llamadas externas.

#### 🟡 Sin circuit breaker
Si Gemini está down, 1000 Lambdas concurrentes quedan bloqueadas 120s cada una.

**Fix:** Usar `pybreaker`:
```python
from pybreaker import CircuitBreaker

gemini_breaker = CircuitBreaker(fail_max=5, reset_timeout=60)

@gemini_breaker
def call_llm(messages):
    return llm.invoke(messages)
```

#### 🟡 Rate limiter "falla abierto" sin fallback local
Si DynamoDB cae, permite todas las requests. Agregar cache local en memoria como fallback.

---

## 3. Deuda técnica — prioridad media

### Backend

| Problema | Ubicación | Impacto |
|----------|-----------|---------|
| Lógica duplicada entre `main.py` y `handler.py` | Ambos archivos | Bugs que se arreglan en uno no se propagan al otro |
| `extract_json()` frágil con regex greedy | `app/utils.py` | Falla con JSON anidados complejos |
| Sin logging estructurado (JSON) | Todos los archivos | Imposible hacer queries en CloudWatch a escala |
| Magic strings sin constantes | Multiple archivos | Refactors peligrosos |
| Sin validación de rangos en `ProfilePatch` | `app/api/main.py:124` | `budget: -100` o `hobbies: []` son válidos |

### Frontend

| Problema | Ubicación | Impacto |
|----------|-----------|---------|
| Design tokens (`BG`, `ACCENT`, `DARK`) duplicados en 5 archivos | Múltiples páginas | Un cambio de color requiere editar 5 archivos |
| `getYouTubeId()` duplicado | `lib/marked.ts` y `DestinationDetail.tsx` | Inconsistencia si cambia la lógica |
| `Onboarding.tsx` tiene 503 líneas | `pages/Onboarding.tsx` | Difícil de mantener y testear |
| `Chat.tsx` tiene 380 líneas | `pages/Chat.tsx` | Funciones `pollJob`, `send`, `handleReset` deberían ser hooks |
| Sin lazy loading de rutas | `App.tsx` | Todo el bundle se carga de una vez |
| sessionStorage sin debounce | `Chat.tsx:119` | N escrituras por mensaje largo |
| Polling a intervalo fijo 3s | `Chat.tsx:157` | Sin backoff, 120 requests/usuario por sesión |
| Sin Error Boundaries | Toda la app | Si Markdown falla, toda la página crashea |
| Mezcla de inline styles + Tailwind | Todos los archivos | Inconsistente, difícil de mantener |

### Tests

Cobertura actual: ~35 tests cubriendo API, nodos y servicios. Faltan:
- `parseReport()` en `ReportDetail.tsx`
- `wrapH3Sections()` en `Chat.tsx`
- Lógica de timezone en `destination_node.py`
- Integración end-to-end del pipeline completo

---

## 4. Observabilidad — prioridad alta antes de escalar

### Lo que falta hoy

```
❌ CloudWatch Alarms (error rate, duración, SQS backlog)
❌ Distributed tracing (X-Ray o OTEL)
❌ Structured logging (JSON parseble)
❌ Métricas de negocio (reportes/día, destinos populares, tasa de conversión)
❌ Dashboard de performance (Grafana o CloudWatch)
❌ Alertas por email/Slack cuando hay errores
```

### Implementación mínima viable

```python
# Structured logging en todos los archivos
import structlog
logger = structlog.get_logger()
logger.info("report_generated", user_id=user_id, session_id=session_id, duration_s=elapsed)
```

```bash
# CloudWatch Alarm básica
aws cloudwatch put-metric-alarm \
  --alarm-name nomadai-lambda-errors \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --threshold 5 \
  --alarm-actions arn:aws:sns:...:alerts
```

---

## 5. Análisis de costos a escala

### Escenario: 10.000 usuarios activos/mes

| Servicio | Costo estimado/mes |
|----------|-------------------|
| Lambda (5 min × 1024MB × 10K jobs) | ~$60 |
| DynamoDB (reads + writes) | ~$35 |
| Gemini 2.5 Flash (tokens) | ~$180 |
| Tavily API (500 calls/mes = limite free tier) | $0 → $50 con plan pagado |
| YouTube API | $0 (free tier generoso) |
| Qdrant Cloud | $25 (plan básico) |
| SQS | $0.40 |
| S3 | $2 |
| ECR | $1 |
| CloudFront | $5 |
| **Total** | **~$360/mes** |

### Escenario: 1.000.000 usuarios activos/mes

| Servicio | Costo estimado/mes |
|----------|-------------------|
| Lambda | ~$6.000 |
| DynamoDB | ~$300 |
| Gemini 2.5 Flash | ~$18.000 |
| Tavily API | ~$2.000 (plan enterprise) |
| Qdrant Cloud | ~$200 (cluster dedicado) |
| SQS | ~$40 |
| S3 + CloudFront | ~$100 |
| **Total** | **~$26.640/mes** |

### Optimizaciones de costo para escalar

1. **Caché de resultados similares** — Si dos usuarios con perfiles muy similares (mismo timezone, presupuesto, hobbies) hacen la misma búsqueda, reusar el resultado. Ahorra ~80% del costo de LLM.
2. **Downgrade de modelo para usuarios free** — Gemini 1.5 Flash es 10x más barato.
3. **Batch writes en DynamoDB** — Reducir WCU con operaciones batch.
4. **Rate limiting más agresivo** — 5 req/hora en lugar de 30.
5. **ECR lifecycle policy** — Mantener solo 3 imágenes (ahorrar ~$0.80/mes en storage).

---

## 6. Roadmap de mejoras futuras

### Fase inmediata (antes de lanzar)
- [ ] Restringir CORS a dominio propio
- [ ] Autenticar `/chat/status`
- [ ] Sanitizar HTML con DOMPurify
- [ ] Aumentar Lambda timeout a 300s
- [ ] Tests como requisito en CI/CD
- [ ] Smoke tests post-deploy

### Corto plazo (1-3 meses)
- [ ] Structured logging + CloudWatch Alarms
- [ ] Retry logic con `tenacity` en todas las APIs externas
- [ ] Circuit breaker con `pybreaker`
- [ ] Centralizar design tokens en `src/styles/tokens.ts`
- [ ] Lazy loading de rutas con `React.lazy()`
- [ ] Error Boundaries en páginas críticas
- [ ] Cache LLM a nivel de módulo
- [ ] Mover tokens a httpOnly cookies
- [ ] Rate limiting para guest mode

### Mediano plazo (3-6 meses)
- [ ] AWS Secrets Manager para API keys
- [ ] X-Ray tracing distribuido
- [ ] Dashboard de métricas de negocio
- [ ] Caché de resultados por perfil similar (DynamoDB + hash de perfil)
- [ ] Sistema de tiering: free (Gemini Flash) vs premium (Gemini Pro)
- [ ] Soporte multiidioma en el backend (más allá de ES/EN)
- [ ] Expansión del RAG: más destinos, más nacionalidades, hobbies verificados
- [ ] Integración con APIs reales: Nomad List, Numbeo, Coworker.com
- [ ] Agregar "ciudad de origen" al onboarding para pre-completar links de vuelos
- [ ] Notificaciones push cuando el reporte está listo (en lugar de polling)

### Largo plazo (6-12 meses)
- [ ] Migrar de Lambda a ECS Fargate si el p95 de latencia supera 10s con cold starts
- [ ] MSK (Kafka) en lugar de SQS si el volumen supera 10K mensajes/día (replay, múltiples consumers)
- [ ] Redis para caché distribuido de RAG y resultados
- [ ] Multi-región (us-east-1 + eu-west-1) para latencia global
- [ ] Modelo fine-tuned propio sobre Gemini para recomendaciones de destinos
- [ ] App móvil (React Native con el mismo backend)
- [ ] API pública para partners (agencias de viaje, plataformas de nómadas)
- [ ] Mapa interactivo de destinos con filtros en tiempo real
- [ ] Integración con calendarios para recomendaciones estacionales
- [ ] Sistema de reviews de usuarios sobre destinos visitados

---

## 7. Arquitectura objetivo para millones de usuarios

```
                    ┌─────────────────────────────────────────┐
                    │                CloudFront                │
                    │         (WAF + rate limiting IP)         │
                    └──────────────────┬──────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
     ┌────────▼────────┐    ┌──────────▼─────────┐   ┌────────▼────────┐
     │  API Gateway    │    │   Static Assets     │   │  Auth Service   │
     │  (HTTP API)     │    │   (S3 + CloudFront) │   │  (Lambda@Edge)  │
     └────────┬────────┘    └────────────────────┘    └────────────────┘
              │
     ┌────────▼────────────────────────────────────────────────────┐
     │                     ECS Fargate                             │
     │              (FastAPI + LangGraph workers)                  │
     │     Auto-scaling: 2-50 tasks según CPU/memory               │
     └────────┬────────────────────────────────────────────────────┘
              │
     ┌────────▼────────────────────────────────────────────────────┐
     │                     MSK (Kafka)                             │
     │    Topic: nomadai-jobs (particionado por user_id)           │
     │    Retention: 24h, Consumer groups: pipeline-workers        │
     └────────┬────────────────────────────────────────────────────┘
              │
     ┌────────▼────────────────────────────────────────────────────┐
     │                  Pipeline Workers (ECS)                     │
     │  profile → destination → enrichment → compiler → followup   │
     │  Con Redis cache + circuit breakers + retry logic           │
     └────────┬────────────────────────────────────────────────────┘
              │
     ┌────────▼──────────┐  ┌──────────────┐  ┌──────────────────┐
     │   Aurora          │  │  ElastiCache │  │  OpenSearch      │
     │   PostgreSQL      │  │  (Redis)     │  │  (Logs +         │
     │   (profiles,      │  │  (sessions,  │  │   Analytics)     │
     │    reports)       │  │   RAG cache) │  │                  │
     └───────────────────┘  └──────────────┘  └──────────────────┘
```

### Por qué estos cambios a escala

| Actual | A escala | Razón |
|--------|----------|-------|
| Lambda | ECS Fargate | Lambda cold starts (~3s) intolerables en pico. Fargate mantiene containers calientes con auto-scaling suave |
| SQS | MSK Kafka | Replay de mensajes, múltiples consumers, particionado por user_id para orden garantizado |
| DynamoDB | Aurora PostgreSQL | Queries relacionales complejas (reportes por ciudad, analytics de hobbies), menor costo a escala |
| Sin cache | Redis ElastiCache | Cache de sesiones, resultados de RAG, perfiles de usuario frecuentes |
| CloudWatch | OpenSearch + Grafana | Visualizaciones avanzadas, correlación de traces, dashboards de negocio |

---

## 8. Fortalezas del proyecto

El proyecto tiene una base arquitectónica sólida para crecer:

✅ **Pipeline asíncrono** — HTTP retorna en 100ms, procesamiento en background. Correcto desde el día 1.

✅ **Checkpointing de estado** — LangGraph + DynamoDB persiste el estado de conversación. Las sesiones sobreviven reinicios de Lambda.

✅ **Separación de entornos** — Dev/prod completamente separados en AWS con CI/CD automático por rama.

✅ **Autenticación real** — Google OAuth validado en cada request, no confiamos en datos del cliente.

✅ **RAG verificado** — Knowledge base con fuentes verificadas (visa/clima) en lugar de alucinaciones puras del LLM.

✅ **Enriquecimiento paralelo** — `asyncio.gather()` en enrichment_node. 4 tareas en paralelo en lugar de secuencial.

✅ **Filtros de destino estrictos** — Timezone, presupuesto, idioma como filtros no negociables.

✅ **i18n desde el día 1** — Autodetección de idioma, soporte ES/EN, extensible a cualquier idioma.

✅ **Diseño consistente** — Sistema de diseño cream/naranja con tipografía editorial en toda la app.

✅ **Datos estructurados** — El compiler genera JSON (no solo markdown), lo que permite UIs ricas y tipadas.

---

*Documento generado tras revisión completa del código base. Actualizar con cada major release.*
