# Cómo se activa LangGraph en NomadAI

## La pregunta clave

`handler.py` llama a `graph.ainvoke()` sobre un objeto que está en `app/graph/`. ¿Cómo sabe LangGraph que se le está haciendo un invoke si el objeto parece ser "tuyo"?

---

## La cadena de imports

```
handler.py línea 41
  from app.graph import graph
        ↓
app/graph/__init__.py
  from app.graph.nomad_graph import graph
        ↓
app/graph/nomad_graph.py línea 61
  graph = build_graph()
        ↓
build_graph() línea 58
  return builder.compile(checkpointer=checkpointer)
```

`builder.compile()` es un método de LangGraph que devuelve un objeto de tipo `CompiledStateGraph` — una clase interna de LangGraph. Vos lo guardás en una variable llamada `graph`, pero ese objeto **es** LangGraph.

---

## Lo que parece vs lo que es

```python
# Esto parece ser "tu" objeto
from app.graph import graph

# Pero graph es una instancia de CompiledStateGraph (clase de LangGraph)
# Podrías haberlo llamado así:
mi_grafo = build_graph()    # mismo resultado
nomad    = build_graph()    # mismo resultado
```

El nombre de la variable no importa. Lo que importa es que el objeto que contiene es una instancia de `CompiledStateGraph` de LangGraph.

---

## El flujo completo — cómo llega un mensaje a LangGraph

A diferencia de lo que podría parecer, `graph.ainvoke()` **no se llama desde `main.py`**. El flujo real es asíncrono y pasa por SQS:

```
Usuario envía mensaje
        ↓
POST /chat/async  (main.py)
  → crea job_id en DynamoDB (status: pending)
  → publica mensaje en SQS
  → responde inmediatamente con { job_id, session_id }
        ↓
Lambda recibe evento SQS  (handler.py — función handler())
  → detecta eventSource == "aws:sqs"
  → llama a _process_sqs(event)
        ↓
_process_sqs()  (handler.py)
  → carga estado previo con graph.aget_state()
  → carga perfil guardado si es hilo nuevo
  → llama graph.ainvoke()   ← acá entra LangGraph
        ↓
graph.ainvoke()  (LangGraph interno)
  → carga estado de DynamoDB (checkpointer)
  → determina qué nodo ejecutar (_entry_point)
  → corre los nodos secuencialmente
  → guarda estado en DynamoDB
  → devuelve resultado
        ↓
_process_sqs() continúa
  → guarda resultado en DynamoDB (job status: done)
  → guarda reporte si corresponde
        ↓
Frontend pollean GET /chat/status/{job_id}
  → cuando status == "done", muestran el resultado
```

El usuario no espera bloqueado — el HTTP response llega en milisegundos. LangGraph corre en background procesado por el worker SQS.

---

## Lambda recibe dos tipos de eventos distintos

El mismo `handler()` atiende tanto requests HTTP como mensajes SQS:

```python
def handler(event, context):
    records = event.get("Records", [])
    if records and records[0].get("eventSource") == "aws:sqs":
        # Evento SQS → procesar con LangGraph
        result = asyncio.run(_process_sqs(event))
        asyncio.set_event_loop(asyncio.new_event_loop())
        return result
    # Evento HTTP → delegar a FastAPI via Mangum
    return _http_handler(event, context)
```

- **HTTP via Function URL** → Mangum traduce el evento Lambda a un request WSGI que FastAPI entiende
- **SQS via Event Source Mapping** → `_process_sqs()` ejecuta el pipeline LangGraph

---

## Dónde termina tu código y empieza LangGraph

```
Tu código (handler.py)              LangGraph
        │
_process_sqs() línea 76:
  result = await graph.ainvoke(  ──► carga estado de DynamoDB (checkpointer)
    initial_state,                    mergea el nuevo mensaje al estado
    config=config,                    evalúa _entry_point(state) →
  )                                     "profile" | "destination" | "followup"
                                      ejecuta cada nodo en secuencia
                                      mergea resultados al estado
                                      guarda estado en DynamoDB
                               ◄── devuelve el estado final
        │
línea 78:
  last_message = result["messages"][-1]
```

Antes del `ainvoke` vos tenés el control. Adentro del `ainvoke` LangGraph tiene el control. En la línea 78 vos recuperás el control con el resultado.

