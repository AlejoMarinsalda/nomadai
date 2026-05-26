# TypeScript desde Cero
**Para:** Developers con experiencia en Python/FastAPI aprendiendo frontend con NomadAI  
**Enfoque:** TypeScript explicado desde Pydantic y los type hints de Python que ya conocés

---

## Antes de arrancar — qué es TypeScript

JavaScript no tiene tipos. Podés hacer esto y no pasa nada hasta que explota en runtime:

```javascript
function sumar(a, b) {
    return a + b
}

sumar(1, 2)       // 3 ✅
sumar("1", 2)     // "12" ❌ — concatenó en lugar de sumar
sumar(true, null) // 1 ❌ — JS convierte tipos silenciosamente
```

TypeScript es JavaScript con un sistema de tipos encima. El compilador te avisa de estos errores **antes de correr el código** — en el editor, mientras escribís.

**La clave:** TypeScript solo existe en desarrollo. Cuando el código se compila para el browser, los tipos desaparecen. Es como tener Pydantic solo para validar mientras desarrollás, pero sin el overhead en runtime.

---

## Concepto 1 — Tipos básicos

En Python usás type hints:
```python
nombre: str = "Alejo"
edad: int = 28
activo: bool = True
precio: float = 1200.50
nada: None = None
```

En TypeScript:
```typescript
const nombre: string  = "Alejo"
const edad: number    = 28        // un solo tipo para int y float
const activo: boolean = true
const precio: number  = 1200.50
const nada: null      = null
```

La sintaxis es `variable: tipo`. Igual que Python, pero el tipo va después con `:`.

**En la práctica casi nunca escribís el tipo explícito** — TypeScript lo infiere:
```typescript
const nombre = "Alejo"    // TypeScript sabe que es string
const edad   = 28         // TypeScript sabe que es number
const activo = true       // TypeScript sabe que es boolean
```

Solo escribís el tipo cuando TypeScript no puede inferirlo solo.

---

## Concepto 2 — Union types (el `|` que vas a ver en todos lados)

En Python:
```python
def get_age() -> int | None:  # puede ser int o None
    ...

valor: str | int = "hola"     # puede ser string o número
```

En TypeScript — exactamente igual con `|`:
```typescript
function getAge(): number | null {  // puede ser number o null
    ...
}

let valor: string | number = "hola"  // puede ser string o número
```

En NomadAI (`api.ts`) vas a ver esto constantemente:
```typescript
interface DestinationResult {
    monthly_cost_usd: number | null   // puede tener costo o no
    internet_mbps:    number | null
    avg_temp_celsius: number | null
}
```

`null` significa "no tenemos ese dato para este destino". El `| null` le dice a TypeScript (y a vos) que hay que chequear antes de usar el valor.

---

## Concepto 3 — Interfaces (equivalente a Pydantic)

Esta es la parte más importante de TypeScript para un dev backend.

En Python usás Pydantic para modelar datos:
```python
from pydantic import BaseModel

class DestinationResult(BaseModel):
    city: str
    country: str
    match_score: int
    monthly_cost_usd: int | None
    match_reasons: list[str]
```

En TypeScript usás interfaces:
```typescript
interface DestinationResult {
    city: string
    country: string
    match_score: number
    monthly_cost_usd: number | null
    match_reasons: string[]   // array de strings
}
```

Las diferencias:
- Pydantic valida en runtime (si llega un string donde va un int, explota)
- TypeScript solo valida en desarrollo (el código compilado no tiene los tipos)
- Pydantic genera documentación automática, TypeScript no

Pero para el objetivo de "atrapar errores mientras desarrollás" son equivalentes.

**Dónde verlo en NomadAI:** abrí `frontend/src/lib/api.ts` línea 9 — la interfaz `DestinationResult` completa.

---

## Concepto 4 — Propiedades opcionales

En Pydantic:
```python
class StatCard(BaseModel):
    value: int
    label: str
    unit: str = ""          # opcional con default
    color: str | None = None # opcional, puede ser None
```

En TypeScript el `?` marca una propiedad como opcional:
```typescript
interface StatCardProps {
    value: number
    label: string
    unit?: string    // opcional — puede no estar
    color?: string   // opcional — puede no estar
}
```

La diferencia entre `unit?: string` y `unit: string | null`:
- `unit?: string` → la propiedad puede directamente no existir en el objeto
- `unit: string | null` → la propiedad existe pero su valor puede ser null

