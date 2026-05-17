# Frontend Architecture — NomadAI
**Stack:** React 18 · Vite · TypeScript · Tailwind CSS v3 · react-i18next  
**Fecha:** Mayo 2026

---

## 1. Estructura de archivos

```
frontend/src/
├── main.tsx              ← punto de entrada, monta React + i18n
├── App.tsx               ← define todas las rutas
├── index.css             ← design tokens globales y estilos custom
├── i18n.ts               ← configuración de idiomas
├── hooks/
│   └── useAuth.tsx       ← único hook de autenticación global
├── components/
│   ├── Logo.tsx          ← compass icon SVG + logotipo (compartido)
│   └── Layout.tsx        ← shell de la app: sidebar + mobile nav
├── lib/
│   ├── api.ts            ← todas las llamadas HTTP al backend
│   └── marked.ts         ← renderer de markdown con soporte YouTube
├── pages/
│   ├── Login.tsx         ← pantalla de ingreso
│   ├── Onboarding.tsx    ← wizard de 5 pasos para crear perfil
│   ├── Results.tsx       ← "Vete a Lisboa." — resultados principales
│   ├── DestinationDetail.tsx ← guía completa de un destino
│   ├── Chat.tsx          ← chat de seguimiento post-resultados
│   ├── History.tsx       ← lista de búsquedas pasadas
│   ├── ReportDetail.tsx  ← detalle de un reporte histórico
│   └── ProfilePage.tsx   ← ver y editar perfil del usuario
└── locales/
    ├── es.json           ← traducciones en español
    └── en.json           ← traducciones en inglés
```

---

## 2. El árbol de rutas (App.tsx)

La app usa **HashRouter** (`createHashRouter`). Esto significa que todas las rutas llevan `#` en la URL: `nomadai.fit/#/results/abc123`. La razón: el backend (Lambda) sirve siempre el mismo `index.html` sin importar la ruta, y el `#` le dice al browser que el routing lo maneja JavaScript, no el servidor.

```
/login                          → Login (pública)
/                               → RequireAuth
    /                           → redirige a /chat
    /onboarding                 → Onboarding
    /onboarding?quick=1         → Onboarding en modo rápido
    /chat                       → Chat
    /chat?session=abc&cities=X  → Chat con sesión específica
    /results/:sessionId         → Results (ResultsKeyed*)
    /results/:sessionId/:rank   → DestinationDetail (DestinationDetailKeyed*)
    /history                    → History
    /history/:sessionId         → ReportDetail (ReportDetailKeyed*)
    /profile                    → ProfilePage
```

**\*Keyed wrappers:** `ResultsKeyed`, `ReportDetailKeyed` y `DestinationDetailKeyed` son componentes mínimos que pasan `key={sessionId}` al componente real. Esto fuerza a React a desmontar y remontar el componente completo cuando cambia el `sessionId`, reseteando todo el estado interno.

```typescript
function ResultsKeyed() {
  const { sessionId } = useParams()
  return <Results key={sessionId} />
}
```

Sin esto, al clickear otra sesión en el sidebar, React reutilizaría el componente montado y los datos del estado anterior quedarían en pantalla.

---

## 3. Autenticación (useAuth.tsx)

Es un **React Context** que envuelve toda la app. Almacena el estado de login en `localStorage` para que persista entre recargas.

### Qué guarda en localStorage

```
nomadai_user_id      → ID único del usuario (Google sub o guest_uuid)
nomadai_user_name    → Nombre para mostrar
nomadai_user_picture → URL del avatar de Google
nomadai_credential   → Token de autenticación
```

### Dos tipos de usuario

**Google:** El usuario hace click en el botón de Google → Google devuelve un `credential` (JWT) → se envía al backend en `POST /auth/google` → el backend lo verifica con la librería de Google y devuelve el `user_id` (el Google sub, un número de 21 dígitos). El `credential` se renueva silenciosamente mientras la sesión de Google esté activa.

**Guest:** Se llama a `POST /auth/guest` → el backend genera un UUID con prefijo `guest_` → el frontend lo guarda como `user_id`. Los guests no tienen reportes guardados en DynamoDB.

### RequireAuth

```typescript
function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" />
}
```