---

## `compile()` vs `ainvoke()` — dos momentos completamente distintos

**`builder.compile()` — se ejecuta UNA SOLA VEZ al arrancar el contenedor Lambda**
- Toma toda la configuración (nodos, aristas, checkpointer) y construye el objeto `CompiledStateGraph`
- Es como construir una máquina — definís cómo funciona, conectás las piezas
- No procesa ningún mensaje, no llama a ningún LLM, no carga ningún estado
- Configura DynamoDB como checkpointer (con S3 offload para payloads grandes)
- Resultado: el objeto `graph` queda listo en memoria

**`graph.ainvoke()` — se ejecuta por cada mensaje SQS**
- Recién acá LangGraph activa la máquina con un input real
- Carga el estado de DynamoDB, mergea el mensaje, corre los nodos
- Es `ainvoke` (async) porque los nodos hacen I/O (LLM calls, Tavily, Qdrant)

```
Contenedor Lambda arranca
        │
        ▼
builder.compile()  ← construye la máquina (1 vez)
checkpointer = DynamoDBSaver(...)
        │
        ▼
graph = CompiledStateGraph  ← máquina lista, esperando
        │
        │  Llega mensaje SQS
        ▼
graph.ainvoke()  ← enciende la máquina con ese input
        │
        ▼
graph.ainvoke()  ← otro mensaje, misma máquina en memoria (instancia caliente)
```

`compile()` es la fábrica. `ainvoke()` es el uso.

---

## El checkpointer — cómo persiste el estado entre turnos

El doc original mencionaba `MemorySaver`. En producción se usa `DynamoDBSaver`:

```python
checkpointer = DynamoDBSaver(
    table_name=settings.checkpoints_table,
    region_name="us-east-1",
    ttl_seconds=86400 * 30,           # expira en 30 días
    s3_offload_config={
        "bucket_name": settings.checkpoints_s3_bucket,
        "key_prefix": "checkpoints",
    },
)
```

- **DynamoDB** guarda el estado del grafo por `thread_id` (= `session_id`)
- **S3 offload** se activa automáticamente cuando el payload supera el límite de DynamoDB (400KB) — los reportes largos van a S3, DynamoDB guarda solo un puntero
- `thread_id` es el `session_id` del frontend — así cada conversación tiene su propio estado aislado

En tests, `DynamoDBSaver` se reemplaza por `MemorySaver` (en `conftest.py`) para no necesitar AWS.

---

## El nodo de entrada — cómo LangGraph decide qué ejecutar

```python
def _entry_point(state: NomadState) -> str:
    if state.final_report:
        return "followup"     # ya tiene reporte → pregunta de seguimiento
    if state.profile_complete:
        return "destination"  # perfil listo → saltar directo al pipeline
    return "profile"          # primer mensaje → completar perfil
```

Este condicional es la lógica de routing central. Los tres caminos posibles:

| Situación | Nodo de entrada | Qué pasa |
|---|---|---|
| Primer mensaje del usuario | `profile` | El LLM extrae el perfil del mensaje |
| Perfil ya guardado (onboarding) | `destination` | Salta directo a buscar destinos |
| Ya tiene reporte generado | `followup` | Responde preguntas sobre los destinos |

---

## Dónde vive el código de ainvoke()

Los internos de `ainvoke()` (cargar estado, mergear input, llamar `_entry_point`) no están en tu proyecto — están en el código fuente de la librería instalada:

```
site-packages\
  └── langgraph\
        └── pregel\
              └── __init__.py   ← acá está implementado .ainvoke()
```

Vos nunca ves ese código porque es interno de LangGraph, igual que cuando llamás `list.sort()` no ves el código C que lo implementa.

---

## Resumen

Vos **configuraste** el grafo (nodos, aristas, checkpointer DynamoDB+S3). `compile()` **construyó** esa configuración en un objeto ejecutable una sola vez al arrancar el contenedor. Cuando el usuario manda un mensaje, `main.py` lo encola en SQS y responde inmediatamente. El `handler.py` recibe el evento SQS y llama `graph.ainvoke()` — ahí LangGraph toma el control, carga el estado de DynamoDB, ejecuta los nodos en secuencia, y guarda el resultado. El frontend pollean `GET /chat/status/{job_id}` hasta que el resultado está disponible.
