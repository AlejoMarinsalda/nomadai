# Frontend para Devs Backend — Aprendé React desde lo que ya sabés
**Para:** Developers con experiencia en Python/FastAPI aprendiendo frontend con NomadAI  
**Enfoque:** Cada concepto de React explicado con su equivalente en backend

---

## La pregunta más importante antes de empezar

**¿Por qué el frontend es diferente al backend?**

En el backend escribís código que corre una vez por request y termina. En el frontend escribís código que está vivo todo el tiempo — reacciona a clicks, a datos que llegan, a timers — y tiene que actualizar la pantalla automáticamente.

Esa diferencia cambia todo.

---

## Concepto 1: Componentes = Funciones que devuelven HTML

En FastAPI una función de endpoint devuelve JSON:
```python
@app.get("/user")
def get_user():
    return {"name": "Alejo", "role": "nomad"}
```

En React una función de componente devuelve HTML (JSX):
```typescript
function UserCard() {
    return (
        <div>
            <p>Alejo</p>
            <p>nomad</p>
        </div>
    )
}
```

La diferencia: el endpoint corre una vez y termina. El componente **vive en la pantalla** y puede volver a ejecutarse (re-renderizarse) cuando cambian los datos.

**Dónde verlo en NomadAI:** Abrí `frontend/src/pages/ProfilePage.tsx`. Toda la página es una función `ProfilePage()` que devuelve JSX.

---

## Concepto 2: Props = Parámetros de función

En Python pasás datos a funciones con parámetros:
```python
def format_budget(amount: int, currency: str = "USD") -> str:
    return f"${amount} {currency}/mes"
```

En React pasás datos a componentes con props:
```typescript
function StatCard({ value, label, unit }: { value: number; label: string; unit?: string }) {
    return (
        <div>
            <span>{value}</span>
            <span>{unit}</span>
            <span>{label}</span>
        </div>
    )
}

// Uso:
<StatCard value={180} label="Internet" unit="Mbps" />
```

Los tipos de las props son exactamente como los tipos en Pydantic — TypeScript te avisa si pasás el tipo equivocado.

**Dónde verlo en NomadAI:** En `Results.tsx`, el componente `StatCard` recibe `value`, `label` y `unit` como props.

---

## Concepto 3: State = Variables que disparan re-renders

Esta es la diferencia más importante entre frontend y backend.

En Python una variable es solo un valor:
```python
count = 0
count = count + 1  # cambió pero nadie se entera
```

En React, `useState` crea una variable especial. Cuando cambia, React **automáticamente actualiza la pantalla**:
```typescript
const [count, setCount] = useState(0)

// Cuando llamás a setCount, React vuelve a ejecutar el componente
// y la pantalla se actualiza sola
setCount(count + 1)
```

**La regla de oro:** Si un dato cambia y necesitás que la pantalla refleje ese cambio → usá `useState`. Si es solo un cálculo o una constante → variable normal.

**Ejemplo concreto en NomadAI:** En `Onboarding.tsx`:
```typescript
const [step, setStep] = useState(1)          // paso actual del wizard
const [budget, setBudget] = useState(2500)   // presupuesto elegido
const [saving, setSaving] = useState(false)  // ¿está guardando?
```
Cuando el usuario mueve el slider de presupuesto, `setBudget(nuevoValor)` actualiza la variable Y automáticamente actualiza el número que ve en pantalla. Sin escribir ningún código extra.

---

## Concepto 4: useEffect = Código que corre en momentos específicos

En FastAPI tenés eventos de startup:
```python
@app.on_event("startup")
async def startup():
    await connect_database()
```

En React, `useEffect` ejecuta código en respuesta a eventos del ciclo de vida del componente:

```typescript
// Corre UNA VEZ al montar el componente (equivalente al startup)
useEffect(() => {
    fetchUserProfile()
}, [])   // ← el array vacío significa "solo al montar"

// Corre cada vez que userId cambia
useEffect(() => {
    fetchUserProfile(userId)
}, [userId])  // ← cuando userId cambie, volver a correr

// Corre en cada render (sin array — raramente usado)
useEffect(() => {
    console.log("el componente se renderizó")
})
```

**Ejemplo concreto en NomadAI:** En `ProfilePage.tsx`:
```typescript
useEffect(() => {
    if (!userId || !credential) return
    getProfile(userId, credential)
        .then(data => { if (data.found) setProfile(data.profile) })
        .finally(() => setLoading(false))
}, [userId, credential])
// "Cuando userId o credential cambien, ir a buscar el perfil"
```

