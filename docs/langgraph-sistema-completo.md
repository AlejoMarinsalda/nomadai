# NomadAI — Sistema LangGraph Completo
**Para:** Convertirse en dev LangGraph senior capaz de llevar proyectos end-to-end  
**Nivel:** Desde los fundamentos hasta los detalles de producción, explicando cada decisión

---

## Parte 1 — Qué es LangGraph y por qué se usa acá

LangGraph es un framework para construir agentes de IA como **grafos de estado**. En lugar de tener un LLM que hace todo en un solo prompt, dividís el trabajo en nodos especializados que se ejecutan en secuencia o en paralelo, compartiendo un estado común.

**Por qué no un solo LLM para todo:**
- Un prompt que tiene que recopilar el perfil del usuario, recomendar destinos, buscar info de visas, buscar videos de YouTube, calcular clima, y generar un reporte final sería imposible de mantener
- Cada nodo puede fallar de forma independiente sin tirar todo el pipeline
- Podés optimizar cada nodo por separado (paralelo donde conviene, secuencial donde hay dependencias)
- El estado se persiste entre turnos — el usuario puede seguir preguntando sin perder contexto

---

## Parte 2 — El Estado: el contrato entre todos los nodos

El estado es el objeto que fluye por todo el grafo. Cada nodo lo lee y puede modificar partes de él.


```python
# app/graph/state.py

class NomadState(BaseModel):
    messages: Annotated[list[Any], add_messages]  # historial de conversación
    user_profile: UserProfile                      # datos del usuario
    profile_complete: bool = False                 # ¿tenemos todos los datos?
    destinations: list[Destination] = []           # destinos recomendados
    final_report: str | None = None                # reporte en markdown
    result_data: dict | None = None                # datos estructurados para el frontend
    language: str = "es"                           # idioma del usuario
    error: str | None = None                       # error si algo falla
```

**`add_messages`** es una función especial de LangGraph. En lugar de reemplazar el array de mensajes, *acumula* mensajes nuevos. Es la única excepción al comportamiento default donde el nodo reemplaza el campo completo con lo que retorna.

### Los modelos anidados

```python
class UserProfile(BaseModel):
    hobbies: list[str]
    budget_usd_monthly: int | None
    work_timezone: str | None          # "UTC-3", "UTC+5:30"
    nationality: str | None
    goals: list[str]
    preferred_climate: str | None

class Destination(BaseModel):
    city: str
    country: str
    match_score: float                 # 0-100
    match_reasons: list[str]
    monthly_cost_usd: int | None
    media: DestinationMedia            # YouTube links
    visa: VisaInfo                     # requisitos de visa
    climate: ClimateInfo               # mejores meses
    local_info: str                    # info del RAG sobre hobbies/networking
    accommodation_links: list[dict]    # links de Airbnb, Booking, Hostelworld
```

**Regla de oro del estado LangGraph:** un nodo retorna un dict con solo los campos que modifica. Los campos que no retorna quedan sin cambios. Si retornás `{}`, el estado no cambia.

---

## Parte 3 — El Grafo: cómo se conectan los nodos

```python
# app/graph/nomad_graph.py

def build_graph() -> StateGraph:
    builder = StateGraph(NomadState)

    # Registrar nodos
    builder.add_node("profile",     profile_node)
    builder.add_node("destination", destination_node)
    builder.add_node("enrichment",  enrichment_node)
    builder.add_node("compiler",    compiler_node)
    builder.add_node("followup",    followup_node)

    # Punto de entrada condicional
    builder.set_conditional_entry_point(
        _entry_point,
        {"profile": "profile", "followup": "followup", "destination": "destination"},
    )

    # Aristas condicionales y fijas
    builder.add_conditional_edges("profile", _after_profile, {"destination": "destination", END: END})
    builder.add_edge("destination", "enrichment")
    builder.add_edge("enrichment",  "compiler")
    builder.add_edge("compiler",    END)
    builder.add_edge("followup",    END)

    # Checkpointer — persiste el estado entre turnos
    checkpointer = DynamoDBSaver(
        table_name=settings.checkpoints_table,
        region_name="us-east-1",
        ttl_seconds=86400 * 30,
        s3_offload_config={
            "bucket_name": settings.checkpoints_s3_bucket,
            "key_prefix": "checkpoints",
        },
    )
    return builder.compile(checkpointer=checkpointer)

graph = build_graph()  # se ejecuta UNA SOLA VEZ al arrancar el contenedor
```

### El diagrama del grafo

