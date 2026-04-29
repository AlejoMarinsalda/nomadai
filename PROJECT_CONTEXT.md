# NomadAI — Contexto completo del proyecto

> Este archivo existe para restaurar el contexto completo del proyecto en caso de pérdida de sesión.
> Contiene el estado actual del código, decisiones tomadas, problemas resueltos y próximos pasos.

---

## 1. Concepto del producto

**NomadAI** es una aplicación conversacional para nómadas digitales.
El usuario describe su perfil (hobbies, presupuesto, zona horaria, nacionalidad, objetivos, clima preferido)
y el sistema recomienda 3 destinos ideales con información detallada sobre:
- Score de afinidad con el perfil
- Costo mensual estimado
- Mejor época del año para ir (clima)
- Requisitos de visa según nacionalidad
- Links de YouTube con reviews del lugar
- Posibilidad de preguntas de seguimiento post-reporte

**Competidor más cercano:** Nomad List (nomadlist.com) — base de datos estática sin IA ni personalización.
**Diferenciador clave:** conversación natural + matching inteligente + info de visa + followup conversacional.

---

## 2. Stack tecnológico actual

| Capa | Tecnología |
|---|---|
| LLM | Google Gemini 2.0 Flash (`gemini-2.0-flash`) vía `langchain-google-genai` |
| Orquestación | LangGraph (`StateGraph`) + LangChain |
| API backend | FastAPI + Uvicorn |
| Frontend | HTML/JS vanilla servido por FastAPI en `/` |
| Búsqueda web | Tavily API (`tavily-python`) |
| Clima | Open-Meteo API (gratis, sin key) |
| Videos | YouTube Data API v3 |
| Estado de sesión | `MemorySaver` de LangGraph (en memoria, se pierde al reiniciar) |
| Monitoreo | LangSmith (tracing automático con env vars) |
| Infra futura | AWS (Bedrock, Lambda/ECS, DynamoDB, Aurora pgvector, S3, CloudFront) |

### Variables de entorno requeridas (`.env`)
```
GOOGLE_API_KEY=AIza...
GOOGLE_MODEL_ID=gemini-2.0-flash

TAVILY_API_KEY=tvly-...        # Búsqueda web (visa_node + media_node)
YOUTUBE_API_KEY=AIza...        # Videos por destino

LANGCHAIN_TRACING_V2=true      # LangSmith tracing
LANGCHAIN_API_KEY=ls__...      # LangSmith API key
LANGCHAIN_PROJECT=nomadai      # Nombre del proyecto en LangSmith

LOG_LEVEL=INFO
```

**IMPORTANTE:** `load_dotenv()` se llama al inicio de `app/api/main.py` ANTES de cualquier
import de LangChain para que las variables de LangSmith queden en `os.environ`.

---

## 3. Estructura de archivos

```
nomadai/
├── app/
│   ├── api/
│   │   └── main.py              # FastAPI: endpoints /health /chat /chat/stream /
│   ├── config.py                # Settings con pydantic-settings (extra="ignore")
│   ├── utils.py                 # extract_json() — extrae JSON de markdown
│   ├── graph/
│   │   ├── state.py             # Modelos Pydantic del estado
│   │   └── nomad_graph.py       # StateGraph con todos los nodos
│   ├── nodes/
│   │   ├── profile_node.py      # Recolecta perfil del usuario
│   │   ├── destination_node.py  # Recomienda 3 destinos (JSON via Gemini)
│   │   ├── media_node.py        # YouTube + búsqueda de influencers
│   │   ├── climate_node.py      # Datos climáticos via Open-Meteo
│   │   ├── visa_node.py         # Requisitos de visa (Gemini + Tavily)
│   │   ├── compiler_node.py     # Genera reporte final en markdown
│   │   └── followup_node.py     # Responde preguntas post-reporte
│   ├── tools/
│   │   ├── search_tool.py       # search_web() via Tavily
│   │   ├── weather_tool.py      # get_climate_summary() via Open-Meteo
│   │   └── youtube_tool.py      # search_youtube_reviews() via YouTube API
│   └── static/
│       └── index.html           # Frontend chat (HTML/JS vanilla)
├── docs/
│   ├── rag_architecture.md      # Diseño técnico del RAG híbrido (próxima feature)
│   ├── cost_estimation.md       # Comparativa de costos con y sin RAG
│   └── business_model.md        # Modelo de negocio y proyecciones financieras
├── tests/
│   └── test_graph.py
├── requirements.txt
├── .env.example
└── .gitignore
```