En la práctica:
```typescript
// Con unit?: string
const a: StatCardProps = { value: 1, label: "test" }            // ✅ sin unit
const b: StatCardProps = { value: 1, label: "test", unit: "Mbps" } // ✅ con unit

// Con unit: string | null
const c = { value: 1, label: "test", unit: null }   // ✅ unit existe pero es null
const d = { value: 1, label: "test" }               // ❌ falta unit (obligatorio)
```

---

## Concepto 5 — Arrays tipados

En Python:
```python
ciudades: list[str] = ["Bangkok", "Lisboa"]
destinos: list[DestinationResult] = [...]
```

En TypeScript — dos sintaxis equivalentes:
```typescript
const ciudades: string[]              = ["Bangkok", "Lisboa"]
const ciudades: Array<string>         = ["Bangkok", "Lisboa"]  // alternativa

const destinos: DestinationResult[]   = [...]
const destinos: Array<DestinationResult> = [...]  // alternativa
```

La primera forma (`string[]`) es más común en NomadAI.

---

## Concepto 6 — Type aliases

A veces querés darle nombre a un tipo complejo para reutilizarlo:

```typescript
// Sin alias — repetís el tipo en cada lugar
function procesar(cb: (texto: string) => void) { ... }
function ejecutar(cb: (texto: string) => void) { ... }

// Con alias — definís el tipo una vez
type Callback = (texto: string) => void

function procesar(cb: Callback) { ... }
function ejecutar(cb: Callback) { ... }
```

En NomadAI (`Chat.tsx`) línea 30:
```typescript
type Message =
  | { id: string; role: 'user';      content: string }
  | { id: string; role: 'assistant'; content: string }
  | { id: string; role: 'thinking';  label: string }
```

Este es un **union type con objetos** — un `Message` puede ser uno de tres formas distintas. TypeScript sabe que si `role === 'thinking'` entonces tiene `label`, y si `role === 'user'` entonces tiene `content`.

---

## Concepto 7 — Funciones tipadas

En Python:
```python
def format_budget(amount: int, currency: str = "USD") -> str:
    return f"${amount} {currency}/mes"
```

En TypeScript:
```typescript
function formatBudget(amount: number, currency: string = "USD"): string {
    return `$${amount} ${currency}/mes`
}
```

El tipo de retorno va después de los parámetros con `:`.

**Arrow functions tipadas:**
```typescript
const formatBudget = (amount: number, currency: string = "USD"): string => {
    return `$${amount} ${currency}/mes`
}
```

**Tipo de una función** — cuando la pasás como prop:
```typescript
// Esta función recibe un string y no devuelve nada
type OnSend = (texto: string) => void

// Esta función recibe un número y devuelve un string
type Formatter = (amount: number) => string

// En una interfaz de props
interface InputProps {
    onSend: (texto: string) => void   // prop que es una función
}
```

---

## Concepto 8 — Generics (el `<T>` que da miedo)

En Python tenés generics con TypeVar:
```python
from typing import TypeVar, Generic

T = TypeVar('T')

def primero(lista: list[T]) -> T:
    return lista[0]

primero([1, 2, 3])      # devuelve int
primero(["a", "b"])     # devuelve str
```

En TypeScript — misma idea con `<T>`:
```typescript
function primero<T>(lista: T[]): T {
    return lista[0]
}

primero([1, 2, 3])      // devuelve number
primero(["a", "b"])     // devuelve string
```

En NomadAI vas a verlo en los estados de React:
```typescript
const [messages, setMessages] = useState<Message[]>([])
//                                      ^^^^^^^^^^
//                    le decís a useState qué tipo tiene el array
```

Sin el `<Message[]>`, TypeScript inferiría `never[]` (array vacío de tipo desconocido) y no podría validar lo que agregás después.

**Promise también usa generics:**
```typescript
// api.ts
return res.json() as Promise<{ job_id: string; session_id: string }>
//                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                   "esta Promise va a resolver con este objeto"
```

---

## Concepto 9 — `as` y Type Assertions

A veces TypeScript no puede inferir el tipo exacto y necesitás decírselo vos:

```typescript
// TypeScript sabe que es Response pero no sabe qué viene adentro
const data = await res.json()  // tipo: any

// Con assertion — le decís qué tipo esperar
const data = await res.json() as { job_id: string; session_id: string }
```