```
                    ┌─────────────────────────────┐
                    │       _entry_point()         │
                    └──────┬──────────┬────────────┘
                           │          │
              final_report │          │ profile_complete=True
                           ▼          ▼
                       followup   destination
                           │          │
                           ▼          ▼
                          END     enrichment
                                      │
                                      ▼
                                  compiler
                                      │
                                      ▼
                                     END

              profile  ←── (si no hay perfil aún)
                  │
                  ├──► destination  (si profile_complete=True)
                  │
                  └──► END          (si falta info, seguir conversando)
```

### La función de routing — `_entry_point`

```python
def _entry_point(state: NomadState) -> str:
    if state.final_report:
        return "followup"     # ya tiene reporte → pregunta de seguimiento
    if state.profile_complete:
        return "destination"  # perfil listo → saltar directo al pipeline
    return "profile"          # primer mensaje → recopilar perfil
```

| Situación | Nodo | Qué pasa |
|---|---|---|
| Usuario nuevo, primer mensaje | `profile` | LLM recopila datos conversacionalmente |
| Perfil completo (desde onboarding) | `destination` | Salta directo al pipeline de recomendación |
| Usuario con reporte generado | `followup` | Responde preguntas sobre los destinos |

---

## Parte 4 — El Checkpointer: cómo persiste el estado entre turnos

El checkpointer es lo que hace que LangGraph "recuerde" conversaciones anteriores. Sin él, cada `invoke()` empezaría desde cero.

### Cómo funciona

Cada grafo compilado tiene un checkpointer configurado. Cuando llamás `graph.ainvoke(state, config={"configurable": {"thread_id": "abc123"}})`:

1. LangGraph busca en el checkpointer si existe un estado previo con `thread_id="abc123"`
2. Si existe, carga ese estado y mergea el nuevo input encima
3. Ejecuta los nodos
4. Al terminar, guarda el estado nuevo en el checkpointer con el mismo `thread_id`

El `thread_id` en NomadAI es el `session_id` — cada conversación del usuario tiene su propio `thread_id`.

### DynamoDB + S3 offload

```python
checkpointer = DynamoDBSaver(
    table_name="nomadai-checkpoints",  # tabla DynamoDB donde se guarda el estado
    ttl_seconds=86400 * 30,            # expira en 30 días
    s3_offload_config={
        "bucket_name": "nomadai-checkpoints-s3",
        "key_prefix": "checkpoints",
    },
)
```

El S3 offload es necesario porque DynamoDB tiene un límite de 400KB por item. Los reportes largos con markdown, links y datos de 3 destinos pueden superar ese límite. Cuando el payload es grande, `DynamoDBSaver` guarda el item en S3 y solo guarda un puntero (la URL de S3) en DynamoDB.

En tests se usa `MemorySaver` (en `conftest.py`) — mismo contrato, sin AWS.

---

## Parte 5 — Nodo 1: Profile Node

**Responsabilidad:** Recopilar el perfil del usuario conversacionalmente, o detectar que ya tiene perfil.

```python
# app/nodes/profile_node.py

def profile_node(state: NomadState) -> dict:
    if state.profile_complete:
        return {}  # ya tenemos todo, no hacer nada

    llm = ChatGoogleGenerativeAI(model=settings.google_model_id, ...)

    p = state.user_profile
    is_returning = bool(p and p.hobbies and p.budget_usd_monthly and p.work_timezone and p.nationality)
```

### Dos modos de operación

**Usuario nuevo** — prompt que guía la conversación:
```
"Necesitás obtener EXACTAMENTE estos datos:
1. hobbies e intereses
2. presupuesto mensual en USD
3. zona horaria de trabajo
4. nacionalidad
5. objetivos del viaje
6. preferencia de clima

Cuando tengas los 6 datos, respondé ÚNICAMENTE con este JSON..."
```

**Usuario que regresa** — muestra su perfil y pregunta si buscar o cambiar:
```python
# Si el usuario confirma → retorna {"profile_complete": True}
if data.get("search"):
    return {"profile_complete": True}

# Si quiere cambiar algo → retorna el perfil actualizado
if data.get("profile_complete"):
    return {"user_profile": profile, "profile_complete": True, "messages": [response]}
```

### El patrón de extracción JSON del LLM

El LLM puede responder con JSON limpio o envuelto en bloques markdown. `extract_json()` maneja ambos:

```python
# app/utils.py
def extract_json(text: str) -> dict | list | None:
    # 1. Intenta parsear directo
    # 2. Busca dentro de ```json ... ```
    # 3. Busca cualquier { } o [ ] en el texto
    # 4. Retorna None si no encuentra nada parseble
```