---

## 4. Modelos de datos (`app/graph/state.py`)

```python
class UserProfile(BaseModel):
    hobbies: list[str]
    budget_usd_monthly: int | None
    work_timezone: str | None
    nationality: str | None
    goals: list[str]
    preferred_climate: str | None
    remote_work: bool = True

class DestinationMedia(BaseModel):
    youtube_links: list[str]
    photos: list[str]
    influencers: list[str]

class VisaInfo(BaseModel):
    visa_required: bool | None
    visa_type: str | None
    max_stay_days: int | None
    requirements: list[str]
    source_url: str | None

class ClimateInfo(BaseModel):
    best_months: list[str]
    avoid_months: list[str]
    avg_temp_celsius: float | None
    rainy_season: str | None

class Destination(BaseModel):
    city: str
    country: str
    match_score: float          # 0-100
    match_reasons: list[str]
    monthly_cost_usd: int | None
    media: DestinationMedia
    visa: VisaInfo
    climate: ClimateInfo

class NomadState(BaseModel):
    messages: Annotated[list[Any], add_messages]  # historial conversacional
    user_profile: UserProfile
    profile_complete: bool = False
    destinations: list[Destination]
    final_report: str | None = None
    error: str | None = None
```

---

## 5. Grafo LangGraph (`app/graph/nomad_graph.py`)

### Flujo completo
```
ENTRY POINT dinámico:
  ¿Existe final_report en el estado?
    SÍ → followup_node  (responde preguntas sobre los destinos ya recomendados)
    NO → profile_node   (recolección de perfil o pipeline completo)

FLUJO DE PERFIL:
  profile_node → ¿profile_complete?
    SÍ → destination_node
    NO → END (espera el próximo mensaje del usuario)

PIPELINE DE ENRIQUECIMIENTO (secuencial):
  destination_node → media_node → climate_node → visa_node → compiler_node → END

FOLLOWUP:
  followup_node → END
```

### Decisión de diseño importante
El `_entry_point` chequea SOLO `state.final_report` (string plano).
NO chequea `state.destinations` porque los objetos Pydantic anidados
pueden vaciarse al deserializar desde `MemorySaver`, causando que
`_entry_point` rutee a `profile` en vez de `followup`.

---

## 6. Nodos — descripción y comportamiento

### `profile_node`
- Si `state.profile_complete` es True → devuelve `{}` sin llamar al LLM (evita reprocessing)
- Usa `extract_json()` para parsear la respuesta de Gemini (puede venir en bloque markdown)
- Cuando detecta todos los 6 campos → setea `profile_complete=True` y retorna `UserProfile`
- Instrucción explícita en el system prompt: NO pedir destinos al usuario

### `destination_node`
- Llama a Gemini con el perfil completo
- Gemini devuelve JSON array de 3 destinos
- Usa `extract_json()` para parsear (Gemini frecuentemente envuelve en ```json```)
- Si el parseo falla → retorna `{"error": "..."}` con el texto de la respuesta

### `media_node`
- Busca videos en YouTube via `search_youtube_reviews()`
- Busca influencers via `search_web()` (Tavily)
- Si `YOUTUBE_API_KEY` o `TAVILY_API_KEY` no están configuradas → devuelve listas vacías silenciosamente

### `climate_node`
- Usa Open-Meteo Geocoding API + Climate API (sin API key, gratis)
- Calcula promedio mensual de temperatura de datos históricos 1991-2020
- Si falla → devuelve `ClimateInfo()` vacío (no bloquea el pipeline)

