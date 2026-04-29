# Manejo del Asincronismo en NomadAI

## El problema que resuelve async/await

El pipeline de NomadAI hace ~9 llamadas a APIs externas por conversación (Tavily, YouTube, Gemini).
Sin async, esas llamadas corren una después de la otra. Con async, corren concurrentemente.

---

## Concepto clave: await pausa la coroutine, no el servidor

Esta es la confusión más común. Cuando el código llega a:

```python
prev_state = await graph.aget_state(config)
```

`await` **sí pausa** esa función hasta que `aget_state` termine — la siguiente línea
no corre hasta tener el resultado. Lo que **no se pausa** es el event loop completo.

```
Sin async (def chat):
  Request A entra → graph.get_state() → el SERVIDOR ENTERO espera
                    nadie más puede ser atendido durante esos 2 segundos

Con async (async def chat):
  Request A entra → await graph.aget_state() → /chat A se pausa
                    ↓ event loop libre
  Request B entra → se atiende mientras A espera
  Request C entra → se atiende mientras A espera
                    ↓ aget_state termina
  /chat A se reanuda → siguiente línea: await graph.ainvoke()
```

Es como un mozo en un restaurante: toma el pedido de la mesa 1, lo manda a la cocina,
y va a atender la mesa 2 y la mesa 3. Cuando la cocina avisa que el pedido está listo,
vuelve a la mesa 1. No se queda parado esperando.

Dentro de `/chat`, el orden de ejecución es siempre secuencial:

```python
prev_state = await graph.aget_state(config)   # pausa /chat, event loop libre
# aget_state terminó → continúa /chat
saved_profile = await asyncio.to_thread(...)  # pausa /chat, event loop libre
# terminó → continúa
result = await graph.ainvoke(...)             # pausa /chat, event loop libre
# terminó → continúa
```

El beneficio no es que `/chat` termine más rápido — es que el servidor puede atender
otros requests mientras ese `/chat` espera.

---

## Qué atiende el servidor mientras /chat espera

Mientras `/chat` está en `await graph.ainvoke()` (89s de pipeline), el event loop
puede atender cualquier otro request. Ejemplos concretos en NomadAI:

```
t=0s   Usuario A envía mensaje  → await graph.aget_state()   [/chat se pausa]
         ↓ event loop libre
t=0.1s Usuario B abre la app   → GET /                       [sirve index.html]
t=0.2s Usuario C hace Reset    → DELETE /profile/123         [borra perfil]
t=0.4s Usuario D ve su perfil  → GET /profile/456            [lee DynamoDB]
         ↓ event loop libre
t=2s   aget_state de A terminó → /chat A se reanuda
                                  await graph.ainvoke()       [/chat se pausa de nuevo]
```

El caso más importante en producción: varios usuarios mandan mensajes al mismo tiempo:

```
t=0s  Usuario A → await graph.ainvoke()   [89s de pipeline]
t=1s  Usuario B → await graph.ainvoke()   [89s de pipeline]
t=2s  Usuario C → await graph.ainvoke()   [89s de pipeline]

Con async:  los tres corren "en paralelo" → todos terminan cerca de t=90s
Sin async:  secuencial → A termina t=89s, B termina t=178s, C termina t=267s
```

---

## async/await vs SQS — diferencia fundamental

Parecen lo mismo pero resuelven problemas distintos.

**Con async/await** el browser de Usuario A sigue esperando la respuesta.
La conexión HTTP está abierta durante los 89 segundos. El servidor atiende
a B, C y D mientras tanto, pero A no recibe nada hasta que el pipeline termina.

```
Usuario A: POST /chat ──────────────────────────────────► respuesta (89s)
                       ↑ conexión HTTP abierta todo el tiempo
```

**Con SQS** el browser de Usuario A recibe una respuesta en 100ms y cierra
la conexión. El pipeline corre en background, completamente desacoplado del browser.

```
Usuario A: POST /chat/async ──► {job_id}  (100ms, conexión cerrada)

              [browser hace polling cada 3s]
              GET /status/job_id → pending
              GET /status/job_id → pending
              GET /status/job_id → done ✓
```

