# Cómo se activa LangGraph en NomadAI

## La pregunta clave

`main.py` llama a `graph.invoke()` sobre un objeto que está en `app/graph/`. ¿Cómo sabe LangGraph que se le está haciendo un invoke si el objeto parece ser "tuyo"?

---

## La cadena de imports

```
main.py línea 21
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

## Dónde termina tu código y empieza LangGraph

```
Tu código (FastAPI)              LangGraph
        │
main.py línea 76:
  graph.invoke(                ──► carga estado de MemorySaver
    {"messages": [...]},            mergea el nuevo mensaje al estado
    config=config,                  llama _entry_point(state)
  )                                 activa el nodo correspondiente
                                    ejecuta cada función de nodo
                                    mergea resultados al estado
                                    guarda estado en MemorySaver
                               ◄── devuelve el estado final
        │
main.py línea 81:
  last_message = result["messages"][-1]
```

Antes del `invoke` vos tenés el control. Adentro del `invoke` LangGraph tiene el control. En la línea 81 vos recuperás el control con el resultado.

---

## `compile()` vs `invoke()` — dos momentos completamente distintos

Es importante no confundirlos:

**`builder.compile()` — línea 58 de `nomad_graph.py`, se ejecuta UNA SOLA VEZ al arrancar el servidor**
- Toma toda la configuración (nodos, aristas, checkpointer) y construye el objeto `CompiledStateGraph`
- Es como construir una máquina — definís cómo funciona, conectás las piezas
- No procesa ningún mensaje, no llama a ningún LLM, no carga ningún estado
- Resultado: el objeto `graph` queda listo en memoria

**`graph.invoke()` — línea 76 de `main.py`, se ejecuta en CADA REQUEST del usuario**
- Recién acá LangGraph activa la máquina con un input real
- Carga el estado de MemorySaver, mergea el mensaje, corre los nodos
- Puede ejecutarse miles de veces sobre el mismo objeto `graph`

```
Servidor arranca
      │
      ▼
builder.compile()  ← construye la máquina (1 vez)
      │
      ▼
graph = CompiledStateGraph  ← máquina lista, esperando
      │
      │  Usuario manda mensaje
      ▼
graph.invoke()  ← enciende la máquina con ese input (N veces)
      │
      ▼
graph.invoke()  ← otro mensaje, misma máquina
```

`compile()` es la fábrica. `invoke()` es el uso.

---

## Dónde vive el código de invoke()

Los 3 pasos internos de `invoke()` (cargar estado, mergear input, llamar `_entry_point`) no están en tu proyecto — están en el código fuente de la librería instalada:

```
site-packages\
  └── langgraph\
        └── pregel\
              └── __init__.py   ← acá está implementado .invoke()
```

Vos nunca ves ese código porque es interno de LangGraph, igual que cuando llamás `list.sort()` no ves el código C que lo implementa.

---

## Resumen

Vos **configuraste** el grafo (nodos, aristas, checkpointer). `compile()` **construyó** esa configuración en un objeto ejecutable una sola vez al arrancar. `invoke()` **ejecuta** ese objeto con cada mensaje del usuario, corriendo los nodos internamente. Cuando llamás `.invoke()`, estás llamando al método de LangGraph — no a ninguna función tuya — y LangGraph orquesta toda la ejecución.