### `visa_node`
- Busca con Tavily: `"visa requirements {nationality} citizens {country} digital nomad 2024"`
- Si `TAVILY_API_KEY` no está configurada → contexto vacío = "Sin resultados de búsqueda."
- Gemini sintetiza la info de visa desde los snippets de búsqueda
- Usa `extract_json()` para parsear la respuesta

### `compiler_node`
- Formatea cada `Destination` con `_format_destination()`
- Pasa el contexto completo a Gemini
- Gemini genera el reporte final en español con markdown y emojis
- Retorna `{"final_report": string}`

### `followup_node`
- Solo usa el ÚLTIMO mensaje del usuario (no todo el historial) para evitar confusión del LLM
- Pasa como contexto: perfil del usuario + reporte completo + lista de destinos
- System prompt explícito: NO pedir destinos, NO pedir info del perfil

---

## 7. API (`app/api/main.py`)

### Endpoint principal: `POST /chat`

**Request:**
```json
{"message": "texto del usuario", "session_id": "uuid-opcional"}
```

**Response:**
```json
{
  "session_id": "uuid",
  "reply": "texto de respuesta",
  "final_report": "null o markdown del reporte",
  "profile_complete": false
}
```

**Lógica clave:**
```python
# Antes de invocar el grafo, chequear si ya existía un reporte
prev_state = graph.get_state(config)
had_report = bool(prev_state.values.get("final_report") if prev_state and prev_state.values else False)

result = graph.invoke(...)

# Si el reporte ya existía → es un followup → devolver reply, no final_report
final_report = None if had_report else result.get("final_report")
```

Esto resuelve el bug donde el frontend mostraba el reporte viejo en vez de la respuesta del followup.

### Frontend (`app/static/index.html`)
- Chat vanilla JS servido por FastAPI en `/`
- Persiste `sessionId` en variable JS (se resetea al refrescar)
- Muestra `final_report` (markdown) cuando existe, sino muestra `reply`
- Renderiza markdown con la librería `marked.js` desde CDN

---

## 8. Utilidad clave: `extract_json()` (`app/utils.py`)

Gemini frecuentemente devuelve JSON envuelto en bloques markdown ` ```json ``` `.
Esta función lo extrae en cualquier formato:
1. Intenta parsear directo
2. Busca dentro de ` ```json ... ``` `
3. Busca cualquier bloque `[...]` o `{...}` en el texto

**Todos los nodos que parsean JSON deben usar esta función**, no `json.loads()` directo.

---

## 9. Problemas resueltos y sus soluciones

| Problema | Causa | Solución |
|---|---|---|
| Pipeline se colgaba infinitamente | Loop en `profile_node` cuando perfil incompleto | `_after_profile` va a `END` en vez de `"profile"` |
| JSON no parseaba | Gemini envuelve en ` ```json ``` ` | `extract_json()` en `utils.py` |
| Followup mostraba reporte viejo | `final_report` en estado → siempre se devolvía | Chequear estado previo antes de invoke en `main.py` |
| `_entry_point` ignoraba followup | `destinations` vacío al deserializar de MemorySaver | Chequear solo `final_report` en `_entry_point` |
| CORS error en Swagger | Faltaba `CORSMiddleware` | Agregado en `main.py` |
| LangSmith no trackeaba | `pydantic-settings` no pone vars en `os.environ` | `load_dotenv()` antes de imports de LangChain |
| `pydantic_core.ValidationError` | LangSmith vars rechazadas por Settings | `extra="ignore"` en `model_config` |
| Bedrock bloqueado en AWS | Cuenta nueva, acceso a Anthropic pendiente | Migrar a Gemini (Google AI Studio) temporalmente |
| Búsqueda web sin resultados | `TAVILY_API_KEY` no configurada | Documentado — requiere key real de `app.tavily.com` |
| Info incorrecta sobre hobbies | LLM genera desde memoria, no desde datos reales | Solución planificada: RAG híbrido (ver `docs/rag_architecture.md`) |