Esta función es crítica — sin ella, un LLM que responde con ```json\n{...}\n``` en lugar de `{...}` rompería todo el pipeline.

---

## Parte 6 — Nodo 2: Destination Node

**Responsabilidad:** Usar el perfil del usuario para recomendar exactamente 3 destinos con match_score y razones específicas.

```python
# app/nodes/destination_node.py

def destination_node(state: NomadState) -> dict:
    profile = state.user_profile
    constraints = []

    # 1. Detectar si quiere practicar un idioma
    lang_goal = _detect_language_goal(profile.goals or [])
    if lang_goal:
        constraints.append(f"⚠️ FILTRO OBLIGATORIO DE IDIOMA: Solo recomendá países donde {lang_goal['countries']}...")

    # 2. Restricción de presupuesto
    if profile.budget_usd_monthly:
        constraints.append(f"⚠️ PRESUPUESTO MÁXIMO: ${profile.budget_usd_monthly} USD/mes...")

    # 3. Restricción de zona horaria (máximo 6h de diferencia)
    tz_constraint = _timezone_constraint(profile.work_timezone)
    if tz_constraint:
        constraints.append(tz_constraint)
```

### Detección de idioma objetivo

```python
_LANGUAGE_COUNTRIES = [
    {
        "keywords": {"english", "learn english"},
        "countries": "Ireland, Malta, UK, Canada, Australia...",
        "exclude": "Colombia, Mexico, Spain, Portugal...",
    },
    {"keywords": {"spanish", "learn spanish"}, "countries": "Mexico, Colombia, Argentina..."},
    {"keywords": {"portuguese", "learn portuguese"}, "countries": "Portugal, Brazil"},
    {"keywords": {"french", "learn french"}, "countries": "France, Belgium, Switzerland"},
    # + german, italian, japanese, mandarin
]

def _detect_language_goal(goals: list[str]) -> dict | None:
    goals_lower = " ".join(goals).lower()
    for lang in _LANGUAGE_COUNTRIES:
        if any(kw in goals_lower for kw in lang["keywords"]):
            return lang
    return None
```

Si el usuario tiene `goals=["Learn English", "networking"]`, el nodo inyecta en el prompt que SOLO puede recomendar países angloparlantes — el LLM no puede ignorar esta restricción porque está en el system prompt como regla no negociable.

### Parsing de timezone

```python
def _parse_utc_offset(tz: str | None) -> float | None:
    # "UTC-3"    → -3.0
    # "UTC+5:30" → 5.5
    # "GMT+1"    → 1.0
    # "Flexible" → None (sin restricción)
```

Con `_MAX_TZ_DIFF_HOURS = 6`, si el usuario trabaja en UTC-3, el rango aceptable es UTC-9 a UTC+3. Destinos como Tailandia (UTC+7) quedan excluidos automáticamente.

### Qué retorna

```python
return {"destinations": [
    Destination(city="Medellín", country="Colombia", match_score=92, ...),
    Destination(city="Bangkok",  country="Tailandia", match_score=87, ...),
    Destination(city="Lisboa",   country="Portugal",  match_score=83, ...),
]}
```

---

## Parte 7 — Nodo 3: Enrichment Node

**Responsabilidad:** Enriquecer cada destino con información real en paralelo: videos de YouTube, clima, visa, info local de hobbies y links de alojamiento.

Este es el nodo más complejo del sistema. Hace 4 enriquecimientos en paralelo para cada destino, y luego los 3 destinos también en paralelo:

```python
async def enrichment_node(state: NomadState) -> dict:
    # 3 destinos en paralelo
    results = await asyncio.gather(*[
        _enrich_one(dest, nationality, hobbies, language, budget)
        for dest in state.destinations
    ], return_exceptions=True)
```

```python
async def _enrich_one(dest, nationality, hobbies, language, budget) -> Destination:
    # 4 enriquecimientos en paralelo para cada destino
    results = await asyncio.gather(
        asyncio.to_thread(_enrich_media, dest),        # YouTube
        asyncio.to_thread(_enrich_climate, dest, language),  # Clima
        asyncio.to_thread(_enrich_visa, dest, nationality, language),  # Visa
        asyncio.to_thread(_enrich_local_info, dest, hobbies),  # Local info
        return_exceptions=True,  # si uno falla, los demás continúan
    )
```

`asyncio.to_thread()` convierte funciones síncronas en coroutines — las corre en un thread pool sin bloquear el event loop. `return_exceptions=True` es crítico: si la búsqueda de visa falla para un destino, el enrichment del clima y YouTube continúa igual.

### Enriquecimiento 1 — Media (YouTube + influencers)