---

## Concepto 5: Hooks = Lógica reutilizable (como utilidades en Python)

En Python creás funciones de utilidad en archivos separados:
```python
# utils.py
def parse_budget(s: str) -> int:
    return int(s.replace(",", ""))
```

En React, los hooks son funciones que encapsulan lógica con estado. Se reconocen porque empiezan con `use`:

```typescript
// hooks/useAuth.tsx
function useAuth() {
    const [userId, setUserId] = useState(null)
    const [credential, setCredential] = useState(null)
    
    function login(data) { setUserId(data.userId); setCredential(data.credential) }
    function logout() { setUserId(null); setCredential(null) }
    
    return { userId, credential, login, logout, isAuthenticated: !!userId }
}
```

Cualquier componente puede llamar `useAuth()` y acceder al estado de autenticación y a las funciones. Es la forma de React de compartir lógica entre componentes sin duplicar código.

**Hooks de React que más vas a usar en NomadAI:**
- `useState` → variable con re-render
- `useEffect` → código en momentos específicos
- `useNavigate` → navegar entre rutas programáticamente
- `useParams` → leer `:sessionId` de la URL
- `useSearchParams` → leer `?session=abc` de la URL
- `useTranslation` → acceder a las traducciones

---

## Concepto 6: Context = Dependency Injection (como FastAPI's Depends)

En FastAPI usás `Depends` para inyectar dependencias sin pasarlas manualmente:
```python
@app.get("/profile")
def get_profile(user_id: str = Depends(get_current_user)):
    ...
```

En React, Context permite que cualquier componente acceda a datos globales sin pasarlos como props por cada nivel:

```typescript
// Crear el contexto (como definir la dependencia)
const AuthContext = createContext(null)

// Proveerlo en el nivel más alto (como registrar en el app)
function App() {
    return (
        <AuthProvider>   {/* todos los hijos pueden acceder */}
            <Router>...</Router>
        </AuthProvider>
    )
}

// Consumirlo en cualquier componente (como usar Depends)
function ProfilePage() {
    const { userId, credential } = useAuth()  // ← viene del Context
    ...
}
```

Sin Context, tendrías que pasar `userId` y `credential` como prop desde `App` → `Layout` → `ProfilePage` en cada nivel. Context lo hace disponible directamente.

**Dónde verlo en NomadAI:** `hooks/useAuth.tsx` define el Context y el hook. `App.tsx` envuelve todo con `<AuthProvider>`. Cualquier página usa `useAuth()` directamente.

---

## Concepto 7: React Router = Routing de FastAPI

En FastAPI definís rutas como decoradores:
```python
@app.get("/profile/{user_id}")
def get_profile(user_id: str):
    ...
```

En React Router definís rutas como configuración:
```typescript
const router = createHashRouter([
    { path: '/profile', element: <ProfilePage /> },
    { path: '/results/:sessionId', element: <ResultsKeyed /> },
    //                 ↑ equivalente a {user_id} en FastAPI
])
```

Para leer el parámetro `:sessionId`:
```typescript
function Results() {
    const { sessionId } = useParams()  // como request.path_params en FastAPI
    ...
}
```

Para navegar programáticamente (como un redirect en FastAPI):
```typescript
const navigate = useNavigate()
navigate('/results/abc123')         // como RedirectResponse
navigate('/login', { replace: true }) // replace: no agrega al historial
```

---

## Concepto 8: TypeScript Interfaces = Pydantic Models

En Python usás Pydantic para tipar datos:
```python
class DestinationResult(BaseModel):
    city: str
    country: str
    match_score: int
    monthly_cost_usd: int | None
```

En TypeScript usás interfaces para lo mismo:
```typescript
interface DestinationResult {
    city: string
    country: string
    match_score: number
    monthly_cost_usd: number | null
}
```

La diferencia: Pydantic valida en runtime. TypeScript solo valida en tiempo de desarrollo (el código compilado no tiene los tipos). Pero te da el mismo autocompletado y detección de errores mientras escribís.

---

## Concepto 9: async/await y fetch = httpx en Python

En Python hacés requests HTTP así:
```python
import httpx
response = await httpx.AsyncClient().get("https://api.example.com/data")
data = response.json()
```

