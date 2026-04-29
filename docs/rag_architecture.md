# RAG Híbrido — Arquitectura de Enriquecimiento de Hobbies

## Problema
El LLM genera información sobre hobbies en los destinos desde su memoria de entrenamiento,
lo que produce datos incorrectos o desactualizados. Ejemplo real: el modelo afirmó que Manila
no tiene torneos globales de poker, cuando en realidad alberga el APT, APPT y WSOP Circuit.

## Solución
Pre-indexar datos curados de los 50 destinos nómadas más populares en un vector store.
Al recomendar un destino, se recupera información verificada del RAG antes de generar el reporte.
Si el destino no está indexado, se hace fallback a búsqueda web en tiempo real (Tavily).

---

## Pipeline resultante

```
profile → destination → media → climate → visa → hobby_enrichment → compiler
                                                        ↑ NUEVO
```

---

## Estructura de archivos

```
nomadai/
├── app/
│   ├── rag/
│   │   ├── __init__.py
│   │   ├── vector_store.py        # Abstracción ChromaDB (dev) / pgvector (prod AWS)
│   │   └── retriever.py           # Lógica de query + threshold + fallback Tavily
│   ├── nodes/
│   │   └── hobby_enrichment_node.py   # Nuevo nodo del grafo
│   └── graph/
│       ├── state.py               # + HobbyInfo model + Destination.hobby_enrichment
│       └── nomad_graph.py         # + hobby_enrichment entre visa y compiler
├── scripts/
│   ├── seed_generate.py           # Tavily + Gemini → hobby_docs_raw.json
│   └── seed_load.py               # hobby_docs_curated.json → ChromaDB
└── data/
    └── seed/
        └── hobby_docs_curated.json    # Datos revisados listos para indexar
```

---

## Fase 1 — Modelos de datos (`app/graph/state.py`)

### Nuevo modelo `HobbyInfo`
```python
class HobbyInfo(BaseModel):
    hobby: str
    description: str
    key_venues: list[str] = Field(default_factory=list)
    key_events: list[str] = Field(default_factory=list)
    source: str = "unknown"       # "rag" | "tavily_live"
    confidence: str = "medium"    # "high" | "medium" | "low"
```

### Modificación a `Destination`
```python
class Destination(BaseModel):
    # ... campos existentes ...
    hobby_enrichment: list[HobbyInfo] = Field(default_factory=list)  # NUEVO
```

---

## Fase 2 — Vector Store (`app/rag/`)

### Estructura de cada documento
Un documento por par `(ciudad, hobby)` — no mezclar hobbies en un solo documento.
Esto permite recuperación precisa sin ruido entre hobbies.

```
page_content:
  "Manila, Philippines - Poker: APT (Asia Poker Tour) y APPT (Asia Pacific
   Poker Tour) operan regularmente en Manila. WSOP Circuit tiene paradas anuales.
   Venues principales: Solaire Resort & Casino, City of Dreams Manila, Okada Manila.
   Buy-ins desde $50 hasta $10,000+. Ambiente muy activo todo el año."

metadata:
  city:          "Manila"
  country:       "Philippines"
  city_slug:     "manila"              # para filtrado exacto en queries
  hobby:         "poker"
  hobby_category: "gaming"
  key_venues:    '["Solaire", "City of Dreams", "Okada Manila"]'  # JSON string
  events:        '["APT", "APPT", "WSOP Circuit"]'               # JSON string
  confidence:    "high"
  source:        "curated_v1"
  verified_date: "2025-01"
```

### `app/rag/vector_store.py`
```python
def get_vector_store():
    env = os.getenv("NOMADAI_ENV", "development")
    if env == "production":
        return _get_pgvector_store()   # Aurora PostgreSQL Serverless v2
    return _get_chroma_store()         # ChromaDB local persistente

# Dev: ChromaDB con all-MiniLM-L6-v2 (80MB, sin API key, corre en CPU)
# Prod: LangChain PGVector → Aurora Serverless v2 con extensión pgvector
```

### Variables de entorno a agregar (`.env`)
```
NOMADAI_ENV=development
CHROMA_DB_PATH=./data/chroma_db
# Para producción:
# PG_CONNECTION_STRING=postgresql://user:pass@aurora-endpoint/nomadai
```

---

## Fase 3 — Retriever (`app/rag/retriever.py`)