```python
def _enrich_media(dest: Destination) -> DestinationMedia:
    query = f"{dest.city} {dest.country} digital nomad review"
    youtube_links = search_youtube_reviews(query)   # YouTube Data API v3
    results = search_web(f"digital nomad influencer {dest.city}...")  # Tavily
    return DestinationMedia(youtube_links=youtube_links, influencers=results[:3])
```

**YouTube Data API:**
```python
# app/tools/youtube_tool.py
youtube = build("youtube", "v3", developerKey=api_key)
request = youtube.search().list(
    part="snippet",
    q=query,
    type="video",
    maxResults=3,
    relevanceLanguage="es",
    order="relevance",
)
# Retorna: ["https://youtube.com/watch?v=abc", ...]
```

### Enriquecimiento 2 — Clima (RAG + LLM + fallback)

```python
def _enrich_climate(dest: Destination, language: str) -> ClimateInfo:
    # Primero busca en el RAG (conocimiento pre-indexado)
    rag_results = search_rag(f"clima mejores meses {dest.city} {dest.country} nómada digital", k=2)

    if not rag_results:
        # Fallback: clima básico sin LLM
        climate = get_climate_summary(dest.city, dest.country)
        if climate.best_months:
            return climate

    # Con contexto del RAG (o sin él), el LLM genera el análisis final
    context_text = "\n\nContexto:\n" + "\n".join(rag_results) if rag_results else ""
    response = llm.invoke([HumanMessage(content=_climate_prompt(dest.city, dest.country, context_text, language))])
    # Retorna: ClimateInfo(best_months=["Ene", "Feb"], avoid_months=["Jul"])
```

### Enriquecimiento 3 — Visa (RAG + Tavily + LLM)

```python
def _enrich_visa(dest: Destination, nationality: str, language: str) -> VisaInfo:
    # 1. Buscar en el RAG (datos pre-curados por nacionalidad)
    rag_results = search_rag(f"visa {nationality} ciudadanos {dest.country} nómada digital", k=3)

    if rag_results:
        context = "\n".join(rag_results)
    else:
        # 2. Fallback: buscar en tiempo real con Tavily
        results = search_web(f"visa requirements {nationality} citizens {dest.country} digital nomad 2024")
        context = "\n".join(results[:3]) if results else "No results."

    # 3. LLM estructura la información en el schema
    response = llm.invoke([SystemMessage(content=_visa_system(language)), HumanMessage(content=prompt)])
    # Retorna: VisaInfo(visa_required=False, max_stay_days=180, requirements=[...])
```

### Enriquecimiento 4 — Info local (RAG de hobbies)

```python
def _enrich_local_info(dest: Destination, hobbies: list[str]) -> str:
    hobby_str = " ".join(hobbies)
    hobbies_results  = search_rag(f"{hobby_str} {dest.city} {dest.country} lugares actividades", k=2)
    networking_results = search_rag(f"networking coworking comunidad nómada digital {dest.city}", k=2)

    # Retorna texto que el compiler_node incluye en el prompt del reporte
```

### Links de alojamiento (filtrado por presupuesto)

```python
def get_accommodation_links(city, country, budget_usd_monthly=None, language="es"):
    airbnb_url  = f"https://www.airbnb.com/s/{c}/homes?monthly_length=1"
    booking_url = f"https://www.booking.com/searchresults.html?ss={c}&nflt=ht_id%3D201"

    if budget_usd_monthly:
        accom_monthly = int(budget_usd_monthly * 0.40)   # 40% del presupuesto
        accom_nightly = max(10, accom_monthly // 30)
        airbnb_url  += f"&price_max={accom_monthly}"
        booking_url += f"%3Bprice%3DUSD-0-{accom_nightly}-1"

    # Labels en EN o ES según el idioma del usuario
```

---

## Parte 8 — El Sistema RAG: Retrieval-Augmented Generation

RAG es la técnica de proveerle al LLM información externa como contexto antes de que genere su respuesta. Sin RAG, el LLM solo usa su conocimiento de entrenamiento (que puede ser impreciso o desactualizado para visa requirements y precios).

### Arquitectura completa del RAG

```
Fase de indexación (offline, corre una sola vez):

data/knowledge_base.json
        ↓
    34 documentos con texto sobre visa/clima por destino
        ↓
Google gemini-embedding-001
        ↓
    34 vectores de 3072 dimensiones (uno por documento)
        ↓
Qdrant Cloud (colección "nomadai-knowledge")
        ↓
    34 puntos con vector + metadata almacenados

---

Fase de búsqueda (runtime, en cada request):

Query: "visa argentina ciudadanos Colombia nómada digital"
        ↓
Google gemini-embedding-001
        ↓
    Vector de 3072 dims que representa la query
        ↓
Qdrant similarity_search (cosine distance)
        ↓
    Top k=3 documentos más similares semánticamente
        ↓
LLM recibe esos fragmentos como contexto
        ↓
    Responde con información precisa del knowledge base
```

