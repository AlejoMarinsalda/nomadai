# NomadAI — Visión Estratégica: El Sistema Operativo del Nómada Global
**Fecha:** Mayo 2026 | **Versión:** 1.0 | **Horizonte:** 5 años

> *"No somos un buscador de destinos. Somos el primer sistema operativo para vivir y trabajar sin fronteras."*

---

## 1. Dónde estamos hoy

### El producto actual en una frase
Un motor de IA que toma el perfil de un nómada digital (presupuesto, hobbies, zona horaria, nacionalidad) y recomienda los 3 mejores destinos del mundo con análisis personalizado de costos, clima, visa, videos y alojamiento.

### Lo que funciona bien
- **Pipeline async sólido**: HTTP retorna en 100ms, el trabajo pesado va a SQS/Lambda. Correctísimo para escalar.
- **LangGraph con checkpoints**: las conversaciones sobreviven reinicios, el estado persiste en DynamoDB.
- **Datos estructurados**: el compiler genera JSON tipado, no markdown. Esto es la base de interfaces ricas.
- **Filtros reales**: timezone (±6h), presupuesto, idioma. No son recomendaciones genéricas.
- **Diseño editorial**: la estética cream/naranja/serif da identidad de marca premium.
- **i18n desde el día 1**: ES/EN autodetectado, extensible a cualquier idioma.
- **Entornos dev/prod separados**: CI/CD maduro para un proyecto joven.

### Las brechas más críticas del producto actual

#### Brecha 1: El RAG es una ilusión de datos
El `knowledge_base.json` tiene solo **visa + clima** para **21 destinos** y **una sola nacionalidad** (argentina). El 80% del valor real del reporte (hobbies, coworkings, comunidad, poker, surf spots) lo genera el LLM desde su memoria de entrenamiento — y puede alucinar.

Ejemplo real del código (`enrichment_node.py`):
```python
hobbies_results = search_rag(f"{hobby_str} {dest.city} ...")
# → Si no hay hit en Qdrant, retorna lista vacía
# → El compiler usa solo el LLM sin evidencia verificada
```

Esto significa que cuando el sistema dice "Casino Lisboa tiene mesas de poker" o "hay 43 colivings en Medellín", **no tiene ninguna fuente que lo respalde**. Es peligroso para la confianza del usuario.

#### Brecha 2: Solo cubre el momento del "sueño", no el viaje completo
El usuario llega, elige un destino, y se va. ¿Y después? No hay:
- Guía de qué hacer una vez que llegó
- Comunidad de otros nómadas en ese destino
- Seguimiento de cambios de visa o alertas de precios
- Integración con booking, vuelos, seguros
- Perfil que evoluciona con el tiempo

El ciclo de vida del nómada digital tiene 7 etapas. Hoy solo cubrimos la primera.

#### Brecha 3: Recomendación sin validación de la realidad
El match_score de 94 para Lisboa es un número generado por el LLM. No hay:
- Reviews reales de otros nómadas que estuvieron ahí
- Datos verificados de velocidad de internet (Speedtest Index)
- Precios reales de alquiler (Numbeo, Airbnb API)
- Estado actual de la visa (puede cambiar sin que el sistema sepa)

---

## 2. El mercado que nadie ha dominado

### Tamaño del mercado
- **35 millones** de nómadas digitales en el mundo (2024, MBO Partners)
- **Crecimiento**: +50% en 3 años post-pandemia
- **Gasto promedio**: $2,500 USD/mes por nómada
- **Mercado total direccionable (TAM)**: $87,500 millones/año
- **Mercado serviceable (SAM)**: $2,100 millones/año (plataformas de planificación/comunidad)

### El landscape competitivo actual — y sus debilidades

| Plataforma | Qué hace bien | Brecha crítica |
|-----------|--------------|----------------|
| **Nomad List** | Datos de 1,000+ ciudades, comunidad activa | UX de 2015, sin personalización, sin AI |
| **Remote.com** | Empleo remoto, contratación global | No ayuda con el destino, solo con el trabajo |
| **Deel** | Payroll global, compliance | Solo B2B, no habla con el nómada directamente |
| **SafetyWing** | Seguro de viajero | Un solo producto, sin contexto del destino |
| **Airalo** | eSIMs globales | Sin contexto, es un store de SIMs |
| **Hostelworld** | Alojamiento social/backpacker | Sin personalización, sin AI |
| **Booking/Airbnb** | Alojamiento a escala | Sin contexto de nómada, estancias cortas |
| **Kayak/Skyscanner** | Vuelos baratos | Sin perfil de usuario, sin visa info |

**El insight clave**: ninguna de estas plataformas sabe quién sos como nómada. Te ven como un bookingsuccession de transacciones, no como una persona con un perfil, objetivos y estilo de vida.

**NomadAI tiene algo que ninguna de ellas tiene**: un perfil personalizado construido desde el primer día, con contexto de hobbies, zona horaria, presupuesto, y objetivos de vida.

### El océano azul
La combinación de **AI personalizada + datos verificados + servicios integrados** no existe hoy. Quien lo construya primero gana.

---

## 3. La visión: el sistema operativo del nómada

Hoy NomadAI es una app de descubrimiento. El destino es convertirse en **el sistema operativo completo de la vida nómada** — la plataforma que acompaña al nómada desde que sueña con un destino hasta que vive allí, trabaja, conecta con otros y se mueve al siguiente.