Es como un cast en otros lenguajes. No valida en runtime — le estás diciendo a TypeScript "confiá en mí, sé que esto es de este tipo".

En NomadAI (`api.ts`):
```typescript
return res.json() as Promise<{ job_id: string; session_id: string }>
```

---

## Concepto 10 — TypeScript en React

### Props tipadas

```typescript
// Forma 1 — tipo inline
function StatCard({ value, label }: { value: number; label: string }) {
    return <div>{value} — {label}</div>
}

// Forma 2 — interfaz separada (más legible para props complejas)
interface StatCardProps {
    value: number
    label: string
    unit?: string
}

function StatCard({ value, label, unit = "—" }: StatCardProps) {
    return <div>{value} {unit} — {label}</div>
}
```

### useState tipado

```typescript
// TypeScript infiere el tipo del valor inicial
const [loading, setLoading] = useState(false)       // boolean
const [nombre, setNombre]   = useState("Alejo")     // string

// Cuando arranca vacío — necesitás el generic
const [messages, setMessages] = useState<Message[]>([])
const [profile, setProfile]   = useState<Profile | null>(null)
```

### Eventos tipados

Los eventos en React tienen tipos específicos:

```typescript
// Evento de input
onChange={e => {
    const valor = e.target.value  // TypeScript sabe que es string
}}

// Evento de teclado
onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') { ... }
}}

// Evento de mouse
onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = '#1C1917'
}}
```

En la práctica TypeScript infiere el tipo del evento automáticamente — raramente necesitás escribirlo explícitamente.

---

## Concepto 11 — `unknown` vs `any`

Dos tipos especiales para cuando no sabés el tipo de algo:

```typescript
// any — apaga TypeScript completamente (evitalo)
let algo: any = "hola"
algo.metodoQueNoExiste()  // TypeScript no se queja — peligroso

// unknown — TypeScript te obliga a chequear antes de usar
let algo: unknown = "hola"
algo.toUpperCase()        // ❌ Error — TypeScript no sabe que es string

if (typeof algo === 'string') {
    algo.toUpperCase()    // ✅ — después del chequeo TypeScript sabe que es string
}
```

En NomadAI (`Chat.tsx`) línea 229:
```typescript
} catch (err: unknown) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        logout()
    }
}
```

El `err` es `unknown` — antes de usar `err.message` chequea que sea una instancia de `Error`.

---

## Cheat sheet rápido

```typescript
// Tipos básicos
const a: string  = "hola"
const b: number  = 42
const c: boolean = true
const d: null    = null

// Union
const e: string | null    = null
const f: number | string  = 42

// Array
const g: string[]         = ["a", "b"]
const h: number[]         = [1, 2, 3]

// Interface
interface Usuario {
    nombre: string
    edad: number
    email?: string     // opcional
}

// Función
function saludar(nombre: string): string {
    return `Hola ${nombre}`
}

// Arrow function
const saludar = (nombre: string): string => `Hola ${nombre}`

// Generic
const [items, setItems] = useState<string[]>([])

// Type alias
type ID = string | number
type Callback = (texto: string) => void
```

---

## Ejercicios para mañana

**Ejercicio 1 — Leer interfaces:**
Abrí `frontend/src/lib/api.ts`. Mirá `DestinationResult` e `ResultData`. ¿Cuántas propiedades son opcionales? ¿Cuántas pueden ser null?

**Ejercicio 2 — Union types:**
En `Chat.tsx` línea 30, el type `Message` tiene tres variantes. ¿Qué propiedad diferencia a `thinking` de `user` y `assistant`?

**Ejercicio 3 — Generics en useState:**
En `Onboarding.tsx`, buscá los `useState` que usan generics (`useState<algo>`). ¿Por qué esos necesitan el generic y los otros no?

**Ejercicio 4 — Props tipadas:**
En `Results.tsx`, buscá la definición de `StatCard`. ¿Cómo están tipadas sus props? ¿Usa interfaz separada o tipo inline?

**Ejercicio 5 — El type Message completo:**
En `Chat.tsx`, cuando el código hace `if (msg.role === 'thinking') return ...`, ¿cómo sabe TypeScript que dentro de ese bloque `msg` tiene la propiedad `label` y no `content`? (Pista: se llama "narrowing")