### Qué es un embedding y por qué funciona

Un embedding es la representación numérica del significado de un texto. Textos con significados similares producen vectores cercanos en el espacio de 3072 dimensiones:

```
"¿Necesito visa para ir a Colombia siendo argentino?"
        ↓ gemini-embedding-001
[0.0231, -0.1847, 0.0593, ..., -0.0412]   ← 3072 números

"Los ciudadanos argentinos no necesitan visa para Colombia"
        ↓ gemini-embedding-001
[0.0219, -0.1831, 0.0601, ..., -0.0398]   ← vectores CERCANOS

"El clima de Berlín en verano"
        ↓ gemini-embedding-001
[-0.1204, 0.0934, -0.2103, ..., 0.1847]   ← vector DISTANTE
```

La distancia coseno mide el ángulo entre dos vectores (ignora la magnitud). Un ángulo pequeño = alta similitud semántica.

### El vectorstore en código

```python
# app/services/rag_store.py

_vectorstore = None  # cacheado a nivel de módulo

def _load():
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore   # reutiliza en Lambda caliente

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=settings.google_api_key,
    )
    client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
    _vectorstore = QdrantVectorStore(client=client, collection_name=settings.qdrant_collection, embedding=embeddings)
    return _vectorstore

def search_rag(query: str, k: int = 3) -> list[str]:
    vs = _load()
    if vs is None:
        return []   # falla silenciosamente — el pipeline sigue con Tavily
    docs = vs.similarity_search(query, k=k)
    return [doc.page_content for doc in docs]
```

### Contenido indexado

La knowledge base cubre **21 destinos** con dos categorías:

**Categoría `visa`** — para ciudadanos argentinos:

| Destino | Resumen |
|---|---|
| Medellín / Bogotá | Sin visa hasta 180 días. Visa Nómada Digital: 2 años, ~$750 USD/mes |
| Ciudad de México / Playa del Carmen | Sin visa hasta 180 días |
| Lisboa / Porto | 90 días sin visa (Schengen). Visa D8: 3280 EUR/mes |
| Barcelona / Valencia | 90 días sin visa (Schengen). Visa Nómada Digital: ~$2500 USD/mes |
| Berlín | 90 días sin visa (Schengen). Freiberufler Visa para freelances |
| Tallinn | 90 días sin visa (Schengen). D-visa: 3504 EUR/mes |
| Tbilisi | Sin visa hasta **365 días**, sin requisitos de ingresos |
| Bali | Visa on arrival 30 días. Visa Nómada Digital E33G: 1 año, $2000 USD/mes |
| Bangkok / Chiang Mai | Visa on arrival 30 días. LTR Visa para ingresos >$40K/año |
| Kuala Lumpur | Sin visa 90 días. DE Rantau Pass: $2200 USD/mes |
| Budapest | 90 días sin visa (Schengen). White Card: 1 año, $2000 USD/mes |
| Montevideo | Sin visa con DNI. Residencia permanente a los 6 meses |

**Categoría `clima`** — información de temporadas para 13 destinos.

### Cómo agregar documentos al RAG

1. Editar `data/knowledge_base.json` con el nuevo documento:
```json
{
  "id": "tokio_visa_arg",
  "destination": "Tokio",
  "country": "Japón",
  "category": "visa",
  "nationality": "argentina",
  "text": "Los ciudadanos argentinos pueden ingresar a Japón sin visa por hasta 90 días..."
}
```

2. Correr el script de indexación:
```bash
cd nomadai/
py -3 scripts/populate_qdrant.py
```

El upsert es idempotente — correr el script dos veces no duplica datos.

---

## Parte 9 — Nodo 4: Compiler Node

**Responsabilidad:** Recibir los 3 destinos enriquecidos y generar el reporte final en dos formatos: markdown (para el chat) y JSON estructurado (para el frontend de tarjetas).