```
SIMILARITY_THRESHOLD = 0.75

retrieve_hobby_info(city, country, hobby) → HobbyInfo | None:

  1. Normalizar: city_slug = city.lower().replace(" ", "-")

  2. Query ChromaDB:
     - query_text = f"{hobby} {city} {country}"
     - where = {"city_slug": city_slug}   ← filtro exacto antes del ranking
     - include = ["documents", "metadatas", "distances"]

  3. Calcular similitud coseno:
     similarity = 1 - (distance / 2)

  4. Si similarity >= 0.75:
     → HobbyInfo(source="rag", confidence=metadata["confidence"])

  5. Si no:
     → search_web(f"{hobby} scene {city} venues events 2025")
     → HobbyInfo(source="tavily_live", confidence="medium")

  6. Si Tavily falla:
     → return None
```

**Por qué filtrar por `city_slug` antes del ranking:**
Sin este filtro, una query "poker Manila" podría retornar "Macau poker scene" con
alto score de similitud semántica. El filtro garantiza que solo se rankean documentos
de la ciudad exacta.

---

## Fase 4 — Nodo de enriquecimiento (`app/nodes/hobby_enrichment_node.py`)

```python
def hobby_enrichment_node(state: NomadState) -> dict:
    # Paralelizar N destinos × M hobbies para evitar latencia serial
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            executor.submit(retrieve_hobby_info, dest.city, dest.country, hobby): (i, hobby)
            for i, dest in enumerate(state.destinations)
            for hobby in state.user_profile.hobbies
        }
        # Acumular resultados por destino
        ...

    return {"destinations": updated_destinations}
```

**Latencia estimada:** 3 destinos × 3 hobbies = 9 queries. En paralelo ≈ tiempo del más lento.
RAG hit ≈ <50ms. Tavily fallback ≈ 1-2s. Total esperado: 1-3s adicionales al pipeline.

---

## Fase 5 — Seed de datos (`scripts/`)

### `scripts/seed_generate.py`
```
Para cada (ciudad, hobby) de la lista de 50 destinos × 8 hobbies core:
  1. Tavily busca hechos reales (no el LLM inventa)
  2. Gemini estructura los snippets en el schema
  3. Output → data/seed/hobby_docs_raw.json

⚠️  Revisar manualmente antes de cargar, especialmente hobbies como poker
    donde la precisión factual es crítica.
```

### `scripts/seed_load.py`
```
Lee data/seed/hobby_docs_curated.json (después de revisión manual)
→ Indexa en ChromaDB
→ Reporta: N documentos indexados, distribución por hobby/ciudad
```

### 50 destinos core a indexar
```
Asia:    Bangkok, Chiang Mai, Bali, Manila, Ho Chi Minh City,
         Taipei, Kuala Lumpur, Tokyo, Seoul, Singapore, Phnom Penh,
         Colombo, Kathmandu, Tbilisi (Georgia)

Europa:  Lisboa, Barcelona, Berlin, Amsterdam, Praga, Budapest,
         Tallinn, Riga, Split, Atenas, Belgrado

Américas: Medellín, Ciudad de México, Buenos Aires, Playa del Carmen,
          Oaxaca, São Paulo, Lima, Bogotá, Montevideo

Medio Este/Africa: Dubai, Tel Aviv, Ciudad del Cabo
```

### 8 hobbies core
```
poker        → torneos, venues, buy-ins, series internacionales
surf         → spots, niveles, mejores meses, escuelas
gastronomía  → mercados, restaurantes locales, cocina típica, price range
fotografía   → spots icónicos, horas doradas, permisos necesarios
yoga/wellness → estudios, retiros, precio de clases, estilo predominante
buceo/scuba  → spots de buceo, visibilidad, temperatura del agua, certificaciones
senderismo   → trails cercanos, dificultad, épocas recomendadas
música en vivo → escena local, venues, géneros predominantes
```

---

## Fase 6 — Compiler (`app/nodes/compiler_node.py`)

Modificar `_format_destination()` para incluir sección con info verificada:

```python
if dest.hobby_enrichment:
    for h in dest.hobby_enrichment:
        label = "✓ RAG curado" if h.source == "rag" else "⟳ búsqueda live"
        # incluir h.description, h.key_venues, h.key_events en el prompt
```

El LLM recibe evidencia factual en el prompt → no puede alucinar sobre lo que ya está escrito.

---

## Producción AWS

### Mapeo local → AWS

| Componente local | Servicio AWS |
|---|---|
| ChromaDB `./data/chroma_db` | Aurora PostgreSQL Serverless v2 + pgvector |
| `all-MiniLM-L6-v2` (embeddings) | Amazon Titan Embeddings (Bedrock) o Google text-embedding-004 |
| `MemorySaver` (estado LangGraph) | DynamoDB (`langgraph-checkpoint-dynamodb`) |
| `uvicorn` local | Lambda (imagen Docker) o ECS Fargate |
| `index.html` estático | S3 + CloudFront |
| `seed_generate.py` manual | EventBridge + Lambda (refresh semanal automático) |