### El ciclo de vida completo del nómada (7 etapas)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CICLO DE VIDA DEL NÓMADA DIGITAL                       │
│                                                                             │
│  1. SUEÑO    2. INVESTIGACIÓN  3. PLANIFICACIÓN  4. LLEGADA               │
│  "¿A dónde      "¿Cuánto          "Vuelos, visa,    "Internet, SIM,        │
│   ir?"           cuesta vivir?"    alojamiento"      coworking"             │
│     │                │                   │                │                │
│     ▼                ▼                   ▼                ▼                │
│ [NomadAI HOY] → [NomadAI v2]  →  [NomadAI v3]  → [NomadAI v4]           │
│                                                                             │
│  5. VIDA LOCAL    6. COMUNIDAD    7. SIGUIENTE DESTINO                      │
│  "Dónde trabajar,   "Conocer         "Ya es hora de                        │
│   comer, hacer      nómadas,         moverse, ¿a dónde?"                  │
│   mis hobbies"      eventos"                                                │
│       │                │                   │                               │
│       ▼                ▼                   ▼                               │
│   [v4 cont.]     [NomadAI v5]     [NomadAI aprende                       │
│                                    de tu historial]                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Roadmap de producto: de app a plataforma a ecosistema

### FASE 1 — Fundamentos (hoy → 6 meses) 
*"Ser el mejor recomendador del mundo"*

#### 4.1.1 Datos verificados reales — el cambio más crítico

El problema con el RAG actual no es técnico, es de datos. Hay que construir una base de conocimiento real, verificada y actualizada.

**Knowledge Base 2.0 — estructura propuesta:**

```json
{
  "city": "Medellín",
  "country": "Colombia",
  "last_updated": "2026-05",
  "data_sources": ["nomadlist", "numbeo", "speedtest_global", "cancilleria.gov.co"],
  "internet": {
    "median_mbps": 67,
    "source": "speedtest_global_index_2026",
    "coworking_count": 48,
    "top_coworkings": ["Selina El Poblado", "Atomhouse", "La Manzana"]
  },
  "cost_of_living": {
    "monthly_usd": {
      "backpacker": 800,
      "comfortable": 1400,
      "luxury": 2800
    },
    "breakdown": {
      "rent_1br_center": 600,
      "meal_local_restaurant": 5,
      "coffee_specialty": 3,
      "coworking_monthly": 180
    },
    "source": "numbeo_2026_q1"
  },
  "nomad_community": {
    "active_members_nomadlist": 8500,
    "facebook_groups": ["Nómadas Digitales Medellín", "Expats Medellín"],
    "monthly_meetups": 12,
    "english_speakers_pct": 45
  },
  "visa": {
    "by_nationality": {
      "argentina": { ... },
      "usa": { ... },
      "uk": { ... }
    }
  },
  "hobbies": {
    "poker": {
      "venues": ["Casino Crown", "Allegre Casino", "Gran Casino Medellín"],
      "tournaments": "No hay torneos internacionales regulares. Juego cash disponible.",
      "source": "pokeratlas.com + verification_2026"
    },
    "surf": {
      "note": "Medellín no tiene surf. Playa más cercana: Cartagena (600km) o Urabá (300km).",
      "source": "verified"
    },
    "football": {
      "local_leagues": ["Liga Expats Medellín", "Beer League Medellín"],
      "professional": ["Atlético Nacional", "Independiente Medellín"],
      "source": "facebook_groups_verified"
    }
  }
}
```

**Fuentes de datos a integrar por prioridad:**

| Dato | Fuente | Actualización | Costo |
|------|--------|--------------|-------|
| Velocidad internet | Speedtest Global Index API | Mensual | $0 |
| Costo de vida | Numbeo API | Trimestral | $99/mes |
| Visas | Cancillerías oficiales (scraping estructurado) | Semanal | $0 |
| Nómadas activos | Nomad List unofficial API | Diaria | $0 |
| Coworkings | Coworker.com API | Semanal | $0 |
| Alquileres | Airbnb API + Booking | Diaria | % comisión |
| Poker venues | PokerAtlas.com scraping | Mensual | $0 |
| Surf spots | Surfline API | Estacional | Freemium |
| Clima real | Open-Meteo (ya implementado) + historical | Diaria | $0 |

**Arquitectura de datos propuesta:**

```
Schedulers (EventBridge) → Data fetchers (Lambdas) → Raw S3
                                    ↓
                           Gemini validation layer
                           (verifica, normaliza, detecta anomalías)
                                    ↓
                           Qdrant (vectores para búsqueda semántica)
                           PostgreSQL (datos estructurados)
                                    ↓
                           Knowledge Graph (relaciones entre destinos, hobbies, comunidades)
```

#### 4.1.2 Expandir cobertura de nacionalidades

Actualmente: **solo argentina**.
Próximo paso: las 20 nacionalidades nómadas más activas.

```python
# En config.py — ranking de nacionalidades nómadas activas (2025)
TOP_NOMAD_NATIONALITIES = [
    "american", "british", "canadian", "german", "australian",
    "french", "dutch", "brazilian", "polish", "spanish",
    "ukrainian", "romanian", "indian", "mexican", "portuguese",
    "argentinian", "colombian", "south_african", "singaporean", "japanese"
]
```

Cada nacionalidad requiere:
- Datos de visa por destino × nacionalidad (400 combinaciones para 20×20 destinos)
- Regímenes fiscales (qué impuestos paga si trabaja remotamente)
- Acceso a servicios (bancos, seguros) desde esa nacionalidad

#### 4.1.3 Motor de matching real