```python
# app/nodes/compiler_node.py

def compiler_node(state: NomadState) -> dict:
    # 1. Formatear cada destino para el prompt
    destinations_text = "\n\n".join(
        _format_dest_for_prompt(d) for d in state.destinations
    )

    # 2. Llamar al LLM para generar análisis enriquecido
    response = llm.invoke([
        SystemMessage(content=_system_prompt(state.language)),
        HumanMessage(content=prompt)
    ])
    llm_items = json.loads(response.content)["destinations"]

    # 3. Combinar datos del estado con análisis del LLM
    result_data = _build_result_data(state, llm_items)

    # 4. Convertir a markdown para el chat
    final_report = _result_data_to_markdown(result_data)

    return {"final_report": final_report, "result_data": result_data}
```

### Lo que genera el LLM en este nodo

El LLM recibe los destinos con toda su información enriquecida y genera:
- `tagline`: 3-5 palabras que describen la ciudad
- `ai_summary`: 1-2 oraciones personalizadas al perfil
- `why_you_why_now`: 4 bullets específicos (máx 10 palabras cada uno)
- `internet_mbps`: estimación realista
- `avg_temp_celsius`: temperatura media
- `security`: "Excelente" | "Buena" | "Moderada"
- `community`: "Muy alta" | "Alta" | "Media"

### La estructura de `result_data`

```python
result_data = {
    "destinations": [{
        "rank": 1,
        "city": "Medellín",
        "country": "Colombia",
        "match_score": 92,
        "monthly_cost_usd": 1200,
        "match_reasons": ["Clima ideal todo el año", "Comunidad nomad activa"],
        "tagline": "Ciudad de la eterna primavera",
        "ai_summary": "Con tu presupuesto de $2000/mes tenés margen amplio...",
        "why_you_why_now": ["..."],
        "internet_mbps": 150,
        "avg_temp_celsius": 22,
        "security": "Buena",
        "community": "Muy alta",
        "visa_summary": "No visa required",
        "visa": {"required": False, "type": None, "max_stay_days": 180, "requirements": []},
        "climate": {"best_months": ["Dic", "Ene", "Jul"], "avoid_months": ["Oct", "Nov"]},
        "youtube_links": ["https://youtube.com/watch?v=..."],
        "accommodation_links": [{"platform": "Airbnb", "url": "...", "label": "..."}]
    }]
}
```

Este JSON es exactamente lo que el frontend recibe y usa para renderizar las tarjetas de destinos.

---

## Parte 10 — Nodo 5: Followup Node

**Responsabilidad:** Responder preguntas de seguimiento del usuario sobre los destinos ya recomendados.

```python
def followup_node(state: NomadState) -> dict:
    # Solo toma el ÚLTIMO mensaje del usuario (no todo el historial)
    last_user_msg = next(
        (m for m in reversed(state.messages) if isinstance(m, HumanMessage)),
        HumanMessage(content=""),
    )

    context = f"""
    Perfil del usuario: {state.user_profile}
    Destinos recomendados: {destinations_summary}
    Reporte completo: {state.final_report}
    """

    response = llm.invoke([
        SystemMessage(content=_system(state.language)),
        HumanMessage(content=context),
        last_user_msg,
    ])
    return {"messages": [response]}
```

**Por qué solo el último mensaje y no todo el historial:** el historial puede tener 20+ mensajes incluyendo el pipeline completo. Pasar todo eso al LLM es caro y puede confundirlo. El contexto relevante ya está en `state.final_report` y `state.destinations`.

---

## Parte 11 — El flujo asíncrono completo: de HTTP a LangGraph

El sistema tiene dos capas de asincronismo que es importante distinguir:

### Capa 1: HTTP asíncrono (FastAPI)

```python
# app/api/main.py

@app.post("/chat/async")
def chat_async(request: ChatRequest, user_id: str = Depends(rate_limit)):
    job_id = str(uuid.uuid4())
    session_id = request.session_id or str(uuid.uuid4())

    create_pending_job(job_id)    # DynamoDB: status=pending

    _get_sqs().send_message(      # encola el mensaje
        QueueUrl=settings.sqs_queue_url,
        MessageBody=json.dumps({
            "job_id": job_id,
            "session_id": session_id,
            "user_id": user_id,
            "message": request.message,
            "language": request.language,
        }),
    )
    # Responde inmediatamente — el pipeline corre en background
    return {"job_id": job_id, "session_id": session_id, "status": "pending"}
```

### Capa 2: Procesamiento SQS (LangGraph)