`isAuthenticated` es simplemente `!!userId && !!credential`. Si el usuario recarga la página, el Context lee de `localStorage` y la sesión continúa.

---

## 4. Capa de API (lib/api.ts)

Todas las llamadas HTTP están centralizadas en este archivo. No hay fetch dispersos en los componentes.

### Patrón de autenticación

Cada endpoint protegido envía el credential como Bearer token:

```typescript
function auth(credential: string) {
  return { Authorization: `Bearer ${credential}` }
}
```

### El flujo async más importante: job polling

Las búsquedas de destinos son operaciones largas (30-60 segundos). El patrón es:

```typescript
// 1. Disparar el job — responde inmediatamente con job_id
const { job_id, session_id } = await sendMessage(text, sessionId, credential, language)

// 2. Polling cada 3 segundos hasta que el job termine
setInterval(async () => {
  const data = await getJobStatus(job_id)
  if (data.status === 'done') {
    // navegar a resultados
  }
}, 3000)
```

Esto permite que la Lambda procese sin timeouts de HTTP y el usuario ve un spinner animado mientras espera.

### Tipos principales exportados

```typescript
interface DestinationResult {
  rank, city, country, match_score, monthly_cost_usd,
  match_reasons, tagline, ai_summary, why_you_why_now,
  internet_mbps, security, community, visa_summary,
  visa: { required, type, max_stay_days, requirements },
  climate: { best_months, avoid_months },
  youtube_links, accommodation_links
}

interface ResultData {
  destinations: DestinationResult[]
}
```

---

## 5. Internacionalización (i18n.ts)

Usa **react-i18next** con detección automática del idioma del browser.

```typescript
i18n
  .use(LanguageDetector)   // detecta navigator.language
  .use(initReactI18next)
  .init({
    resources: { es: { translation: esJSON }, en: { translation: enJSON } },
    fallbackLng: 'es',
    detection: {
      order: ['navigator', 'localStorage'],
      caches: ['localStorage'],  // recuerda la elección
    }
  })
```

### Cómo se usa en componentes

```typescript
const { t, i18n } = useTranslation()

// Texto simple
t('chat.empty')  // → "Iniciá la conversación..."

// Con interpolación
t('chat.welcome_back', { name: 'Alejo' })  // → "¡Bienvenido de vuelta, Alejo!"

// El idioma actual
i18n.language  // → "es" o "en"
```

### Por qué el idioma importa en el backend

El idioma detectado (`i18n.language`) se envía en cada request al backend:

```typescript
sendMessage(text, sessionId, credential, i18n.language)
// → POST /chat/async body: { message, session_id, language: "en" }
```

El backend propaga este `language` a través de todo el pipeline de LangGraph para que Gemini genere el texto en el idioma correcto.

---

## 6. Layout y navegación (Layout.tsx)

El Layout es el "shell" que rodea todas las páginas autenticadas. Tiene dos modos:

**Desktop (md+):** Sidebar fijo a la izquierda de 208px con:
- Logo
- Botón "Nueva búsqueda"
- Lista de sesiones pasadas (con delete)
- Links a History y Profile
- Avatar y logout

**Mobile:** Header compacto arriba + bottom nav abajo con Chat, History, Profile.

### Sistema de sesiones en el sidebar

```typescript
function fetchSessions() {
  getReports(userId, credential).then(data => {
    setSessions(data.reports.map(r => ({
      session_id, created_at, destinations, report_text, result_json
    })))
  })
}

// Escucha el evento cuando se genera un nuevo reporte
window.addEventListener('nomadai:newreport', fetchSessions)
```

Cuando una búsqueda termina exitosamente, el componente que procesó el job dispara:
```typescript
window.dispatchEvent(new CustomEvent('nomadai:newreport'))
```
Y el Layout escucha ese evento y actualiza la lista sin recargar la página.

### Navegación inteligente desde el sidebar

```typescript
onClick={() => s.result_json
  ? navigate(`/results/${s.session_id}`, { state: { result: s.result_json } })
  : navigate(`/history/${s.session_id}`, { state: { report: s } })
}
```

Si el reporte tiene `result_json` (búsquedas nuevas con datos estructurados) → va a `/results`. Si no (búsquedas antiguas en markdown) → va a `/history`.