El `match_score` actual es generado por el LLM sin calibración. Propuesta de motor propio:

```python
def calculate_match_score(profile: UserProfile, destination: CityData) -> MatchResult:
    scores = {}
    
    # 1. Afinidad de presupuesto (25% del score)
    budget_ratio = destination.cost_comfortable / profile.budget_usd_monthly
    scores["budget"] = min(100, (1 / budget_ratio) * 100)
    
    # 2. Compatibilidad de timezone (20%)
    tz_diff = abs(profile.work_timezone_offset - destination.utc_offset)
    scores["timezone"] = max(0, 100 - (tz_diff * 15))
    
    # 3. Match de hobbies (25%)
    hobby_coverage = sum(
        1 for h in profile.hobbies 
        if h in destination.available_activities
    ) / len(profile.hobbies) if profile.hobbies else 0
    scores["hobbies"] = hobby_coverage * 100
    
    # 4. Clima preferido (15%)
    scores["climate"] = _climate_match(profile.preferred_climate, destination.climate_type)
    
    # 5. Comunidad nómada (15%)
    scores["community"] = min(100, destination.nomad_community_size / 100)
    
    # Score final ponderado
    weights = {"budget": 0.25, "timezone": 0.20, "hobbies": 0.25, "climate": 0.15, "community": 0.15}
    final_score = sum(scores[k] * weights[k] for k in scores)
    
    return MatchResult(
        score=round(final_score),
        breakdown=scores,
        explanation=generate_explanation(scores, profile, destination)
    )
```

Esto permite:
- Explicar el score de forma transparente ("tu presupuesto cubre el 85% de los gastos cómodos")
- Hacer comparaciones objetivas entre destinos
- Aprender de feedback del usuario (si rechaza un destino, ajustar pesos futuros)

---

### FASE 2 — Ecosistema de servicios (6-18 meses)
*"De la recomendación a la acción"*

#### 4.2.1 Booking integrado con afiliados inteligentes

**Modelo actual**: links genéricos a Airbnb/Booking.  
**Modelo propuesto**: búsqueda personalizada con contexto del perfil.

```python
class BookingSearch:
    def get_accommodations(
        self, 
        city: str, 
        arrival: date,
        departure: date,
        profile: UserProfile
    ) -> list[Accommodation]:
        """
        No muestra todos los alojamientos — muestra los que encajan con el perfil.
        Si el usuario tiene hobbies de surf → prioriza cerca de la playa
        Si el usuario trabaja 9am-6pm → prioriza internet > 50Mbps
        Si el usuario tiene presupuesto de $1500 → filtra por ese rango
        """
```

**Revenue de afiliados proyectado:**
- Booking.com: 4-6% de comisión sobre estadía mensual promedio ($800) = $40/reserva
- SafetyWing: 10% de $45/mes = $4.50/mes por usuario
- Airalo: 10% de $20/SIM = $2
- Wise: $15 fijo por cuenta abierta

Con 1% de conversión sobre 100K usuarios: **$40K/mes solo en afiliados**.

#### 4.2.2 Alertas inteligentes — el "Google Alerts para nómadas"

```
📧 "Tu visa para Colombia vence en 30 días"
📧 "Los precios en Lisboa aumentaron 12% este mes"
📧 "Hay 45 nómadas de tu industria en Bangkok este mes"
📧 "El coworking que te recomendamos cerró — aquí hay 3 alternativas"
📧 "Nueva visa de nómada digital en Ecuador — aplica para tu perfil"
```

Implementación:
```python
class AlertEngine:
    async def check_alerts(self, user: User) -> list[Alert]:
        alerts = []
        
        # Visa expiry
        if user.current_destination and user.arrival_date:
            days_remaining = self._visa_days_remaining(user)
            if days_remaining <= 30:
                alerts.append(VisaExpiryAlert(days=days_remaining))
        
        # Price changes (comparando con knowledge base histórico)
        if cost_change := self._detect_cost_change(user.current_destination):
            if abs(cost_change) > 10:  # +/- 10%
                alerts.append(CostChangeAlert(change=cost_change))
        
        # New visa programs
        for country in self._get_watchlist(user):
            if new_visa := self._check_new_visa_program(country, user.nationality):
                alerts.append(NewVisaAlert(country=country, visa=new_visa))
        
        return alerts
```

#### 4.2.3 Comparador de destinos

La feature más pedida en Nomad List y que ninguna herramienta hace bien con IA:

```
"Comparame Medellín vs Lisboa vs Bangkok para enero de 2027, 
con presupuesto de $2000, trabajo con clientes en EST, y surf como hobby"
```

El sistema responde con una tabla comparativa + análisis narrativo de la IA.

```python
# Pipeline de comparación
async def compare_destinations(
    cities: list[str],
    profile: UserProfile,
    month: str
) -> ComparisonResult:
    
    # Fetch datos verificados para cada ciudad
    city_data = await asyncio.gather(*[
        get_city_data(city) for city in cities
    ])
    
    # Calcular scores para cada dimensión
    comparison = ComparisonMatrix(
        dimensions=["cost", "climate", "visa", "internet", "community", "hobbies"],
        cities=cities,
        profile=profile,
        data=city_data
    )
    
    # IA genera análisis narrativo
    narrative = await generate_comparison_narrative(comparison, profile)
    
    return ComparisonResult(matrix=comparison, narrative=narrative)
```

---

### FASE 3 — Comunidad y red social (12-24 meses)
*"El LinkedIn de los nómadas"*