```python
# handler.py

async def _process_sqs(event):
    for record in event["Records"]:
        body = json.loads(record["body"])
        config = {"configurable": {"thread_id": body["session_id"]}}

        # 1. Cargar estado previo del DynamoDB checkpointer
        prev_state = await graph.aget_state(config)
        had_report = bool(prev_state.values.get("final_report") if prev_state and prev_state.values else False)

        # 2. Si es nuevo thread, cargar perfil guardado del onboarding
        is_new_thread = not (prev_state and prev_state.values)
        saved_profile = await asyncio.to_thread(get_profile, user_id) if is_new_thread else None

        # 3. Construir estado inicial
        initial_state = {"messages": [HumanMessage(content=message)], "language": language}
        if saved_profile:
            initial_state["user_profile"] = saved_profile
            initial_state["profile_complete"] = True  # skip profile_node, ir directo a destination

        # 4. Ejecutar el grafo
        result = await graph.ainvoke(initial_state, config=config)

        # 5. Guardar resultado en DynamoDB para que el frontend lo recupere
        await asyncio.to_thread(save_job_result, job_id, {
            "status": "done",
            "reply": result["messages"][-1].content,
            "final_report": final_report,
            "result_data": result_data,
        })
```

### El flujo completo en tiempo

```
t=0ms    Usuario aprieta "Buscar"
t=50ms   POST /chat/async → SQS encolado → responde {job_id}
t=100ms  Frontend empieza a pollear GET /chat/status/{job_id} cada 3s

t=3s     Lambda SQS recibe el mensaje
t=4s     graph.aget_state() — carga estado de DynamoDB
t=5s     graph.ainvoke() comienza

t=6s     destination_node: LLM genera 3 destinos (~2s)

t=8s     enrichment_node comienza (3 destinos en paralelo)
         ├── Destino 1: media + clima + visa + local (en paralelo)
         ├── Destino 2: media + clima + visa + local (en paralelo)
         └── Destino 3: media + clima + visa + local (en paralelo)

t=18s    enrichment termina (~10s con I/O paralelo)

t=20s    compiler_node: LLM genera análisis enriquecido (~3s)

t=23s    save_job_result → DynamoDB status=done

t=24s    Frontend recibe el resultado en el próximo poll
```

---

## Parte 12 — Patrones de resiliencia

### `return_exceptions=True` en gather

```python
results = await asyncio.gather(
    asyncio.to_thread(_enrich_media, dest),
    asyncio.to_thread(_enrich_visa, dest, nationality, language),
    return_exceptions=True,  # si uno falla, no cancela los demás
)

# Manejar cada resultado individualmente
media = results[0] if isinstance(results[0], DestinationMedia) else DestinationMedia()
visa  = results[1] if isinstance(results[1], VisaInfo)         else VisaInfo()
```

Sin `return_exceptions=True`, si YouTube API falla, también se cancela la búsqueda de visa. Con este patrón, cada enriquecimiento falla de forma independiente y el destino se incluye con los datos que sí se pudieron obtener.

### Fallback RAG → Tavily

```python
def _enrich_visa(dest, nationality, language):
    rag_results = search_rag(...)          # intenta RAG primero

    if rag_results:
        context = "\n".join(rag_results)
    else:
        results = search_web(...)          # fallback a Tavily si no hay en RAG
        context = "\n".join(results[:3])
```

### `search_rag()` falla silenciosamente

```python
def search_rag(query: str, k: int = 3) -> list[str]:
    vs = _load()
    if vs is None:
        return []   # Qdrant no disponible → pipeline continúa
    try:
        docs = vs.similarity_search(query, k=k)
        return [doc.page_content for doc in docs]
    except Exception as e:
        logger.warning("RAG search falló: %s", e)
        return []   # error de red → pipeline continúa con Tavily
```

---

## Parte 13 — Cómo construir un nuevo nodo LangGraph

Para agregar un nodo al sistema (por ejemplo, un nodo que busca precios de vuelos):

### Paso 1: Agregar campo al estado

```python
# app/graph/state.py
class Destination(BaseModel):
    # ... campos existentes ...
    flight_prices: dict | None = None   # NUEVO
```

### Paso 2: Crear el nodo

```python
# app/nodes/flights_node.py

from app.graph.state import NomadState

def flights_node(state: NomadState) -> dict:
    updated_destinations = []
    for dest in state.destinations:
        prices = search_flight_prices(dest.city, dest.country)
        updated = dest.model_copy(update={"flight_prices": prices})
        updated_destinations.append(updated)
    return {"destinations": updated_destinations}
```

### Paso 3: Registrar en el grafo

```python
# app/graph/nomad_graph.py

builder.add_node("flights", flights_node)
builder.add_edge("enrichment", "flights")   # después de enrichment
builder.add_edge("flights", "compiler")     # antes del compiler
```

### Paso 4: Agregar tests

