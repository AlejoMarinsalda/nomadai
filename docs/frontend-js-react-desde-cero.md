# JavaScript y React desde Cero
**Para:** Developers con experiencia en Python/FastAPI aprendiendo frontend con NomadAI  
**Enfoque:** Cada concepto explicado desde cero, con ejemplos del código real del proyecto

---

## Parte 1 — JavaScript

### Variables y tipos

En Python usás simplemente el nombre:
```python
nombre = "Alejo"
edad = 28
activo = True
```

En JS usás `const` o `let`:
```javascript
const nombre = "Alejo"   // no va a cambiar → const
let edad = 28            // puede cambiar → let
let activo = true        // minúscula: true/false (no True/False)
```

**Regla:** si la variable no se reasigna → `const`. Si cambia → `let`. Nunca uses `var`.

---

### Los tipos básicos

| Python | JavaScript | Nota |
|--------|-----------|------|
| `str` | `string` | igual |
| `int`, `float` | `number` | JS tiene un solo tipo numérico |
| `bool` | `boolean` | `true`/`false` en minúscula |
| `None` | `null` / `undefined` | JS tiene DOS "nada" |
| `list` | `Array` | muy similares |
| `dict` | `Object` | muy similares |

**`null` vs `undefined`:**
```javascript
let a = null       // nada explícito (lo pusiste a propósito)
let b              // undefined: declaraste pero no asignaste
```

---

### Template literals (f-strings de JS)

Python:
```python
ciudad = "Bangkok"
mensaje = f"Viajando a {ciudad}"
```

JS — con backtick `` ` `` y `${}`:
```javascript
const ciudad = "Bangkok"
const mensaje = `Viajando a ${ciudad}`
```

En NomadAI (`api.ts`):
```typescript
const res = await fetch(`/profile/${userId}`, {
    headers: { Authorization: `Bearer ${credential}` }
})
```

---

### Arrays

```javascript
const ciudades = ["Bangkok", "Lisboa", "Medellín"]
const primero  = ciudades[0]      // "Bangkok"
const largo    = ciudades.length  // 3 — propiedad, no función
ciudades.push("Tokio")            // agrega al final
```

---

### Objects (diccionarios)

```javascript
const destino = {
    ciudad: "Bangkok",   // keys sin comillas (si son simples)
    pais: "Tailandia",
    costo: 1200
}
destino.ciudad    // "Bangkok" — acceso con punto
destino["pais"]   // "Tailandia" — acceso con corchetes
```

---

### Funciones

```javascript
// Declaración clásica
function saludar(nombre) {
    return `Hola ${nombre}`
}

// Arrow function — forma moderna, equivalente
const saludar = (nombre) => {
    return `Hola ${nombre}`
}

// Si el cuerpo es una sola expresión — return implícito
const saludar = (nombre) => `Hola ${nombre}`

// Un solo parámetro — podés omitir los paréntesis
const saludar = nombre => `Hola ${nombre}`
```

Las cuatro son equivalentes. En React vas a ver las últimas dos constantemente.

---

### Funciones como valores

En React los eventos reciben funciones como argumentos:
```javascript
// Pasás la función sin llamarla (sin paréntesis)
ejecutar(saludar)

// O una arrow function anónima directamente
ejecutar(() => console.log("hola"))
```

En NomadAI (`Chat.tsx`):
```typescript
<button onClick={() => send()}>Enviar</button>
// equivalente Python: boton.on_click(lambda: send())
```

---

### Métodos de Array — los más usados en React

**map** — transformar cada elemento:
```javascript
const ciudades = ["bangkok", "lisboa"]
const mayusculas = ciudades.map(c => c.toUpperCase())
// ["BANGKOK", "LISBOA"]
```

**filter** — quedarse con los que cumplen una condición:
```javascript
const numeros = [1, 2, 3, 4, 5]
const pares = numeros.filter(n => n % 2 === 0)
// [2, 4]
```

**find** — el primero que cumple la condición:
```javascript
const destinos = [{ ciudad: "Bangkok", costo: 1200 }, { ciudad: "Lisboa", costo: 2100 }]
const barato = destinos.find(d => d.costo < 1500)
// { ciudad: "Bangkok", costo: 1200 }
```

En `Chat.tsx` línea 276 — renderizar la lista de mensajes:
```typescript
{messages.map(msg => {
    if (msg.role === 'user')     return <div key={msg.id}>...</div>
    if (msg.role === 'thinking') return <div key={msg.id}>...</div>
    return <div key={msg.id}>...</div>
})}
```

---

### Async/Await y Promises

JS es single-threaded pero necesita hacer operaciones lentas (HTTP, timers) sin bloquear la pantalla. La solución es el event loop — el mismo concepto que `asyncio` en Python.

**Promise** — un valor que todavía no llegó:
```javascript
// Sin await — recibís la Promise, no el valor
const promesa = fetch("/profile/123")
console.log(promesa)  // Promise { <pending> }

