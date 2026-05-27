# Flujo completo — del botón al reporte

Descripción paso a paso de lo que ocurre desde que el usuario aprieta el botón final del onboarding hasta que el reporte aparece en pantalla.

---

## 1. React hace PATCH del perfil → FastAPI → DynamoDB

El usuario completó el formulario de onboarding y aprieta el botón. El evento `onClick` dispara `finish()` en `Onboarding.tsx`, que llama a `patchProfile()`.

`patchProfile()` hace un `PATCH /profile/{userId}` a FastAPI. FastAPI recibe el request en el endpoint `patch_user_profile()` (`main.py` línea 133), lee el perfil existente de DynamoDB, mergea los cambios y guarda el perfil actualizado en DynamoDB con `save_profile()`.

En este punto el perfil del usuario ya está persistido en DynamoDB. React aún no sabe nada de destinos ni de reportes.

---

## 2. React llama a FastAPI → FastAPI crea el job en SQS

Inmediatamente después del patch, `finish()` llama a `sendMessage()` con un mensaje trigger (ej: "Genera mi reporte de destinos").

`sendMessage()` hace un `POST /chat/async` a FastAPI. FastAPI crea un job en DynamoDB con `status: pending` y luego llama a `sqs.send_message()` para publicar el mensaje en la cola. FastAPI responde inmediatamente con `{ job_id, session_id }` — no espera que LangGraph termine.

**Corrección importante:** React no crea el job en SQS directamente. React llama a FastAPI, y es FastAPI quien publica en SQS.

---

## 3. AWS Event Source Mapping detecta el mensaje y activa Lambda

AWS monitorea la cola SQS permanentemente. Cuando detecta un nuevo mensaje, dispara automáticamente la Lambda mediante el mecanismo de **Event Source Mapping** — no hay polling ni código tuyo que haga esto, AWS lo gestiona internamente.

Lambda arranca con un evento que contiene `eventSource: "aws:sqs"`.

---

## 4. handler.py ejecuta el pipeline LangGraph

`handler()` detecta que el evento es de SQS (línea 30) y llama a `_process_sqs()`. Esta función:

1. Carga el perfil guardado en el paso 1 desde DynamoDB
2. Construye el estado inicial con ese perfil (`profile_complete: True`)
3. Llama a `graph.ainvoke()` — acá LangGraph toma el control

LangGraph evalúa `_entry_point()`, ve que el perfil está completo y salta directo al pipeline:

```
destination_node  → genera 3 destinos recomendados
enrichment_node   → enriquece cada destino en paralelo
                    (clima, visa, hobbies, YouTube — 4 tareas × 3 destinos)
compiler_node     → genera el reporte final con el LLM
```

Todo el estado del grafo se persiste en DynamoDB + S3 (el checkpointer de LangGraph). Cuando el payload del reporte supera 400KB, DynamoDB guarda solo un puntero y el contenido real va a S3.

---

## 5. handler.py actualiza el job en DynamoDB con status: done

Cuando `graph.ainvoke()` termina, `_process_sqs()` llama a `update_job_status()` con `status: done` y el `result_data` del reporte. Esto escribe en la tabla de jobs de DynamoDB.

**Corrección importante:** El handler no "informa a SQS" que terminó. SQS no está involucrado en la finalización — solo DynamoDB se actualiza.

---

## 6. React pollean FastAPI hasta recibir status: done

Mientras LangGraph trabaja, el frontend está en un loop de polling: cada pocos segundos llama a `getJobStatus(job_id)`, que hace `GET /chat/status/{job_id}` a FastAPI. FastAPI lee el estado del job desde DynamoDB.

Cuando el estado es `done`, FastAPI devuelve el `result_data` completo con los destinos y el reporte.

---

## 7. React navega a /results

Cuando `getJobStatus()` devuelve `status: done`, `finish()` llama a `navigate('/results/{session_id}')` con el `result_data` como state. El componente `Results.tsx` muestra el reporte al usuario.

---

## Diagrama completo

```
Usuario aprieta botón
        ↓
React → PATCH /profile/{userId}        → FastAPI → DynamoDB (guarda perfil)
        ↓
React → POST /chat/async               → FastAPI → SQS (publica mensaje)
        ↓                                FastAPI responde { job_id } inmediatamente
React empieza polling GET /chat/status/{job_id}
        ↓
AWS Event Source Mapping detecta mensaje en SQS
        ↓
Lambda arranca → handler.py
        ↓
_process_sqs() carga perfil de DynamoDB
        ↓
graph.ainvoke() — LangGraph toma el control
    → destination_node
    → enrichment_node  (12 tareas en paralelo)
    → compiler_node
        ↓
handler.py → update_job_status(done, result_data) → DynamoDB
        ↓
React polling detecta status: done
        ↓
navigate('/results') — reporte en pantalla
```

---

## Qué servicio hace qué

| Servicio | Responsabilidad |
|---|---|
| React | Dispara el patch y el mensaje; pollean el estado del job |
| FastAPI | Recibe requests HTTP, guarda en DynamoDB, publica en SQS |
| SQS | Transporta el mensaje de FastAPI a Lambda de forma asíncrona |
| AWS Event Source Mapping | Conecta SQS con Lambda automáticamente |
| handler.py | Detecta el evento SQS y orquesta la ejecución de LangGraph |
| LangGraph | Ejecuta los nodos en secuencia, persiste estado en DynamoDB+S3 |
| DynamoDB | Guarda perfiles, jobs (status/result) y checkpoints de LangGraph |
| S3 | Almacena reportes largos cuando superan el límite de DynamoDB (400KB) |
