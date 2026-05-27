# Flujo completo — Usuario Guest en el Onboarding
**Caso de uso:** Usuario nuevo que entra como invitado, completa el onboarding y recibe sus destinos  
**Archivos involucrados:** `Login.tsx` → `useAuth.tsx` → `Chat.tsx` → `Onboarding.tsx` → `lib/api.ts` → FastAPI → DynamoDB → SQS → LangGraph

---

## Paso 1 — Click en "Continuar como invitado"

```typescript
// Login.tsx
async function handleGuest() {
    setGuestLoading(true)
    const data = await guestLogin()         // ← llama a api.ts
    login(data.user_id, data.name, data.picture, 'guest')
    navigate('/chat')
}
```

```typescript
// lib/api.ts
export async function guestLogin() {
    const res = await fetch(`/auth/guest`, { method: 'POST' })
    return res.json()
    // devuelve: { user_id: "guest_550e8400-e29b...", name: "Invitado", picture: "" }
}
```

**El request:**
```
POST https://nomadai.fit/auth/guest
(sin body, sin token — es público)
```

**El backend genera un ID temporal:**
```python
# app/api/main.py
@app.post("/auth/guest")
def auth_guest():
    guest_id = f"guest_{uuid.uuid4()}"   # → "guest_550e8400-e29b-41d4..."
    return {"user_id": guest_id, "name": "Invitado", "picture": ""}
```

Este ID **no se guarda en DynamoDB** — el backend lo genera y lo olvida. Solo el frontend lo recuerda.

---

## Paso 2 — `login()` guarda en localStorage

```typescript
// hooks/useAuth.tsx
function login(userId, userName, userPicture, credential) {
    localStorage.setItem('nomadai_user_id',      userId)
    localStorage.setItem('nomadai_user_name',    userName)
    localStorage.setItem('nomadai_user_picture', userPicture)
    localStorage.setItem('nomadai_credential',   credential)
    // para guest: credential = 'guest' (string literal)
}
```

**Lo que queda en localStorage:**
```
nomadai_user_id:      "guest_550e8400-e29b-41d4..."
nomadai_user_name:    "Invitado"
nomadai_user_picture: ""
nomadai_credential:   "guest"
```

---

## Paso 3 — Navega a `/chat`, que detecta que no hay perfil

```typescript
// Chat.tsx — useEffect al montar
getProfile(userId, credential)
    .then(data => {
        if (data.found) {
            addMsg({ content: t('chat.welcome_back') })
        } else {
            navigate('/onboarding', { replace: true })  // ← guest siempre viene acá
        }
    })
```

**El request:**
```
GET https://nomadai.fit/profile/guest_550e8400...
Authorization: Bearer guest
```

**El backend verifica el token:**
```python
# app/services/auth.py
def get_current_user(authorization: str = Header(None)):
    if authorization == "Bearer guest":
        return "guest_550e8400..."   # deja pasar
    # si fuera Google: verifica el JWT con google-auth
```

**DynamoDB no tiene el guest → devuelve `found: false`:**
```json
{ "found": false }
```

→ Frontend redirige a `/onboarding`.

---

## Paso 4 — El onboarding en detalle

### 4.1 — El state inicial cuando el componente monta

Cuando el guest llega a `/onboarding`, React ejecuta el componente y crea estas variables de estado, todas vacías:

```typescript
// Onboarding.tsx — se ejecuta UNA VEZ al montar
const [step, setStepp]        = useState(1)       // paso actual: 1
const [saving, setSaving]     = useState(false)    // ¿está procesando?

// Datos del formulario — todos vacíos al inicio
const [timezone, setTimezone]       = useState('UTC-3 (Buenos Aires)')  // default
const [nationality, setNationality] = useState('')    // → ""
const [budgetIdx, setBudgetIdx]     = useState(4)     // → índice 4 = $2500
const [climates, setClimates]       = useState([])    // → []
const [hobbies, setHobbies]         = useState([])    // → []
const [customHobbies, setCustomHobbies] = useState([])
const [goals, setGoals]             = useState([])    // → []
const [targetLanguage, setTargetLanguage] = useState('')
```

Ningún dato va al backend todavía. Todo vive **solo en memoria del browser**.

---

### 4.2 — Paso 1: el usuario escribe su nacionalidad