// Con await — esperás a que se resuelva
const respuesta = await fetch("/profile/123")
console.log(respuesta)  // Response { status: 200, ... }
```

**async/await:**
```python
# Python
async def send_message(text: str) -> dict:
    response = await httpx.post("/chat", json={"message": text})
    return response.json()
```

```javascript
// JavaScript — casi idéntico
async function sendMessage(text) {
    const response = await fetch("/chat", {
        method: "POST",
        body: JSON.stringify({ message: text })
    })
    return response.json()
}
```

**Importante:** `.json()` en JS también es async (lee el body como stream):
```javascript
const response = await fetch("/chat", { ... })  // objeto HTTP
const data     = await response.json()          // el dict
```

**try/catch:**
```javascript
try {
    const data = await getProfile(userId)
} catch (err) {
    console.log(`Error: ${err.message}`)
}
```

**Desestructuración** — extraer propiedades de un objeto:
```javascript
// Forma larga
const result = await sendMessage(text)
const job_id    = result.job_id
const session_id = result.session_id

// Forma corta (desestructuración)
const { job_id, session_id } = await sendMessage(text)
```

---

## Parte 2 — React

### Componentes y JSX

Un componente es una **función que devuelve HTML** (JSX):
```typescript
function Saludo() {
    return (
        <h1>Hola mundo</h1>
    )
}
```

JSX es una sintaxis especial — HTML dentro de JS. Por debajo React lo convierte a JS puro.

**Reglas de JSX:**

1. Un solo elemento raíz:
```typescript
// ❌ Error
return (
    <h1>Titulo</h1>
    <p>Párrafo</p>
)

// ✅ Correcto
return (
    <>
        <h1>Titulo</h1>
        <p>Párrafo</p>
    </>
)
```

2. `className` en lugar de `class`:
```typescript
<div className="contenedor">
```

3. Las llaves `{}` son el portal a JS:
```typescript
const ciudad = "Bangkok"
const costo  = 1200

return (
    <div>
        <h1>{ciudad}</h1>
        <p>{costo * 12} por año</p>
        <p>{costo > 1000 ? "caro" : "barato"}</p>
    </div>
)
```

**Componentes propios siempre con mayúscula:**
```typescript
<Avatar />    // componente propio
<div />       // tag HTML nativo
```

**Renderizado condicional:**
```typescript
// Ternario
{estaLogueado ? <Perfil /> : <Login />}

// Short-circuit — solo mostrar si se cumple
{mensajes.length === 0 && <p>No hay mensajes</p>}
```

En `Chat.tsx` línea 269:
```typescript
{messages.length === 0 && (
    <div className="flex flex-col items-center">
        <CompassIcon size={48} />
    </div>
)}
```

---

### Props

Props son los parámetros de un componente — cómo el padre le pasa datos al hijo.

```python
# Python
def stat_card(value: int, label: str, unit: str = ""):
    return f"<div>{value} {unit} — {label}</div>"

stat_card(value=180, label="Internet", unit="Mbps")
```

```typescript
// React — equivalente exacto
function StatCard({ value, label, unit = "" }: { value: number; label: string; unit?: string }) {
    return <div>{value} {unit} — {label}</div>
}

<StatCard value={180} label="Internet" unit="Mbps" />
```

**Regla al pasar props:** strings con comillas, todo lo demás entre `{}`:
```typescript
<StatCard value={180} label="Internet" unit="Mbps" />
//        ^^^^^^^^^^ número     ^^^^^^^^^ string
```

**Props opcionales** con `?`:
```typescript
{ value: number; label: string; unit?: string }
//                              ^^^^^ opcional
```

**Props de función** — cómo el hijo avisa al padre:
```typescript
// Padre pasa la función
<InputArea onSend={handleSend} />

// Hijo la llama sin saber qué hace
function InputArea({ onSend }: { onSend: (texto: string) => void }) {
    return <button onClick={() => onSend("Hola")}>Enviar</button>
}
```

---

### Eventos

React tiene eventos predefinidos que se asignan a elementos JSX. Todos empiezan con `on` + CamelCase:

| Evento | Cuándo se dispara |
|--------|------------------|
| `onClick` | click del mouse |
| `onKeyDown` | tecla presionada |
| `onChange` | valor del input cambió |
| `onMouseEnter` | mouse entra al elemento |
| `onMouseLeave` | mouse sale del elemento |

En `Chat.tsx`:
```typescript
// Botón — línea 339
<button onClick={() => send()}>Enviar</button>

// Textarea — línea 329
<textarea
    onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
        }
    }}
/>
```

---

### useState

El hook más importante de React. Crea variables que cuando cambian **actualizan la pantalla automáticamente**.

```typescript
const [valor, setValor] = useState(valorInicial)
```

- `valor` — el dato actual
- `setValor` — la función para cambiarlo (nunca modificar `valor` directamente)
- `useState(valorInicial)` — el valor con el que arranca

```typescript
const [contador, setContador] = useState(0)
const [loading, setLoading]   = useState(false)
const [mensajes, setMensajes] = useState([])
```

**La regla de oro:**
```typescript
// ❌ React no detecta el cambio
contador = contador + 1