### Diagrama de arquitectura

```
                    ┌─────────────────────────────────────────┐
                    │              USUARIO                     │
                    └──────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────┐
                    │     S3 + CloudFront (Frontend)           │
                    │     index.html servido como CDN          │
                    └──────────────────┬──────────────────────┘
                                       │ HTTP
                    ┌──────────────────▼──────────────────────┐
                    │     API Gateway + Lambda / ECS Fargate   │
                    │     FastAPI (app/api/main.py)            │
                    └──────┬────────────────────┬─────────────┘
                           │                    │
           ┌───────────────▼───┐    ┌───────────▼──────────────┐
           │  LangGraph Agent  │    │  DynamoDB                │
           │  (todos los nodos)│    │  Estado de conversación  │
           │  Lambda o ECS     │    │  (reemplaza MemorySaver) │
           └──────┬────────────┘    └──────────────────────────┘
                  │
        ┌─────────┼──────────────────────────┐
        │         │                          │
┌───────▼──┐ ┌────▼──────────┐  ┌───────────▼────────────┐
│  Bedrock │ │ Aurora pgvector│  │  EventBridge + Lambda  │
│  Claude  │ │ RAG hobby_index│  │  Seed semanal          │
│  o Gemini│ │                │  │  (actualiza torneos,   │
└──────────┘ └───────────────┘  │   venues, eventos)     │
                                 └────────────────────────┘
```

### Cambios de código para producción

**1. Vector store — una variable de entorno:**
```python
# .env producción
NOMADAI_ENV=production
PG_CONNECTION_STRING=postgresql://user:pass@aurora-cluster.rds.amazonaws.com/nomadai
```
`vector_store.py` ya tiene la abstracción `get_vector_store()` que elige el backend según `NOMADAI_ENV`.

**2. MemorySaver → DynamoDB — una línea en `nomad_graph.py`:**
```python
from langgraph.checkpoint.dynamodb import DynamoDBSaver
checkpointer = DynamoDBSaver(table_name="nomadai-sessions")
```

**3. LLM — si se migra a Bedrock:**
```python
# Reemplazar ChatGoogleGenerativeAI por ChatBedrock en todos los nodos
from langchain_aws import ChatBedrock
llm = ChatBedrock(model_id="anthropic.claude-sonnet-4-6")
```

### Lambda vs ECS Fargate

| | Lambda | ECS Fargate |
|---|---|---|
| Costo | Pago por invocación | Pago por hora |
| Cold start | ~2-3s con LangChain | No tiene |
| Límite de tiempo | 15 min | Sin límite |
| **Recomendación** | Tráfico bajo/variable | Usuarios continuos |

Para etapa inicial: **Lambda con imagen Docker + provisioned concurrency** para eliminar cold starts.

### Secuencia de deploy

```
1. Crear Aurora Serverless v2 → habilitar extensión pgvector
2. Correr seed_load.py apuntando a Aurora (PG_CONNECTION_STRING)
3. Containerizar FastAPI en Dockerfile
4. Deploy imagen a Lambda (hasta 10GB) o ECS
5. Crear tabla DynamoDB "nomadai-sessions"
6. Subir index.html a S3 → configurar CloudFront
7. Crear EventBridge rule → Lambda semanal para refresh del RAG
```

### Refresh de datos (torneos de poker y eventos dinámicos)
```
Refresh de datos:     AWS Lambda scheduled (semanal via EventBridge)
                      Re-corre seed_generate.py para hobbies dinámicos
                      (torneos de poker tienen fechas que cambian cada temporada)

Embeddings prod:      Amazon Titan Embeddings (Bedrock, sin salir de la red AWS)
                      o Google text-embedding-004 (mejor calidad)
```

---

## Verificación end-to-end

1. `python scripts/seed_generate.py` → revisar `hobby_docs_raw.json` para Manila+poker
2. Editar y guardar como `hobby_docs_curated.json`
3. `python scripts/seed_load.py` → verificar 400 documentos indexados
4. Iniciar chat con perfil que incluya "poker"
5. En LangSmith: `hobby_enrichment_node` debe mostrar `source="rag"` para Manila
6. El reporte debe mencionar APT/APPT/WSOP correctamente
7. Probar destino raro (ej: Asmara, Eritrea) → verificar `source="tavily_live"` en LangSmith