---

## 7. El flujo del usuario — página por página

### Login.tsx

Punto de entrada. No tiene estado complejo. Integra el botón oficial de Google One Tap mediante el script de Google en el `index.html`. Cuando Google responde con el credential, llama a `useAuth().login()`.

### Onboarding.tsx (modo normal — 5 pasos)

Wizard secuencial que recolecta el perfil del usuario:

```
Paso 1: Timezone + Nacionalidad
Paso 2: Presupuesto (slider) + Clima (multi-select)
Paso 3: Hobbies (chips predefinidos + custom)
Paso 4: Objetivos + Idioma a aprender
Paso 5: Confirmación del perfil completo
```

Al hacer click en "Encontrar mis destinos":
1. `PATCH /profile/{userId}` → guarda el perfil en DynamoDB
2. `POST /chat/async` → dispara el pipeline de IA
3. Polling interno con overlay animado
4. Al recibir `result_data` → navega a `/results/:sessionId`

### Onboarding.tsx (modo rápido — `?quick=1`)

Si el usuario ya tiene perfil guardado y clickea "Nueva búsqueda":
- Carga el perfil existente con `GET /profile/{userId}`
- Muestra resumen del perfil en una sola pantalla
- Botón "Buscar destinos" → dispara directamente el pipeline

### Results.tsx

La página principal de resultados. Muestra:
- Título editorial: "Vete a **Lisboa**."
- Match score, tagline, país
- 4 bullets "Por qué tú, por qué ahora"
- Mini-cards de destinos alternativos (rank 2, 3)
- CTAs: "Ver guía completa" → `DestinationDetail` / "Hacer preguntas" → `Chat`

El `result_data` llega de dos formas:
1. **Via navigation state** (flujo normal): `navigate('/results/abc', { state: { result: data } })`
2. **Via API fetch** (recarga de página/historial): `getReports()` → busca por `session_id` → usa `result_json`

### DestinationDetail.tsx

Guía completa de un destino. Carga datos del `result_data` que ya está en memoria o en el `location.state`. No hace nuevas llamadas a la IA.

Secciones principales:
- **Match score + héroe** (ciudad, país, tagline, match)
- **Costos** (barras apiladas: alojamiento, comida, transporte, otros)
- **Por qué encaja** (match_reasons)
- **Clima** (barras de meses, best/avoid)
- **Visa** (badge required/not required, tipo, días, requisitos)
- **Vuelos** (input "Desde:" con IATA lookup → links a Google Flights, Kiwi, Kayak)
- **Alojamiento** (Airbnb, Booking, Hostelworld — filtrados por presupuesto del usuario)
- **YouTube videos** (thumbnails clickeables)

### Chat.tsx

Chat de seguimiento post-resultados. El usuario puede hacer preguntas sobre los destinos recomendados ("¿hay salas de poker en Medellín?") y el `followup_node` del backend responde usando el contexto del reporte previo.

**Persistencia de mensajes en sessionStorage:**
```typescript
const msgsKey = (sessionId) => `nomadai_msgs_${sessionId}`

// Al recibir/enviar mensajes:
sessionStorage.setItem(msgsKey(sessionId), JSON.stringify(messages))

// Al cargar una sesión:
const cached = JSON.parse(sessionStorage.getItem(msgsKey(sessionId)) || '[]')
```

Los mensajes persisten en la sesión del browser (se pierden al cerrar la pestaña) pero no se guardan en DynamoDB. Solo el reporte final se persiste en la base de datos.

**Mensaje de intro automático:**
Cuando el usuario llega desde Results, la URL tiene `?cities=Medellín,Lisboa`. El Chat detecta este parámetro y agrega un mensaje inicial sin llamar al backend:

```typescript
const citiesParam = searchParams.get('cities')
// → "Tengo listo tu análisis de Medellín, Lisboa. ¿Qué querés saber?"
```

### History.tsx y ReportDetail.tsx

**History:** Lista los reportes del usuario desde `GET /reports/{userId}`. Cada card muestra las ciudades y la fecha. Click → navega a Results (si tiene `result_json`) o ReportDetail (si es markdown antiguo).