```python
# tests/test_nodes.py

class TestFlightsNode:
    def test_adds_flight_prices(self, complete_state):
        from app.nodes.flights_node import flights_node
        with patch("app.nodes.flights_node.search_flight_prices", return_value={"min": 200, "avg": 350}):
            result = flights_node(complete_state)
        assert result["destinations"][0].flight_prices["min"] == 200
```

---

## Parte 14 — Cómo llevar un proyecto LangGraph desde stakeholders hasta producción

### Del requerimiento al diseño del grafo

**Stakeholder dice:** "Quiero que la app recomiende restaurantes en cada destino según el tipo de cocina que le gusta al usuario"

**Análisis:**
1. ¿Qué dato nuevo necesita el perfil? → `favorite_cuisine: list[str]`
2. ¿Es un nuevo nodo o una expansión del enrichment? → expansión de `_enrich_local_info`
3. ¿Qué fuentes de datos usar? → RAG si hay datos curados, Tavily como fallback
4. ¿Cómo se muestra en el frontend? → nuevo campo en `result_data`, nuevo tab en la UI

**Stakeholder dice:** "Que el sistema aprenda de los destinos que el usuario descarta"

**Análisis:**
1. ¿El LangGraph necesita cambiar? → Sí: nuevo nodo `feedback_node`, nuevo campo en `NomadState`
2. ¿Dónde se guarda el feedback? → DynamoDB (profile_store o nuevo feedback_store)
3. ¿El `destination_node` lo usa? → Sí: leer feedback previo y agregarlo como restricción al prompt

### Las preguntas a hacerse ante cualquier feature

1. **¿Es un dato del perfil o del destino?** → Va en `UserProfile` o en `Destination`
2. **¿Es una transformación pura o necesita I/O?** → Nodo síncrono o async con `asyncio.to_thread`
3. **¿Puede fallar sin romper todo?** → Usar `return_exceptions=True` y default vacío
4. **¿Tiene datos pre-curados o es siempre en tiempo real?** → RAG con fallback Tavily
5. **¿Depende de otro nodo o puede correr en paralelo?** → Arista fija o `asyncio.gather`

### Cómo testear un nodo correctamente

```python
# Principios de testing en LangGraph:

# 1. Siempre testear la función del nodo directamente, no el grafo completo
result = flights_node(complete_state)

# 2. Mockear las dependencias externas (APIs, LLMs) con patch
with patch("app.nodes.flights_node.ChatGoogleGenerativeAI", return_value=mock_llm):
    result = destination_node(state)

# 3. Verificar el dict que retorna el nodo, no el estado completo
assert "destinations" in result
assert result["destinations"][0].city == "Medellín"

# 4. Testear casos de falla con return_exceptions
# ver TestEnrichmentNode en tests/test_nodes.py
```

---

## Parte 15 — Diagrama mental del sistema completo

```
Usuario
  │
  ▼
Frontend (React)
  │ POST /chat/async
  ▼
FastAPI (main.py)
  │ SQS
  ▼
Lambda handler (handler.py)
  │ graph.ainvoke()
  ▼
LangGraph
  │
  ├─► profile_node
  │     └─► Gemini (LLM conversacional)
  │
  ├─► destination_node
  │     └─► Gemini (LLM con restricciones de presupuesto/timezone/idioma)
  │
  ├─► enrichment_node (3 destinos en paralelo)
  │     ├─► _enrich_media     → YouTube API + Tavily
  │     ├─► _enrich_climate   → Qdrant RAG → Gemini → weather fallback
  │     ├─► _enrich_visa      → Qdrant RAG → Tavily → Gemini
  │     └─► _enrich_local_info → Qdrant RAG (hobbies + networking)
  │
  ├─► compiler_node
  │     └─► Gemini (análisis enriquecido) → markdown + JSON
  │
  └─► followup_node
        └─► Gemini (respuesta contextualizada)
  │
  ▼
DynamoDB (resultado del job)
  │
  ▼
Frontend (poll /chat/status/{job_id})
```

### Stack de servicios externos

| Servicio | Uso | Fallback |
|---|---|---|
| Google Gemini | LLM en todos los nodos | Ninguno (crítico) |
| Qdrant Cloud | Vector DB para RAG | Tavily (transparente) |
| Tavily | Búsqueda web en tiempo real | Lista vacía (silencioso) |
| YouTube Data API v3 | Videos de reseñas | Lista vacía (silencioso) |
| DynamoDB | Checkpoints + jobs + perfiles | Ninguno (crítico) |
| S3 | Offload de checkpoints grandes | DynamoDB directo si pequeño |
| SQS | Cola de trabajos async | Ninguno (crítico) |
| LangSmith | Tracing y observabilidad | Ninguno (opcional) |