---

## 10. Estado actual del proyecto

### ✅ Funcionando
- Chat conversacional completo (perfil → reporte → followup)
- Pipeline LangGraph: profile → destination → media → climate → visa → compiler
- Frontend HTML/JS sirviendo desde FastAPI
- LangSmith tracing activo
- Gemini 2.0 Flash como LLM
- Reporte en markdown con emojis, score de afinidad, info de visa

### ⚠️ Parcialmente funcionando
- `media_node`: YouTube links son búsquedas genéricas (falta `YOUTUBE_API_KEY` real)
- `visa_node`: info de visa generada por LLM sin búsqueda web (falta `TAVILY_API_KEY`)
- `climate_node`: datos climáticos reales pero a veces sin resultados si Open-Meteo falla
- `MemorySaver`: estado se pierde al reiniciar uvicorn (para dev está bien, prod necesita DynamoDB)

### 🔜 Próximas features planificadas
1. **RAG híbrido** (ver `docs/rag_architecture.md`): ChromaDB local → Aurora pgvector en AWS
2. **hobby_enrichment_node**: enriquecimiento verificado de hobbies antes del compiler
3. **Monetización**: freemium $9.99/mes + afiliados Booking.com/SafetyWing
4. **Deploy AWS**: Lambda + DynamoDB + Aurora + S3/CloudFront

---

## 11. Cómo correr el proyecto localmente

```bash
cd nomadai

# 1. Instalar dependencias
pip install -r requirements.txt

# 2. Crear .env desde el ejemplo y completar las keys
cp .env.example .env

# 3. Correr el servidor
uvicorn app.api.main:app --reload

# 4. Abrir el chat
# http://127.0.0.1:8000
# http://127.0.0.1:8000/docs  (Swagger UI)
```

---

## 12. Arquitectura AWS futura (referencia rápida)

```
Frontend:      S3 + CloudFront (index.html estático)
Backend:       Lambda (imagen Docker) o ECS Fargate
LLM:           Bedrock (Claude Sonnet 4.6) o mantener Gemini
Estado:        DynamoDB (reemplaza MemorySaver)
Vector store:  Aurora PostgreSQL Serverless v2 + pgvector (reemplaza ChromaDB)
Embeddings:    Amazon Titan Embeddings (Bedrock)
Monitoring:    LangSmith Pro
RAG refresh:   EventBridge + Lambda (semanal)
```

Cambios de código para migrar a AWS:
- `MemorySaver` → `DynamoDBSaver` (una línea en `nomad_graph.py`)
- `get_vector_store()` → devuelve `PGVector` cuando `NOMADAI_ENV=production`
- `ChatGoogleGenerativeAI` → `ChatBedrock` si se migra a Claude (una línea por nodo)

---

## 13. Decisiones de arquitectura tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Gemini en vez de Bedrock | AWS Bedrock (Claude) | Cuenta AWS bloqueó acceso a Anthropic. Migración fácil cuando se resuelva |
| Pipeline secuencial | Nodos paralelos | Fan-out/fan-in de LangGraph requiere `Send` API, más complejo. Secuencial funciona bien |
| `final_report` como señal de estado | Flag `is_followup` | String plano serializa correctamente en MemorySaver; Pydantic anidado se vacía |
| `extract_json()` compartido | `json.loads()` directo | Gemini consistentemente envuelve JSON en markdown |
| `load_dotenv()` al inicio de `main.py` | Confiar en pydantic-settings | pydantic-settings no setea `os.environ`; LangSmith lo lee de ahí |

---

## 14. Contexto del desarrollador

- Proyecto educativo iniciado en Platzi
- Primera vez trabajando con AWS (cuenta creada, Bedrock temporalmente bloqueado)
- Stack principal anterior: no especificado
- Objetivo: aprender LangChain/LangGraph + AWS deployando un producto real
- El producto tiene potencial comercial real (modelo freemium + afiliados planificado)