Esta es la fase que convierte la plataforma en un network effect — cada usuario nuevo hace más valiosa la plataforma para todos los demás.

#### 4.3.1 Perfiles de nómadas

```
┌────────────────────────────────────────────┐
│  @alejandro_m · Nómada desde 2023          │
│  ──────────────────────────────────────── │
│  🏳️ Argentina → actualmente en Medellín   │
│  💻 Desarrollador backend · UTC-3          │
│  💰 Budget: $2,500/mes                    │
│  🏄 Surf · ♟️ Poker · ☕ Specialty coffee  │
│  ──────────────────────────────────────── │
│  Destinos visitados: 12                    │
│  Destinos favoritos: Lisboa, Medellín      │
│  Reviews escritas: 8                       │
│  Conexiones: 234                           │
└────────────────────────────────────────────┘
```

#### 4.3.2 Reviews verificadas (el mayor diferenciador)

El problema de Nomad List: las reviews son anónimas y poco confiables.  
El diferenciador de NomadAI: reviews **vinculadas a estadías verificadas**.

```python
class Review:
    user_id: str
    city: str
    arrival_date: date        # verificada por el usuario al hacer check-in
    departure_date: date
    verified: bool            # ¿el usuario conectó desde una IP de esa ciudad?
    
    # Ratings específicos al perfil del nómada
    internet_speed_real: int  # Mbps que midió el usuario (speedtest integrado)
    coworking_quality: int    # 1-5
    nomad_friendliness: int   # 1-5
    value_for_money: int      # 1-5
    
    # Review narrativa
    summary: str
    best_for: list[str]       # ["surfers", "budget_travelers", "families"]
    avoid_if: list[str]       # ["light_sleepers", "need_AC"]
    hidden_gems: str
    
    # Metadata para el RAG
    verified_hobbies: dict    # {"poker": "Casino Lisboa, 3 mesas, jueves noches"}
    real_costs: dict          # {"rent_1br": 900, "coffee": 3.5}
```

Esto crea un **flywheel**: más usuarios → más reviews → mejores recomendaciones → más usuarios.

#### 4.3.3 Matching entre nómadas

El "Tinder para cofounder/compañero de co-living/surf buddy":

```
"Alejo está en Medellín en enero. Tiene perfil de: surf, poker, startup founder.
Otros nómadas en Medellín ese mes: 847. 
Con perfil compatible: 23. 
Interés mutuo confirmado: 5."
```

La IA no solo recomienda destinos — recomienda con quién ir.

#### 4.3.4 Grupos locales y eventos

```
📍 NomadAI Community — Medellín · Enero 2027
├── 📅 Poker Night · Casino Crown · 15 ene
├── 🏄 Surf trip a Cartagena · 20-22 ene (8 interesados)
├── ☕ Specialty coffee tour · El Poblado · 18 ene
├── 💻 Remote work check-in · Selina · martes semanales
└── 🚀 Startup founders dinner · 25 ene (cupos: 12/15)
```

La IA agenda eventos basándose en los hobbies de los nómadas presentes en cada ciudad.

---

### FASE 4 — Servicios financieros y legales (18-36 meses)
*"La infraestructura legal y financiera del nómada"*

Esta fase es donde está el dinero real. Los nómadas tienen problemas serios con:
- ¿En qué país pago impuestos?
- ¿Cómo facturo a clientes internacionales?
- ¿Qué cuenta bancaria uso?
- ¿Cómo tengo seguro médico en todos lados?

#### 4.4.1 Optimizador fiscal por perfil

```
Input: 
  - Nacionalidad: argentina
  - Ingresos: $8,000/mes
  - Clientes en: USA, UK, Spain
  - Tiempo en cada país: Colombia 4 meses, Portugal 4 meses, Georgia 4 meses

Output:
  - Georgia: cero impuestos (régimen Virtuous Taxpayer para extranjeros)
  - Portugal NHR: 20% flat rate sobre ingresos
  - Colombia: 0% si estadía < 183 días
  
  Estrategia recomendada: Georgia como residencia fiscal base.
  Ahorro estimado vs pagar en Argentina: $28,000/año.
```

Esto es el servicio de mayor valor percibido para nómadas con ingresos altos.  
Modelo de negocio: freemium (análisis básico gratis, análisis profundo $99/mes).

#### 4.4.2 Cuenta bancaria global integrada

Partners potenciales:
- **Wise Business** — cuentas en múltiples monedas, API abierta
- **Revolut Business** — tarjeta, IBAN, multi-currency
- **Mercury** (solo US citizens por ahora)

La propuesta: NomadAI recomienda la cuenta bancaria óptima según:
- Nacionalidad del usuario
- Países donde opera
- Monedas que necesita
- Si necesita empresa o es freelance

Revenue: referral fees de $30-150 por cuenta abierta.

#### 4.4.3 Seguro médico inteligente

Hoy el usuario hace esto manualmente (SafetyWing, World Nomads, etc.).  
La propuesta: NomadAI calcula el mejor seguro según:
- Destinos planificados
- Duración en cada país
- Actividades de riesgo (surf, ski, moto)
- Cobertura de preexistencias

Revenue: 10% de comisión sobre la prima (SafetyWing paga referrals).

---

### FASE 5 — Empleos y carrera (24-48 meses)
*"Remote.com killer"*

El mercado de trabajo remoto ($250B) es la mayor oportunidad adyacente.

#### 4.5.1 Job board con contexto nómada