```typescript
// JSX del Step 1
<input
    value={nationality}                              // muestra el state actual: ""
    onChange={e => setNationality(e.target.value)}  // actualiza con cada tecla
    placeholder="Ej: Argentina, España..."
/>
```

El usuario escribe `"argentina"` letra por letra:
```
tecla "a" → setNationality("a")         → re-render → input muestra "a"
tecla "r" → setNationality("ar")        → re-render → input muestra "ar"
tecla "g" → setNationality("arg")       → re-render → input muestra "arg"
...
tecla "a" → setNationality("argentina") → re-render → input muestra "argentina"
```

**Ningún request al backend. Todo en state local.**

---

### 4.3 — Click en "Siguiente" → cambia el step

```typescript
function next() {
    setStepp(s => Math.min(s + 1, TOTAL_STEPS))  // 1 → 2
}
```

`setStepp(2)` → React re-renderiza → el JSX evalúa `{step === 2 && <StepDos />}` → muestra el paso 2. El paso 1 desaparece pero **los datos siguen en el state** — `nationality` sigue siendo `"argentina"`.

---

### 4.4 — Paso 2: slider de presupuesto

```typescript
const BUDGET_STEPS = [800, 1200, 1500, 2000, 2500, 3500, 5000, 6000]

// JSX
<input
    type="range"
    min={0}
    max={BUDGET_STEPS.length - 1}   // 0 a 7
    value={budgetIdx}                // índice actual: 4
    onChange={e => setBudgetIdx(Number(e.target.value))}
/>

// El valor en USD se calcula en tiempo real:
const budget = BUDGET_STEPS[budgetIdx]   // BUDGET_STEPS[4] = 2500
```

El slider no guarda `2500` directamente — guarda el **índice** `4`. `budget` es una variable calculada, no un estado. Esto permite que el último valor sea "6000+" en vez de un número exacto.

---

### 4.5 — Paso 3: selección de hobbies (multi-select)

```typescript
function toggleHobby(id: string) {
    setHobbies(prev =>
        prev.includes(id)
            ? prev.filter(h => h !== id)   // si ya estaba → lo saca
            : [...prev, id]                // si no estaba → lo agrega
    )
}

// JSX — cada botón
<button onClick={() => toggleHobby('poker')}>
    🃏 Poker
</button>
```

El usuario clickea "Poker" → `setHobbies(['poker'])` → el botón se marca visualmente porque `hobbies.includes('poker')` es `true`.

Clickea "Surf" → `setHobbies(['poker', 'surf'])`.

Clickea "Poker" de nuevo → `setHobbies(['surf'])` — lo deseleccionó.

**State acumulado hasta ahora en memoria:**
```
nationality:  "argentina"
budgetIdx:    4  (= $2500)
climates:     ["tropical", "mediterranean"]
hobbies:      ["surf", "poker"]
```

---

### 4.6 — Paso 5: confirmación — el state se convierte en labels legibles

El step de confirmación **no usa el state directamente** — transforma los IDs en labels para mostrarlos:

```typescript
// IDs guardados en state:
climates = ["tropical", "mediterranean"]

// Para mostrar en pantalla, filtra el array de opciones:
const climateLabel = CLIMATE_OPTIONS
    .filter(c => climates.includes(c.id))
    .map(c => c.label)
    .join(', ')
// → "Tropical, Mediterranean"

// Lo mismo para hobbies:
const allHobbyLabels = [
    ...HOBBY_OPTIONS.filter(h => hobbies.includes(h.id)).map(h => h.label),
    ...customHobbies   // los que el usuario escribió manualmente
]
// → ["Surf", "Poker"]
```

---

### 4.7 — Click en "Encontrar mis destinos" → `finish()` se ejecuta

```typescript
async function finish() {
    if (!userId || !credential) return
    setSaving(true)    // muestra el overlay de "buscando..."
```

`setSaving(true)` → React re-renderiza → aparece el spinner overlay en pantalla.

---

### 4.8 — Se construye el objeto del perfil desde todos los states