// ✅ React detecta, re-renderiza, pantalla actualiza
setContador(contador + 1)
```

**Flujo cuando llamás al setter:**
```
setContador(5)
      ↓
React guarda el nuevo valor
      ↓
React vuelve a ejecutar el componente
      ↓
React actualiza solo las partes del DOM que cambiaron
      ↓
Usuario ve el cambio
```

**Con arrays — nunca mutar, siempre crear nuevo:**
```typescript
// ❌ Mutar directamente
messages.push(nuevoMensaje)

// ✅ Nuevo array con spread
setMessages([...messages, nuevoMensaje])
```

En `Chat.tsx` línea 85:
```typescript
const addMsg = useCallback((msg: Message) =>
    setMessages(p => [...p, msg])
, [])
// p => es "dame el valor actual y creá el nuevo en base a él"
```

En `Onboarding.tsx`:
```typescript
const [step, setStepp]   = useState(1)      // paso actual del wizard
const [saving, setSaving] = useState(false)  // ¿está guardando?
const [budget, setBudget] = useState(2500)   // presupuesto elegido
```

Cuando `setSaving(true)` se llama, el botón se bloquea con spinner en pantalla. Cuando el pipeline termina, `navigate('/results/...')` lleva al usuario a los resultados.

---

### useEffect

Código que corre **fuera del ciclo de render**, en momentos específicos.

```typescript
useEffect(() => {
    // código
}, [dependencias])
```

**Tres modos según el array:**

```typescript
// Array vacío — solo al montar (equivalente al startup de FastAPI)
useEffect(() => {
    fetchUserData()
}, [])

// Con dependencias — cuando algo cambia
useEffect(() => {
    fetchProfile(userId)
}, [userId])  // corre cada vez que userId cambie

// Sin array — en cada render (raramente útil)
useEffect(() => {
    console.log("re-render")
})
```

**Cleanup — limpiar al desmontar:**
```typescript
useEffect(() => {
    const timer = setInterval(() => console.log("tick"), 1000)
    return () => clearInterval(timer)  // se ejecuta al desmontar
}, [])
```

**En NomadAI (`Chat.tsx`):**
```typescript
// Scroll automático cuando llegan mensajes
useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [messages])

// Persistir mensajes en sessionStorage
useEffect(() => {
    if (!sessionRef.current) return
    sessionStorage.setItem(msgsKey(sessionRef.current), JSON.stringify(messages))
}, [messages])
```

**Early return** — patrón de guardia:
```typescript
useEffect(() => {
    if (!isQuick || !userId || !credential) {
        setQuickLoading(false)
        return  // salir antes si faltan condiciones
    }
    getProfile(userId, credential)
}, [])
```

**Error más común:**
```typescript
// ❌ userId se usa pero no está en el array — React avisa
useEffect(() => {
    fetchProfile(userId)
}, [])

// ✅ correcto
useEffect(() => {
    fetchProfile(userId)
}, [userId])
```

---

### Módulos e Imports

Sistema para que los archivos se comuniquen entre sí.

**Export — poner algo a disposición:**
```typescript
// Named export — varios por archivo
export function formatBudget() { ... }
export function formatDate() { ... }
export const API_URL = "https://..."

// Default export — solo uno por archivo
export default function Chat() { ... }
```

**Import — traer lo que necesitás:**
```typescript
// Named import — con llaves, nombre exacto
import { formatBudget, formatDate } from './utils'

// Default import — sin llaves, cualquier nombre
import Chat from './pages/Chat'
```

**Librerías externas vs archivos propios:**
```typescript
// Librería instalada (viene de node_modules, sin ./)
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Archivo propio (con ./ o ../)
import { sendMessage } from './lib/api'
import Chat from './pages/Chat'
```

**Estructura de NomadAI:**

| Archivo | Qué exporta |
|---------|-------------|
| `pages/Chat.tsx` | default — el componente página |
| `lib/api.ts` | named — funciones HTTP |
| `hooks/useAuth.tsx` | named — el hook de autenticación |
| `components/Logo.tsx` | named — `CompassIcon` |

---

## Resumen — qué aprendiste

| Tema | Concepto clave |
|------|---------------|
| Variables | `const` no cambia, `let` cambia, nunca `var` |
| Funciones | Arrow functions `=>` son la forma estándar en React |
| Arrays | `map`, `filter`, `find` — transformar sin mutar |
| Async/await | Igual que Python, `.json()` también necesita await |
| Componentes | Funciones que devuelven JSX |
| Props | Parámetros del componente, valores bajan de padre a hijo |
| Eventos | `onClick`, `onKeyDown`, etc. — funciones que reaccionan a interacciones |
| useState | Variable que al cambiar actualiza la pantalla automáticamente |
| useEffect | Código que corre en momentos específicos del ciclo de vida |
| Módulos | `export` para exponer, `import` para consumir |