No es otro job board. La diferencia:
- Las ofertas muestran si el salario cubre bien los destinos recomendados
- "Este trabajo paga $5,000/mes. Con tu perfil, eso te da **comfortable** en 23 países y **luxury** en 8"
- Filtros por visa (¿el empleador patrocina visa?), timezone, async/sync

#### 4.5.2 Matching empresa-nómada

Las empresas buscan empleados que sean buenos nómadas: disciplinados, con buen internet, en timezone compatible, con visa válida en su jurisdicción.

```python
class NomadEmployerMatch:
    def find_compatible_candidates(
        self,
        job: JobPosting,
        min_match_score: int = 70
    ) -> list[NomadProfile]:
        """
        Filtra candidatos que:
        - Tienen internet estable (verificado por reviews)
        - Están en timezone compatible (±3h del equipo)
        - Tienen visa válida o plan claro de obtenerla
        - Tienen track record de trabajo remoto (historial de destinos)
        """
```

---

### FASE 6 — Plataforma y marketplace (36-60 meses)
*"El ecosistema"*

En esta fase NomadAI deja de ser una app y se convierte en un **sistema operativo** sobre el que otros construyen:

#### 4.6.1 API pública para terceros

```
GET /api/v1/destination-match
POST /api/v1/visa-check
GET /api/v1/cost-of-living/{city}
GET /api/v1/nomad-community/{city}

Precios:
  Starter: $99/mes — 1,000 requests
  Growth:  $499/mes — 10,000 requests
  Enterprise: $2,500/mes — ilimitado + SLA
```

Potenciales clientes de API:
- Agencias de relocación corporativa
- Plataformas de trabajo remoto (Remote.com, Deel)
- Apps de finanzas para expatriados
- Corredores de seguros globales
- Proptech en destinos nómadas

#### 4.6.2 Marketplace de servicios locales

Una vez que la comunidad está activa en cada ciudad:

```
Medellín — Servicios para nómadas

🏠 Co-livings: 12 espacios | desde $800/mes
💻 Coworkings: 48 espacios | desde $100/mes  
📚 Clases de español: 23 profesores | $15/hora
🏄 Surf coaching: no disponible (ciudad interior)
🧘 Yoga: 156 clases/semana | $5-15/clase
📸 Fotografía: 8 fotógrafos para sessions
🏋️ Gyms: 34 opciones | $20-80/mes
🎰 Poker: 3 casinos con mesas | desde $10 buy-in
```

Modelo: 10-20% de comisión sobre cada transacción. Los proveedores locales pagan para aparecer.

#### 4.6.3 Nomad Pass — la tarjeta física

Una tarjeta de beneficios para nómadas verificados:
- Descuentos en coworkings de la red
- Acceso prioritario en co-livings partner
- Lounge access en aeropuertos seleccionados
- Descuentos en SafetyWing, Airalo, Wise

Modelo: $29.99/mes (incluyendo algunos beneficios de suscripción).

---

## 5. Análisis técnico: lo que hay que construir para soportar la visión

### 5.1 El modelo de datos necesario

El `UserProfile` actual es muy limitado:
```python
class UserProfile(BaseModel):
    hobbies: list[str]
    budget_usd_monthly: int | None
    work_timezone: str | None
    nationality: str | None
    goals: list[str]
    preferred_climate: str | None
```

El perfil completo que necesita el sistema operativo del nómada:

```python
class NomadProfile(BaseModel):
    # Identidad
    user_id: str
    display_name: str
    nationality: str
    second_passport: str | None
    languages: list[str]
    
    # Trabajo
    job_title: str
    industry: str
    work_timezone: str
    work_timezone_flexibility: int  # horas de flexibility
    client_timezones: list[str]
    employment_type: Literal["employed", "freelance", "founder", "investor"]
    annual_income_usd: int
    employer_remote_policy: Literal["fully_remote", "hybrid", "async_first"]
    
    # Finanzas
    budget_usd_monthly: int
    budget_breakdown: dict  # housing, food, coworking, leisure
    tax_residency: str | None
    banking_providers: list[str]
    
    # Estilo de vida
    hobbies: list[str]
    preferred_climate: str
    preferred_accommodation: Literal["hotel", "airbnb", "coliving", "hostel", "apartment"]
    preferred_pace: Literal["slowmad", "explorer", "base"]  # 3+ meses / 1-3m / <1m
    dietary_restrictions: list[str]
    social_preferences: Literal["solo", "social", "community"]
    
    # Historial de viajes
    destinations_visited: list[DestinationVisit]
    current_destination: str | None
    current_arrival_date: date | None
    next_planned_destination: str | None
    
    # Preferencias verificadas (desde reviews)
    verified_internet_priority: bool
    verified_coworking_user: bool
    verified_community_seeker: bool
    
    # Scoring propio del sistema
    nomad_experience_score: int  # 0-100, basado en historial
    reliability_score: int       # basado en reviews escritas
    community_score: int         # interacciones con otros nómadas
```

Este perfil permite recomendaciones de una profundidad que ninguna plataforma puede ofrecer hoy.

### 5.2 Arquitectura de datos de ciudad

Cada ciudad necesita una entidad rica y actualizable:

```python
class CityData(BaseModel):
    city: str
    country: str
    region: str
    timezone: str
    utc_offset: float
    
    # Datos actualizados regularmente
    cost_of_living: CostBreakdown          # Numbeo API
    internet: InternetData                  # Speedtest + coworker.com
    climate: ClimateData                   # Open-Meteo histórico
    nomad_community: CommunityData         # Nomad List + reviews propias
    
    # Datos por hobby (el corazón del diferenciador)
    hobby_data: dict[str, HobbyData]       # verified por PokerAtlas, Surfline, etc.
    
    # Datos de movilidad
    airport_info: AirportData              # Skyscanner, distancia al centro
    connectivity: ConnectivityData         # vuelos directos principales
    
    # Visa por nacionalidad
    visa_requirements: dict[str, VisaInfo] # 20 nacionalidades × requisitos
    
    # Reviews de la comunidad
    recent_reviews: list[VerifiedReview]
    nomad_rating: float                    # promedio reviews verificadas
    
    # Metadata de calidad del dato
    last_updated: datetime
    data_confidence: float                 # 0-1 según fuentes disponibles
    human_verified: bool
```

### 5.3 El Knowledge Graph — la ventaja competitiva técnica real

Una base de datos vectorial (Qdrant actual) no es suficiente para la visión completa. Se necesita un **Knowledge Graph** que entienda relaciones:

```
Ciudad(Lisboa) → TIENE → Hobby(Surf)
                        → ESTÁ_EN → Spot("Ericeira", distancia: 40km, nivel: avanzado)
                        → TIENE_EVENTO → Evento("Rip Curl Pro", mes: octubre)

Nómada(User_123) → VISITÓ → Ciudad(Lisboa) → en → Periodo(2025-03 a 2025-06)
                 → TIENE_HOBBY → Surf
                 → ESCRIBIÓ → Review(Lisboa, rating: 4.5)
                 
Ciudad(Lisboa) → ES_SIMILAR_A → Ciudad(Porto) [según: clima, costo, visa]
               → ES_ALTERNATIVA_DE → Ciudad(Atenas) [según: nómadas que fueron a Lisboa]
               → PRÓXIMA_A → Ciudad(Madrid) [vuelo directo, 2h]
```

Este grafo permite:
- "¿Qué destinos visitan los nómadas después de Lisboa?" (collaborative filtering)
- "¿Qué ciudades tienen surf Y poker Y budget < $1500?" (graph queries)
- "¿Qué tan similar es Tbilisi a Medellín según nómadas reales?" (semantic similarity)

**Stack recomendado**: Neo4j (open source) + Qdrant (semántico) + PostgreSQL (transaccional).

### 5.4 El pipeline de IA de nueva generación

El pipeline actual (LangGraph) es bueno para el MVP. Para la visión completa:

```
INPUT: perfil usuario + contexto temporal

CAPA 1 — Filtrado determinístico
  ├── Visa eligibility filter
  ├── Budget constraint filter
  ├── Timezone filter (±6h de work_timezone)
  └── Climate preference filter
  → Reduce 1,200 ciudades → ~150 candidatas

CAPA 2 — Scoring vectorial
  ├── Hobby matching (Qdrant similarity)
  ├── Community matching (nomad profiles similares)
  └── Historical success (qué ciudades les gustaron a nómadas similares)
  → Reduce 150 → top 15

CAPA 3 — Scoring ML propio
  ├── Match score model (trained on user feedback)
  ├── Satisfaction prediction (basado en historial de reviews)
  └── Cost accuracy model (real vs predicted)
  → Reordena y puntúa las 15

CAPA 4 — Narrativa con LLM
  ├── Genera "por qué tú, por qué ahora" con datos verificados
  ├── Adapta el tono al perfil (aventurero, conservador, familiar)
  └── Idioma del usuario (ES/EN/PT/DE/FR)
  → Output: JSON estructurado + narrativa personalizada

CAPA 5 — Post-procesamiento
  ├── Afiliados contextuales (Booking, SafetyWing, Airalo)
  ├── Alertas relevantes (visa vence, precio cambió)
  └── Conexiones sociales (nómadas conocidos en ese destino)
```

### 5.5 Problemas técnicos críticos a resolver antes de escalar

#### 5.5.1 El follup_node no tiene acceso al historial completo
**Archivo:** `app/nodes/followup_node.py:49-55`

```python
last_user_msg = next(
    (m for m in reversed(state.messages) if isinstance(m, HumanMessage)),
    HumanMessage(content=""),
)
```

Solo usa el último mensaje. Con 20 mensajes de conversación, el contexto de los primeros mensajes se pierde. Para la fase de comunidad y servicios esto es crítico.

**Fix:** usar ventana deslizante de contexto + resumen automático:
```python
def build_conversation_context(messages: list, max_messages: int = 10) -> str:
    recent = [m for m in messages if isinstance(m, HumanMessage)][-max_messages:]
    if len(messages) > max_messages:
        summary = generate_conversation_summary(messages[:-max_messages])
        return f"[Resumen previo: {summary}]\n\n[Conversación reciente]\n{format_messages(recent)}"
    return format_messages(recent)
```

#### 5.5.2 El `destination_node` analiza el mundo desde el conocimiento del LLM
**El nodo más limitante del pipeline actual.** Cuando recomienda Medellín, no sabe:
- Cuántos nómadas hay ahora mismo ahí (puede ser temporada baja)
- Si hubo un evento de seguridad reciente
- Si una nueva ley de visa cambió las condiciones

**Solución a 6 meses**: conectar `destination_node` a la base de datos de ciudades actualizada diariamente. El LLM deja de tomar decisiones basadas en memoria de entrenamiento y pasa a ser un motor de razonamiento sobre datos reales.