```typescript
    // Convierte el índice del slider al número real de USD
    const budget = BUDGET_STEPS[budgetIdx]   // BUDGET_STEPS[4] = 2500

    // Convierte IDs de hobbies a labels legibles
    const hobbyLabels = [
        ...HOBBY_OPTIONS.filter(h => hobbies.includes(h.id)).map(h => h.label),
        ...customHobbies,
    ]
    // → ["Surf", "Poker"]

    // Convierte IDs de goals a labels + agrega el idioma si eligió uno
    const goalLabels = [
        ...GOAL_OPTIONS.filter(g => goals.includes(g.id)).map(g => g.label),
        ...(targetLanguage
            ? [`Learn ${LANGUAGE_OPTIONS.find(l => l.id === targetLanguage)?.label}`]
            : [])
    ]
    // → ["Low cost of living", "Learn English"]

    // Convierte IDs de climas a string
    const climateLabel = CLIMATE_OPTIONS
        .filter(c => climates.includes(c.id))
        .map(c => c.label)
        .join(', ')
    // → "Tropical, Mediterranean"

    // Extrae solo el código UTC del string "UTC-3 (Buenos Aires)"
    const tzCode = timezone.split(' ')[0]
    // → "UTC-3"
```

---

### 4.9 — `patchProfile` arma y envía el PATCH

```typescript
    await patchProfile(userId, credential, {
        hobbies:            hobbyLabels,                      // ["Surf", "Poker"]
        goals:              goalLabels,                       // ["Low cost of living", "Learn English"]
        budget_usd_monthly: budget === 6000 ? 8000 : budget, // 2500
        work_timezone:      tzCode,                           // "UTC-3"
        nationality:        nationality || 'Not specified',   // "argentina"
        preferred_climate:  climateLabel || 'Any',            // "Tropical, Mediterranean"
    })
```