En JavaScript/TypeScript:
```typescript
const response = await fetch("https://api.example.com/data")
const data = await response.json()
```

En NomadAI, todas las llamadas HTTP están en `lib/api.ts`. Cada función es async y devuelve datos tipados:

```typescript
export async function getProfile(userId: string, credential: string) {
    const res = await fetch(`/profile/${userId}`, {
        headers: { Authorization: `Bearer ${credential}` }
    })
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    return res.json()  // devuelve Promise que se resuelve con el JSON
}
```

---

## Concepto 10: Tailwind CSS = estilos como parámetros

El CSS tradicional es como configurar un servidor con archivos de config separados. Tailwind es como pasar opciones directamente como parámetros:

```typescript
// Sin Tailwind (CSS separado)
<div className="user-card">...</div>
// user.css: .user-card { display: flex; padding: 16px; border-radius: 8px; }

// Con Tailwind (todo inline)
<div className="flex p-4 rounded-xl border">...</div>
```

Las clases más comunes en NomadAI:
```
flex          → display: flex
items-center  → align-items: center
gap-3         → gap: 12px (entre elementos flex)
p-4           → padding: 16px
px-4 py-2     → padding horizontal 16px, vertical 8px
rounded-xl    → border-radius: 12px
text-sm       → font-size: 14px
font-bold     → font-weight: 700
text-zinc-500 → color: #71717a (gris)
w-full        → width: 100%
h-full        → height: 100%
overflow-y-auto → overflow-y: auto (scroll vertical)
```

En NomadAI se mezcla Tailwind con estilos inline para los colores del design system:
```typescript
<div className="flex items-center gap-2 rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
```
Tailwind para layout/espaciado, `style={{ }}` para los colores específicos del brand.

---

## El flujo de datos en React — lo más importante

En el backend el flujo es lineal: request → proceso → response → termina.

En React el flujo es **cíclico**:

```
Usuario hace algo (click, input)
        ↓
Evento llama a setAlgo(nuevoValor)
        ↓
React detecta que el estado cambió
        ↓
React vuelve a ejecutar el componente (re-render)
        ↓
React actualiza solo las partes del DOM que cambiaron
        ↓
Usuario ve el cambio en pantalla
```

Esto pasa en milisegundos y es lo que hace que las UIs de React se sientan instantáneas.

---

## Ejercicios para entender NomadAI

Estos ejercicios te van a ayudar a conectar la teoría con el código real:

**Ejercicio 1 — State básico:**
Abrí `Onboarding.tsx` y buscá todas las llamadas a `useState`. ¿Cuántas hay? ¿Para qué sirve cada una? Intentá predecir qué pasaría en la pantalla si `setSaving(true)` se llama.

**Ejercicio 2 — useEffect:**
En `ProfilePage.tsx` hay un `useEffect`. ¿Cuándo corre? ¿Qué pasa si eliminás el array `[userId, credential]` del final?

**Ejercicio 3 — Props:**
En `Results.tsx` buscá el componente `StatCard`. ¿Qué props recibe? Intentá agregar una nueva prop `color` y usarla en el estilo.

**Ejercicio 4 — Navegación:**
En `History.tsx`, cuando el usuario hace click en un reporte, ¿a qué ruta navega? ¿Cómo decide entre `/results/` y `/history/`?

**Ejercicio 5 — Context:**
En cualquier página, ¿cómo accede al `userId` sin recibirlo como prop? Seguí el flujo desde `useAuth()` hasta `AuthProvider` en `App.tsx`.

**Ejercicio 6 — El ciclo completo:**
Abrí `Chat.tsx` y seguí el flujo de la función `send()` de principio a fin. ¿Cuántos `setState` hay? ¿Cuántas llamadas al backend? ¿Qué pasa cuando `data.result_data` existe?

---

## Qué leer después para profundizar

En orden de relevancia para este proyecto:

1. **React docs oficiales** — react.dev (en inglés, son excelentes)
   - "Describing the UI" → components, JSX, props
   - "Adding Interactivity" → state, events
   - "Managing State" → cuando y cómo usar state

2. **TypeScript para JavaScripters** — typescriptlang.org/docs/handbook
   - Solo las secciones de types, interfaces y generics

3. **React Router v6** — reactrouter.com/en/main
   - Routing, useNavigate, useParams

4. **Tailwind CSS** — tailwindcss.com/docs
   - Flexbox, Grid, Spacing, Typography