```python
def destination_node(state: NomadState) -> dict:
    # NUEVO: obtener candidatas de la DB real
    candidates = await get_candidate_cities(
        budget=state.user_profile.budget_usd_monthly,
        timezone=state.user_profile.work_timezone,
        climate=state.user_profile.preferred_climate,
        min_internet_mbps=25
    )
    
    # Calcular match scores con datos reales
    scored = [
        (city, calculate_match_score(state.user_profile, city))
        for city in candidates
    ]
    
    # LLM solo genera la narrativa, no elige las ciudades
    top3 = sorted(scored, key=lambda x: x[1].score, reverse=True)[:3]
    narratives = await generate_narratives(top3, state.user_profile, state.language)
    
    return {"destinations": build_destinations(top3, narratives)}
```

#### 5.5.3 La velocidad del pipeline limita el producto
Actualmente: 45-90 segundos para generar un reporte completo.
Para la fase de comunidad y alertas, necesitamos respuestas en <5 segundos.

**Estrategia**: tiering de velocidad

```
⚡ Instant (< 1s): 
   - Respuestas de followup sobre reportes ya generados
   - Alertas pre-calculadas
   - Búsquedas en la base de datos de ciudades

🔄 Fast (< 10s):
   - Comparación entre destinos (datos de DB + LLM breve)
   - Respuestas a preguntas de comunidad

⏳ Deep (30-90s):
   - Reporte completo inicial
   - Análisis fiscal personalizado
   - Evaluación de visa compleja
```

---

## 6. El modelo de negocio a escala

### 6.1 Freemium con múltiples capas de valor

```
PLAN FREE
├── 1 búsqueda de destino/mes
├── Acceso al chat de preguntas (5 preguntas/mes)
├── Vista del resultado (sin el detalle completo)
└── Perfil básico en la comunidad

PLAN NOMAD — $19/mes
├── Búsquedas ilimitadas
├── Chat ilimitado
├── Alertas de visa y precio
├── Comparador de destinos
├── Acceso completo a comunidad
└── Reviews verificadas

PLAN NOMAD PRO — $49/mes
├── Todo lo anterior
├── Análisis fiscal básico
├── Recomendaciones de cuenta bancaria
├── Acceso anticipado a nuevas features
└── Soporte prioritario

PLAN ENTERPRISE (B2B) — desde $299/mes
├── API access
├── White-label para agencias
├── Onboarding de equipos remotos
├── Dashboard de compliance para HR
└── Account manager dedicado
```

### 6.2 Revenue streams en orden de implementación

| # | Fuente | Timeline | Revenue potencial (100K users) |
|---|--------|----------|-------------------------------|
| 1 | Suscripción freemium | Hoy | $200K/mes |
| 2 | Afiliados (Booking, SafetyWing, Airalo, Wise) | 3 meses | $150K/mes |
| 3 | API B2B | 12 meses | $300K/mes |
| 4 | Marketplace de servicios locales | 18 meses | $100K/mes |
| 5 | Servicios financieros (referrals bancarios) | 18 meses | $80K/mes |
| 6 | Nomad Pass (tarjeta física) | 24 meses | $50K/mes |
| 7 | Job board premium | 30 meses | $200K/mes |
| **Total proyectado** | | **30 meses** | **$1.08M/mes** |

### 6.3 La economía unitaria objetivo

```
CAC (Costo de adquisición):
  Orgánico (SEO, community): $0
  Pagado (Google, Meta):     $25-40 promedio

LTV (Lifetime Value):
  Plan Nomad ($19/mes):
    Churn promedio sector: 5%/mes
    LTV = $19 / 0.05 = $380

Ratio LTV/CAC = 380/40 = 9.5x  ← excelente (>3x es viable)

Payback period = 40 / 19 = 2.1 meses ← rápido
```

---

## 7. Estrategia de crecimiento — cómo llegar a millones

### 7.1 El flywheel principal

```
Más usuarios nómadas
        ↓
Más reviews verificadas
        ↓
Mejor calidad de datos
        ↓
Mejores recomendaciones
        ↓
Más usuarios nómadas ←────────────────
        ↓
Más comunidad activa en cada ciudad
        ↓
Más eventos, conexiones, servicios
        ↓
Mayor retention y NPS
        ↓
Más referrals orgánicos
```

### 7.2 Estrategia de distribución por canal

**Canal 1 — SEO / Content (mayor potencial a largo plazo)**
Cada ciudad + cada combinación de perfil es una landing page:
- "Best destinations for poker-playing nomads on $2,000/month"
- "Portugal digital nomad visa guide for Argentinians 2026"
- "Medellín vs Lisbon for startup founders"

Con 1,200 ciudades × 50 hobby combinations × 20 nationalities = **1.2 millones** de páginas posibles de alto intent.

**Canal 2 — Comunidad de nómadas (CAC $0)**
- NomadAI como herramienta gratuita que los nómadas comparten
- Presencia en /r/digitalnomad (1.8M members), Nomad List forums, Facebook groups
- Influencers de nomadismo digital (YouTube: Hey Nadine, Abroad in Japan, etc.)

**Canal 3 — Employers remotos (B2B canal)**
Empresas como Shopify, GitLab, Automattic (100% remotas) necesitan herramientas para sus empleados nómadas. Un acuerdo con 10 empresas puede traer 5,000 usuarios directamente.

**Canal 4 — Comunidades de emigración y expatriados**
Argentina y Colombia son mercados naturales de lanzamiento. Comunidades de "cómo salir de Argentina", "visa para España", "emigrar a Portugal" tienen millones de miembros con alta intención.

### 7.3 Estrategia geográfica