```typescript
// lib/api.ts
export async function patchProfile(userId, credential, data) {
    const res = await fetch(`/profile/${userId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${credential}`  // "Bearer guest"
        },
        body: JSON.stringify(data)
    })
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    if (!res.ok) throw new Error('PATCH_FAILED')
    return res.json()
}
```

**El request real que sale del browser:**
```
PATCH https://nomadai.fit/profile/guest_550e8400-e29b-41d4-a716
Content-Type: application/json
Authorization: Bearer guest

{
  "hobbies": ["Surf", "Poker"],
  "goals": ["Low cost of living", "Learn English"],
  "budget_usd_monthly": 2500,
  "work_timezone": "UTC-3",
  "nationality": "argentina",
  "preferred_climate": "Tropical, Mediterranean"
}
```

---

### 4.10 — El backend recibe el PATCH y guarda en DynamoDB

```python
# app/api/main.py
@app.patch("/profile/{user_id}")
def patch_user_profile(user_id: str, body: ProfilePatch, current_user = Depends(get_current_user)):

    # 1. Lee el perfil existente (o crea uno vacío si no existe)
    existing = get_profile(user_id) or UserProfile()

    # 2. Toma solo los campos que vienen en el body (exclude_none ignora los null)
    updates = body.model_dump(exclude_none=True)
    # → {"hobbies": ["Surf","Poker"], "goals": [...], "budget_usd_monthly": 2500, ...}

    # 3. Aplica los cambios sobre el perfil existente
    updated = existing.model_copy(update=updates)

    # 4. Guarda en DynamoDB
    save_profile(user_id, updated)
    # → DynamoDB: { user_id: "guest_550e...", profile_json: '{"hobbies":["Surf",...]}' }

    return {"updated": True, "profile": updated.model_dump()}
```

**La respuesta que vuelve al frontend:**
```json
{
  "updated": true,
  "profile": {
    "hobbies": ["Surf", "Poker"],
    "goals": ["Low cost of living", "Learn English"],
    "budget_usd_monthly": 2500,
    "work_timezone": "UTC-3",
    "nationality": "argentina",
    "preferred_climate": "Tropical, Mediterranean",
    "remote_work": true
  }
}
```

El frontend **ignora esta respuesta** en el onboarding — no necesita mostrar el perfil guardado, solo sigue al siguiente paso.

---

### 4.11 — `sendMessage` dispara el pipeline de IA

```typescript
    const triggerMsg = t('onboarding.trigger_message')
    // → "Encontrá mis destinos ideales según mi perfil"

    const { job_id, session_id } = await sendMessage(
        triggerMsg,
        null,           // sin session_id previo → el backend genera uno nuevo
        credential,     // "guest"
        i18n.language   // "es" o "en"
    )
    // → { job_id: "abc-123", session_id: "xyz-789" }
```

**El request:**
```
POST https://nomadai.fit/chat/async
Authorization: Bearer guest

{
  "message": "Encontrá mis destinos ideales según mi perfil",
  "session_id": null,
  "language": "es"
}
```

**El backend crea el job, manda a SQS y responde inmediatamente:**
```python
@app.post("/chat/async")
def chat_async(request: ChatRequest, user_id: str = Depends(rate_limit)):
    job_id = str(uuid.uuid4())       # → "abc-123"
    session_id = str(uuid.uuid4())   # → "xyz-789" (nuevo, porque vino null)

    create_pending_job(job_id)       # guarda {"status": "pending"} en DynamoDB

    _get_sqs().send_message(         # encola el job para procesamiento async
        QueueUrl=settings.sqs_queue_url,
        MessageBody=json.dumps({
            "job_id": job_id,
            "session_id": session_id,
            "user_id": "guest_550e8400...",
            "message": "Encontrá mis destinos...",
            "language": "es"
        })
    )

    return {"job_id": job_id, "session_id": session_id, "status": "pending"}
    # responde en < 100ms aunque el pipeline tarde 60 segundos
```

---

### 4.12 — El polling: el frontend pregunta cada 3 segundos

```typescript
    setPollingLabel(POLL_LABELS[0])   // "Analizando tu perfil..."

    await new Promise<void>((resolve, reject) => {
        const timer = setInterval(async () => {

            // rota las etiquetas del spinner
            idx = (idx + 1) % POLL_LABELS.length
            setPollingLabel(POLL_LABELS[idx])
            // "Analizando tu perfil..." → "Buscando destinos..." → "Enriqueciendo..." → ...

            // pregunta si el job terminó
            const data = await getJobStatus(job_id)
            // GET /chat/status/abc-123

            if (data.status === 'done' || data.status === 'error') {
                clearInterval(timer)   // para el polling

                if (data.result_data) {
                    // pipeline exitoso → navega a resultados
                    window.dispatchEvent(new CustomEvent('nomadai:newreport'))
                    navigate(`/results/${session_id}`, {
                        replace: true,
                        state: { result: data.result_data }
                    })
                } else {
                    // pipeline falló → muestra error con botón retry
                    setSaving(false)
                    setPipelineError(t('onboarding.pipeline_error'))
                }
                resolve()
            }
        }, 3000)   // cada 3 segundos
    })
```

**Los requests de polling:**
```
GET https://nomadai.fit/chat/status/abc-123   (a los 3s)  → {"status": "pending"}
GET https://nomadai.fit/chat/status/abc-123   (a los 6s)  → {"status": "pending"}
GET https://nomadai.fit/chat/status/abc-123   (a los 9s)  → {"status": "pending"}
...
GET https://nomadai.fit/chat/status/abc-123   (a los 45s) → {"status": "done", "result_data": {...}}
```

Cuando llega `"done"` con `result_data` → `navigate('/results/xyz-789')` → el usuario ve sus destinos.

---

## El state a lo largo del tiempo

```
Monta el componente    step=1, nationality="", hobbies=[], ...
Usuario escribe        step=1, nationality="argentina", ...
Click Siguiente        step=2, nationality="argentina", ...  ← dato persiste
Mueve el slider        step=2, budgetIdx=4 (=$2500), ...
Selecciona hobbies     step=3, hobbies=["surf","poker"], ...
Click Siguiente x2     step=5 (confirmación), todo acumulado
Click "Encontrar"      saving=true → overlay aparece
patchProfile OK        (el state no cambia, solo importa el backend)
sendMessage OK         job_id="abc", session_id="xyz"
polling cada 3s        pollingLabel rota entre 4 mensajes
job done               navigate('/results/xyz') → componente se desmonta
                       TODO el state se destruye — ya no importa
```

---

## Resumen de diferencias Guest vs Google

| | Guest | Google |
|---|---|---|
| `user_id` | `guest_uuid` | número Google (21 dígitos) |
| `credential` | string `"guest"` | JWT token de Google |
| Perfil en DynamoDB | ✅ se guarda | ✅ se guarda |
| Reportes en DynamoDB | ❌ no se guarda | ✅ se guarda |
| Historial | ❌ vacío | ✅ persiste |
| Si cierra la pestaña | pierde todo | recupera todo |
| Rate limiting | ✅ aplica igual | ✅ aplica igual |