### El problema real que SQS resuelve y async/await no

Una conexión HTTP abierta durante 89 segundos es frágil:

- El usuario cambia de pestaña → el browser puede cancelar el request
- El wifi se corta un segundo → request perdido → el usuario no sabe si llegó
- En mobile, la pantalla se apaga → conexión cerrada

Con SQS el mensaje ya está en la cola cuando el browser recibe los 100ms.
Aunque el usuario cierre el browser, apague el teléfono, o pierda wifi —
el pipeline **ya está encolado y se va a procesar igual**. El resultado queda
guardado en DynamoDB esperándolo.

### Resumen

| | async/await | SQS |
|---|---|---|
| Qué mejora | Cuántos usuarios simultáneos atiende el servidor | Resiliencia del request individual ante cortes de red |
| La conexión HTTP | Sigue abierta hasta que termina | Se cierra en 100ms |
| Si se corta el wifi | El request se pierde | El job sigue procesándose |
| Complejidad | Baja | Alta |
| Cuándo usarlo | Siempre, es buena práctica | Cuando el proceso tarda mucho o necesitás garantías de entrega |

Son complementarios — en NomadAI usamos los dos a la vez.

---

## Matiz importante: async/await no es magia de velocidad

`graph.ainvoke()` internamente sigue usando threads para las llamadas de red.
El event loop no hace el trabajo pesado — **delega a threads**. El event loop
es el coordinador, los threads son los que realmente esperan la red.

Por eso async/await en Python no acelera un request individual — es **mejor uso
de recursos**: un solo proceso maneja muchos requests concurrentes sin crear
un thread por cada uno.

---

## Regla general

```
¿Estás en FastAPI con async def?       →  await directamente
¿Tenés función sync que querés await?  →  asyncio.to_thread(fn, args)
¿Estás en contexto 100% sync?          →  asyncio.run(coroutine())
```

---

## Capa 1 — FastAPI: el endpoint `/chat`

```python
# main.py

@app.post("/chat")
async def chat(request: ChatRequest):
    prev_state = await graph.aget_state(config)          # LangGraph async
    saved_profile = await asyncio.to_thread(get_profile, user_id)  # boto3 sync → async
    result = await graph.ainvoke(initial_state, config)  # LangGraph async
    await asyncio.to_thread(save_profile, user_id, result["user_profile"])
```

Cuando FastAPI ve `async def`, corre la función **dentro del event loop** del servidor
en vez de crear un thread extra. Cada `await` es un punto donde el event loop puede
atender otros requests mientras espera la respuesta.

`asyncio.to_thread()` es necesario para boto3 (DynamoDB) porque boto3 es una librería
**síncrona** — sin este wrapper bloquearía el event loop entero mientras espera la red.

### def vs async def en FastAPI

| | `def` | `async def` |
|---|---|---|
| Cómo lo corre FastAPI | En un thread pool interno | Directamente en el event loop |
| Cuándo usarlo | Funciones que llaman código sync y no se puede cambiar | Funciones que usan await |
| Bloquea el event loop | No (está en otro thread) | Solo si hacés llamadas sync sin to_thread |

---

## Capa 2 — LangGraph: el nodo `enrichment_node`

```python
# enrichment_node.py

async def _enrich_one(dest, nationality):
    media, climate, visa = await asyncio.gather(
        asyncio.to_thread(_enrich_media, dest),    # sync → awaitable
        asyncio.to_thread(_enrich_climate, dest),  # sync → awaitable
        asyncio.to_thread(_enrich_visa, dest, nationality),
    )
    return dest.model_copy(update={"media": media, "climate": climate, "visa": visa})


async def enrichment_node(state):
    enriched = await asyncio.gather(*[
        _enrich_one(dest, nationality) for dest in state.destinations
    ])
    return {"destinations": list(enriched)}
```

### Por qué `asyncio.gather` y no un loop