**Año 1 (Early adopters)**: LATAM español (Argentina, Colombia, México)
- El pain de visa es el más fuerte (muchos tienen menos privilegios)
- Comunidad de startups muy activa
- Price sensitivity alta → el producto gratuito engancha primero

**Año 2 (Escala)**: Europa del Este + Asia del Sudeste
- Ucrania, Polonia, Rumania, India: millones de freelancers remotos
- Bangkok, Bali, Medellín: donde ya están concentrados los nómadas

**Año 3 (Dominancia)**: Mercado anglófono
- USA, UK, Australia, Canada: mayor poder adquisitivo
- Conversion a planes pagos mucho mayor
- Partnerships con employers remotos del Fortune 500

---

## 8. Riesgos y cómo mitigarlos

### 8.1 Riesgos del producto

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| LLM genera información incorrecta | Alta | Alto | Base de datos verificada, disclaimers, reviews humanas |
| Cambios en APIs de visa | Media | Alto | Monitoreo automático, actualización semanal |
| Pérdida de confianza por hallucination | Media | Muy alto | Sistema de reportes de errores, corrección en 24h |
| Nomad List copia la idea | Alta | Medio | Velocidad de ejecución, community como moat |
| Google/Meta construyen algo similar | Baja | Alto | Nicho específico, datos propios, community |

### 8.2 Riesgos técnicos

| Riesgo | Mitigación |
|--------|-----------|
| Costos de Gemini escalan sin control | Caché agresivo, modelo más barato para free tier, hard limits |
| DynamoDB se vuelve cuello de botella | Migrar a Aurora + Redis según volumen |
| Lambda cold starts afectan UX | Provisioned concurrency, migrar a ECS Fargate |
| Datos de KB se desactualizan | Refresh automático semanal + alertas de anomalías |

### 8.3 Riesgos de negocio

| Riesgo | Mitigación |
|--------|-----------|
| Países cierran visas de nómada | Diversificación de destinos, no depender de un solo país |
| Recesión reduce el nomadismo | El nomadismo crece en recesiones (reducción de costos de vida) |
| Competencia con más capital | Datos propios de comunidad como moat defensible |

---

## 9. Estado actual vs visión — gap analysis

| Dimensión | Estado actual (v2) | Visión completa | Gap |
|-----------|-------------------|-----------------|-----|
| Destinos cubiertos | 21 + LLM | 1,200+ verificados | 🔴 Grande |
| Nacionalidades | Solo argentina | 20+ | 🔴 Grande |
| Datos de hobbies | LLM (sin verificar) | Fuentes verificadas por hobby | 🔴 Grande |
| Match score | Generado por LLM | Motor propio + ML | 🟡 Medio |
| Comunidad | No existe | Red social completa | 🔴 Grande |
| Reviews | No existen | Verificadas por estadía | 🔴 Grande |
| Afiliados | Links básicos | Integración contextual | 🟡 Medio |
| Servicios financieros | No existe | Optimizador fiscal + banking | 🔴 Grande |
| Job board | No existe | Marketplace de empleo remoto | 🔴 Grande |
| API B2B | No existe | API pública + partners | 🔴 Grande |
| Alertas | No existe | Sistema de alertas en tiempo real | 🟡 Medio |
| Multi-idioma | ES + EN | 10+ idiomas | 🟡 Medio |

---

## 10. El primer año — qué construir primero

Teniendo en cuenta recursos limitados, el orden óptimo de construcción:

### Q1 2026 (ahora - 3 meses)
**Objetivo: producto confiable con datos reales**

1. ✅ Fixes de seguridad críticos (CORS, auth en job status)
2. Expandir KB a 50 destinos × 5 nacionalidades principales
3. Integrar Numbeo API para costos reales
4. Integrar Speedtest API para internet real
5. Sistema de alertas básico (cambios de visa)
6. CloudFront + dominio nomadai.fit activo

### Q2 2026 (3-6 meses)
**Objetivo: primera monetización + reviews**

1. Sistema de reviews verificadas (simple, alpha)
2. Afiliados inteligentes (Booking, SafetyWing, Wise)
3. Plan de suscripción ($19/mes Nomad, $49/mes Pro)
4. Comparador de 2-3 destinos
5. Alertas de visa por email

### Q3 2026 (6-9 meses)
**Objetivo: comunidad incipiente**

1. Perfiles públicos de nómadas
2. "Quién está en X ciudad ahora" (básico)
3. Groups/foros por ciudad
4. SEO: 1,000 landing pages por ciudad/perfil

### Q4 2026 (9-12 meses)
**Objetivo: tracción B2B**

1. API pública (beta)
2. Análisis fiscal básico
3. Nomad Pass (beta con 3-5 ciudades)
4. Partnership con 3+ employers remotos

---

*Este documento es un mapa estratégico vivo. Debe actualizarse trimestralmente con aprendizajes del mercado.*

---

**Apéndice: el nombre importa**

"NomadAI" es un buen nombre de etapa temprana pero para la visión de plataforma completa puede sentirse limitado ("AI" puede envejecer). El producto que se describe en este documento se debería llamar algo que evoque **libertad, movimiento, pertenencia**:

- **Boundless** — sin límites
- **Roam** — vagar, explorar
- **Haven** — refugio
- **Nomad OS** — el sistema operativo del nómada (exactamente lo que es)

Cuando el producto llegue a la Fase 3 (comunidad), considerar rebranding hacia un nombre que no tenga "AI" en él, para que dure décadas.