**ReportDetail:** Parsea el markdown del reporte con un parser propio que identifica secciones por `##` y `###`, y genera tabs por ciudad y acordeones por sección.

---

## 8. Rendering de markdown (lib/marked.ts)

Usa la librería `marked` con un renderer customizado para detectar links de YouTube y convertirlos en cards visuales:

```typescript
marked.use({
  renderer: {
    link(href, title, text) {
      const ytId = getYouTubeId(href)
      if (ytId) {
        return `<a class="yt-card" href="${href}" target="_blank">
          <span class="yt-thumb-wrap">
            <img src="https://img.youtube.com/vi/${ytId}/hqdefault.jpg"/>
            <span class="yt-play">▶</span>
          </span>
          <span class="yt-title">${text}</span>
        </a>`
      }
      return `<a href="${href}">${text}</a>`
    }
  }
})
```

**Por qué `<span>` en vez de `<div>`:** Los `<div>` son elementos block. Cuando están dentro de un `<p>` (que marked genera para los links), el browser cierra el `<p>` implícitamente, rompiendo el layout del primer card. Con `<span>` (inline) no hay este problema.

---

## 9. Design system

Todos los componentes usan las mismas constantes definidas localmente en cada archivo:

```typescript
const BG     = '#F2EDE4'  // crema — fondo general
const ACCENT = '#C84B1A'  // naranja — CTA, highlights
const DARK   = '#1C1917'  // casi negro — texto principal
const BORDER = '#E7E0D7'  // stone claro — bordes
const CARD   = '#FFFFFF'  // blanco — cards
const MUTED  = '#9E9186'  // gris cálido — texto secundario
```

**Tipografía:**
- **Cormorant Garamond** (serif) → títulos editoriales, números grandes, logo
- **Inter** (sans-serif) → todo el resto (cargada via Google Fonts en index.html)

**Clases CSS custom en index.css:**
- `.prose-chat` → estilos para markdown renderizado en el chat
- `.yt-card` → cards de YouTube
- `.section-block` / `.section-title` / `.section-body` → acordeones del historial
- `.custom-scrollbar` → scrollbar customizado (solo webkit)

---

## 10. Build y deploy del frontend

El frontend se buildea dentro del **Dockerfile** del backend:

```dockerfile
# Stage 1: build del frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --quiet
COPY frontend/ ./
RUN npm run build          # → genera dist/

# Stage 2: Lambda runtime
FROM python:3.12-slim
COPY --from=frontend-builder /app/dist /var/task/app/static
```

El output de Vite (`dist/`) se copia dentro de la imagen Docker como archivos estáticos. FastAPI los sirve con:

```python
app.mount("/static", StaticFiles(directory=_static), name="static")

@app.get("/")
def root():
    return FileResponse(_static / "index.html")
```

La URL `/` devuelve `index.html`. Desde ahí, el HashRouter toma el control y maneja todas las rutas del lado del cliente.

**Vite config:** Base path `/` y output en `../app/static` (relativo al frontend, apunta a la carpeta de FastAPI).

---

## 11. Diagrama de comunicación entre componentes

```
                    useAuth (Context)
                         │
             ┌───────────┼───────────┐
             │           │           │
          Login      Layout       todas las
                    (sidebar)      páginas
                         │
              ┌──────────┼──────────┐
              │          │          │
         sessions    newreport    nav
        (DynamoDB)   (event)    clicks
              │
    ┌─────────┴──────────┐
    │                    │
Results/DestinationDetail  History/ReportDetail
  (result_json)            (report_text/markdown)
              │
            Chat
     (sessionStorage msgs)
```

---

## 12. Puntos de extensión futuros

- **PWA / Mobile app:** El frontend ya es responsive. Agregar `manifest.json` y service worker convierte la app en PWA instalable.
- **Estado global:** Hoy no hay Redux ni Zustand. Si la app crece, el estado compartido entre páginas (ej: `resultData` accesible desde Chat) se podría centralizar en un Context o Zustand store.
- **SSR:** Hoy es 100% SPA. Para SEO (páginas de destinos indexables por Google) se necesitaría Next.js o similar.
- **Testing:** No hay tests de frontend. Los candidatos más valiosos serían los flows de onboarding y el polling.