```python
# Sin gather — secuencial, ~30s
for dest in destinations:
    dest.media = _enrich_media(dest)    # espera
    dest.climate = _enrich_climate(dest) # espera
    dest.visa = _enrich_visa(dest)       # espera

# Con gather — concurrente, ~10s (el más lento de los 9)
await asyncio.gather(tarea1, tarea2, tarea3, tarea4, tarea5, tarea6, tarea7, tarea8, tarea9)
```

`asyncio.gather` lanza todas las coroutines al mismo tiempo y espera a que
**todas** terminen. La duración total es la del task más lento, no la suma.

### Por qué funciona aunque las herramientas sean síncronas

Las funciones `_enrich_media`, `_enrich_climate`, `_enrich_visa` usan `requests`
y los SDKs de Google/Tavily — todos síncronos. `asyncio.to_thread()` las corre en
threads del OS. Cuando un thread hace una llamada de red, el OS lo pone a dormir
y el GIL queda libre para que otros threads corran.

```
Thread 1 (media):   ──► HTTP ──────────────────────────► respuesta
Thread 2 (climate): ──► HTTP ────────────────────────► respuesta
Thread 3 (visa):    ──► HTTP ──────────────────────────────► respuesta
                    ↑ los tres "duermen" esperando la red simultáneamente
```

Esto funciona porque el trabajo es **I/O bound** (esperar respuestas de red),
no CPU bound. El GIL no es un obstáculo para I/O.

---

## Capa 3 — Lambda SQS: `handler.py`

```python
# handler.py

def handler(event, context):
    # Lambda siempre invoca un handler síncrono
    # asyncio.run() crea un event loop nuevo, corre la coroutine, lo destruye
    return asyncio.run(_process_sqs(event))


async def _process_sqs(event):
    prev_state = await graph.aget_state(config)
    result = await graph.ainvoke(initial_state, config)
    await asyncio.to_thread(save_job_result, job_id, {...})
```

`asyncio.run()` es la "puerta de entrada" al mundo async desde un contexto
completamente síncrono. Lambda exige que el handler sea `def` (no `async def`),
entonces `asyncio.run()` es la única forma de correr código async desde ahí.

**Por qué no usar `asyncio.run()` dentro de FastAPI:**
FastAPI ya tiene un event loop corriendo. `asyncio.run()` intenta crear otro loop
nuevo — eso falla con `RuntimeError: This event loop is already running`.
Dentro de FastAPI siempre usás `await` directamente.

---

## El mapa completo

```
Browser
  │
  ▼
FastAPI (event loop de uvicorn)
  │
  ├─ async def chat()
  │     │
  │     ├─ await graph.aget_state()      ← LangGraph async
  │     ├─ await to_thread(get_profile)  ← boto3 sync en thread
  │     ├─ await graph.ainvoke()         ← LangGraph async
  │     │       │
  │     │       └─ await enrichment_node()
  │     │               │
  │     │               └─ await gather(
  │     │                     to_thread(_enrich_media),    ┐
  │     │                     to_thread(_enrich_climate),  ├─ 9 threads en paralelo
  │     │                     to_thread(_enrich_visa),     ┘
  │     │                  )
  │     │
  │     └─ await to_thread(save_profile) ← boto3 sync en thread
  │
  └─ POST /chat/async
        │
        └─ SQS → Lambda handler (sync)
                    │
                    └─ asyncio.run(_process_sqs())
                            │
                            └─ await graph.ainvoke()  ← mismo flujo async
```

---

## Cuándo agregar más async en el futuro

Si en algún momento reemplazás boto3 por `aioboto3` (versión async de boto3),
podés eliminar todos los `asyncio.to_thread()` de las llamadas a DynamoDB
y hacer await directamente:

```python
# Con aioboto3 (futuro)
async with aioboto3.client("dynamodb") as client:
    await client.put_item(...)

# vs ahora con boto3 sync
await asyncio.to_thread(save_profile, user_id, profile)
```

El patrón de `asyncio.gather` en `enrichment_node` no cambiaría — solo
desaparecería el wrapper `to_thread` si las herramientas (Tavily, Gemini SDK)
lanzaran versiones async nativas.
