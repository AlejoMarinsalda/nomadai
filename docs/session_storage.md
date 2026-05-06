# sessionStorage — Persistencia de chat en el browser

## Qué es

`sessionStorage` es una API estándar del navegador definida en la especificación HTML5 del W3C. No pertenece a ninguna empresa ni servicio cloud. Cualquier browser moderno (Chrome, Firefox, Safari, Edge) la implementa, y cualquier código JavaScript que corra en ese browser puede usarla sin instalar nada.

Es un objeto clave-valor que el browser expone globalmente a todo código JS que corre en la página:

```javascript
window.sessionStorage   // o simplemente sessionStorage
```

Solo acepta strings como valores. Chrome lo implementa internamente usando SQLite dentro del perfil del usuario en disco, pero eso es un detalle del browser — lo que importa es que JS lo lee y escribe como un diccionario simple.

---

## Diferencia con localStorage y cookies

| | sessionStorage | localStorage | cookies |
|---|---|---|---|
| Cuándo se borra | Al cerrar el tab | Nunca (hasta limpieza manual) | Configurable (expiración) |
| Alcance | Solo el tab actual | Todos los tabs del mismo origen | Todos los tabs, se envía al servidor |
| Tamaño máximo | ~5 MB | ~5 MB | ~4 KB |
| Se envía al servidor | No | No | Sí (en cada request HTTP) |
| Acceso desde JS | Sí | Sí | Sí |

`sessionStorage` es la elección correcta para el chat porque:
- La conversación es específica del tab actual
- Al cerrar el tab tiene sentido empezar de cero
- No necesita enviarse al servidor (el estado real del LLM vive en DynamoDB)

---

## Dónde vive en la arquitectura de NomadAI

`sessionStorage` no está en AWS. Vive completamente en el browser del usuario.

```
Browser                          AWS
──────────────────────           ──────────────────────────
sessionStorage                   Lambda
  nomadai_chat_messages    ←→      DynamoDB (checkpoints LangGraph)
  nomadai_chat_session            DynamoDB (profiles)
                                  DynamoDB (reports)
```

Existen dos capas de persistencia que se complementan:

| | sessionStorage | DynamoDB Checkpointer |
|---|---|---|
| Qué guarda | Burbujas de chat visibles en pantalla | Estado interno del grafo LangGraph |
| Dónde vive | Navegador del usuario | AWS DynamoDB |
| Cuándo se borra | Al cerrar el tab | TTL 30 días |
| Para qué sirve | Restaurar la UI al navegar entre secciones | Memoria del LLM entre sesiones |

La información de `sessionStorage` nunca sale del browser. No genera requests HTTP ni pasa por Lambda.

---

## Cómo se usa en el código (Chat.tsx)

### Claves usadas

```typescript
const SS_MESSAGES = 'nomadai_chat_messages'
const SS_SESSION  = 'nomadai_chat_session'
```

### Lectura al montar el componente

```typescript
function loadMessages(): Message[] {
  try {
    return JSON.parse(sessionStorage.getItem(SS_MESSAGES) || '[]')
  } catch {
    return []
  }
}

// Se pasa como valor inicial — solo se ejecuta una vez al montar
const [messages, setMessages] = useState<Message[]>(loadMessages)
```

`getItem(key)` devuelve el string guardado o `null`. `JSON.parse` lo convierte de vuelta al array de objetos. El `|| '[]'` maneja el caso donde no hay nada guardado todavía.

El `sessionRef` (que guarda el `session_id` del hilo del LLM) también se restaura:

```typescript
const sessionRef = useRef<string | null>(sessionStorage.getItem(SS_SESSION))
```

### Escritura cuando cambia el estado

```typescript
useEffect(() => {
  const toSave = messages.filter(m => m.role !== 'thinking')
  sessionStorage.setItem(SS_MESSAGES, JSON.stringify(toSave))
}, [messages])
```

`setItem(key, value)` solo acepta strings, por eso se usa `JSON.stringify` para serializar el array. Los mensajes con `role === 'thinking'` (las burbujas de carga) se excluyen para no guardar estados transitorios.

El `session_id` se guarda cuando el backend lo devuelve:

```typescript
const { job_id, session_id } = await sendMessage(...)
sessionRef.current = session_id
sessionStorage.setItem(SS_SESSION, session_id)
```

### Limpieza en reset

```typescript
sessionStorage.removeItem(SS_MESSAGES)
sessionStorage.removeItem(SS_SESSION)
setMessages([])
```

---

## El ciclo completo

```
Usuario escribe mensaje
        ↓
React actualiza messages[] en memoria RAM
        ↓
useEffect detecta el cambio
        ↓
JSON.stringify(messages) → sessionStorage.setItem()
        [string persistido en el browser, en disco]
        ↓
Usuario navega a Historial → componente Chat se desmonta → RAM liberada
        ↓
Usuario vuelve al Chat → componente monta de nuevo
        ↓
useState(loadMessages) → sessionStorage.getItem() → JSON.parse
        ↓
Array de mensajes restaurado → conversación aparece en pantalla
        ↓
sessionRef restaurado → próximo mensaje continúa el mismo hilo del LLM
```

---

## Limitaciones

- **Solo en el mismo tab**: abrir la app en un tab nuevo arranca sin historial de chat
- **Se borra al cerrar el tab**: comportamiento intencional para el chat, pero el usuario pierde la conversación si cierra accidentalmente
- **Solo strings**: cualquier dato complejo requiere `JSON.stringify` / `JSON.parse`
- **~5 MB de límite**: suficiente para conversaciones de chat, pero reportes muy largos podrían acercarse al límite si se acumulan muchos mensajes
