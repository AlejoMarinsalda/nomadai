# NomadAI v2 — Rediseño de Producto

**Fecha:** 2026-05-07  
**Estado:** Planificación  
**Motivación:** Reemplazar el flujo conversacional de recopilación de datos por una experiencia visual estructurada, manteniendo el chat solo para exploración post-resultados.

---

## Problema con el diseño actual (v1)

| Problema | Impacto |
|----------|---------|
| El chat recopila datos del perfil conversacionalmente | Lento, tedioso, depende de que el LLM interprete bien el texto libre |
| La respuesta del AI es markdown en una burbuja de chat | No aprovecha la estructura de los datos; difícil de escanear |
| No hay pantalla de resultados clara | El usuario tiene que leer todo el markdown para entender qué se recomienda |
| El perfil se construye de a poco across mensajes | Datos inconsistentes, campos que se omiten, riesgo de malinterpretación |

---

## Visión v2

```
Onboarding visual  →  Resultados  →  Detalle del destino  →  Chat de exploración
```

El usuario configura su perfil en un formulario visual paso a paso.  
La IA procesa el perfil estructurado y devuelve datos estructurados.  
El frontend renderiza los resultados como UI, no como markdown.  
El chat queda disponible para preguntas específicas sobre los destinos.

---

## Nuevo flujo de usuario

### Paso 1 — Onboarding (nuevo)
Formulario multi-step visual. El usuario selecciona con clicks, no escribe.

**Campos:**
- **Presupuesto mensual** → slider de $800 a $6,000+ USD
- **Clima preferido** → cards seleccionables: Tropical, Mediterranean, Cool, Cualquiera
- **Zona horaria de trabajo** → selector (UTC-8 a UTC+8)
- **Hobbies** → tags seleccionables (surf, poker, hiking, coworking, nightlife, coffee, etc.)
- **Nacionalidad** → dropdown (afecta requisitos de visa)
- **Objetivos** → cards: slow travel, comunidad, bajo costo, calidad de vida, aprender idioma

El perfil se guarda directamente en DynamoDB al completar el onboarding.  
Si el usuario ya tiene perfil guardado, salta directo a Resultados con opción de editar.

---

### Paso 2 — Resultados (nuevo)
Pantalla tipo "Vete a Lisbon." con el match #1 y alternativas.

**Componentes:**
- Headline con el nombre de la ciudad y país
- Match score (número grande, prominente)
- Cards de datos clave: costo/mes, velocidad internet, temperatura promedio, seguridad, comunidad, visa
- Lista "Por qué tú, por qué ahora" (bullets generados por la IA)
- Botones: "Ver guía completa" → Detalle | "Guardar" → biblioteca personal
- Sección inferior: "O explora estas alternativas" con match #2 y #3

---

### Paso 3 — Detalle del destino (nuevo)
Página dedicada por ciudad con datos estructurados renderizados como UI.

**Secciones:**
- Header: nombre de ciudad, país, match score circular, coordenadas
- Cita de la IA: resumen personalizado del destino para ese perfil
- **Costo mensual estimado** → breakdown con barras horizontales (alojamiento, comida, coworking, transporte, ocio)
- **Clima 12 meses** → gráfico de barras por mes con temperatura
- **Tus hobbies aquí** → lista con lugares reales y distancias
- **Comunidad nómada** → stats: miembros activos, co-livings, meetups/mes, % habla inglés
- **Visa** → tipo, duración, requisitos principales
- **Videos YouTube** → thumbnails (ya implementado en v1)

---

### Paso 4 — Chat de exploración (existente, adaptado)
El chat ya no recopila datos. Su único rol es responder preguntas sobre destinos ya recomendados.

**Contexto que recibe:** perfil del usuario + destinos recomendados del paso 2.  
**Ejemplos de uso:** "¿Hay comunidad de surf en Bali?", "¿Cuánto cuesta un apartamento de 1 ambiente en Lisboa?", "Comparame Medellín vs Tbilisi para invierno."

---

## Cambios en el backend

### 1. Nuevo endpoint de onboarding
```
POST /onboarding
Body: { hobbies, goals, budget_usd_monthly, work_timezone, nationality, preferred_climate }
→ Guarda perfil en DynamoDB y dispara el pipeline de búsqueda
→ Retorna job_id para polling (mismo mecanismo SQS que ya existe)
```

### 2. Cambio crítico: output del compiler_node

**Antes (v1):** el compiler_node devuelve markdown como string.

**Después (v2):** el compiler_node devuelve JSON estructurado.

```json
{
  "destinations": [
    {
      "rank": 1,
      "city": "Lisbon",
      "country": "Portugal",
      "match_score": 94,
      "monthly_cost_usd": 2180,
      "cost_breakdown": {
        "housing": 1100,
        "food": 480,
        "coworking": 220,
        "transport": 90,
        "leisure": 290
      },
      "why_you_why_now": [
        "Coste al 1% de tu presupuesto",
        "Comunidad nómada Top 3 en Europa",
        "Surf a 25min, café specialty en cada esquina",
        "Internet fibra (142 Mbps median)"
      ],
      "ai_summary": "Para tu perfil, Lisboa es el equilibrio raro entre foco profundo y vida costera...",
      "climate": {
        "avg_temp_now": 22,
        "best_months": ["mar", "apr", "may", "sep", "oct"],
        "monthly_data": [13, 14, 16, 18, 21, 25, 28, 28, 25, 21, 16, 13]
      },
      "internet_mbps": 142,
      "security": "Excelente",
      "community": "Muy alta",
      "visa": {
        "type": "EU · Schengen",
        "max_stay_days": 90,
        "requirements": ["pasaporte vigente", "seguro de viaje", "fondos suficientes"]
      },
      "hobbies_match": [
        { "hobby": "Surf", "detail": "Costa da Caparica · 25min" },
        { "hobby": "Coffee", "detail": "+200 specialty cafés" },
        { "hobby": "Hiking", "detail": "Sintra · 40min" }
      ],
      "community_stats": {
        "active_members": 12000,
        "colivings": 43,
        "meetups_per_month": 18,
        "english_speakers_pct": 92
      },
      "accommodation_links": [],
      "youtube_links": []
    }
  ]
}
```

### 3. Nuevo endpoint de resultados guardados
```
GET /results/{session_id}
→ Devuelve el JSON estructurado de una búsqueda anterior
```

El historial ya no guarda `report_text` (markdown) sino este JSON.  
El campo `report_text` en DynamoDB se reemplaza por `result_json`.

---

## Cambios en el frontend

### Páginas nuevas
| Página | Ruta | Descripción |
|--------|------|-------------|
| Onboarding | `/onboarding` | Formulario multi-step visual |
| Resultados | `/results/:sessionId` | Match #1 + alternativas |
| Detalle | `/results/:sessionId/:city` | Detalle completo de un destino |

### Páginas modificadas
| Página | Cambio |
|--------|--------|
| `/chat` | Ya no recopila perfil. Recibe contexto de destinos del paso 2 |
| `/history` | Muestra resultados estructurados en vez de markdown |
| `ReportDetail` | Se reemplaza por la página Detalle del destino |

### Nuevo sistema de diseño
El branding cambia completamente:
- **Fondo:** crema (`#F5F0E8`) en vez de zinc oscuro
- **Tipografía:** serif (estilo editorial) para headlines
- **Acento:** naranja (`#C84B1A`) en vez de emerald
- **Cards:** blanco con bordes suaves, sombras ligeras
- **Modo:** light-first (el actual es dark-only)

---

## Cambios en el AI pipeline

### compiler_node
- Recibe los mismos datos estructurados de `destination_node`
- En vez de generar markdown, genera JSON con el schema definido arriba
- Usa `response_format` o prompt estructurado para forzar JSON válido
- La `ai_summary` sigue siendo texto libre generado por el LLM

### profile_node
- Se elimina la lógica de recopilación conversacional de perfil
- Su único rol en el chat (post-onboarding) es interpretar preguntas de seguimiento
- El perfil siempre llega completo desde DynamoDB (llenado en el onboarding)

### followup_node (nuevo nombre para el chat post-resultados)
- Recibe el JSON de destinos como contexto
- Responde preguntas específicas sobre los destinos recomendados
- Puede comparar destinos, profundizar en hobbies, detallar costos

---

## Migración y compatibilidad

### Datos existentes en DynamoDB
Los reportes guardados en v1 tienen `report_text` (markdown). Dos opciones:
1. **Migración lazy:** mostrar los reportes v1 en formato markdown (como hoy) y los v2 en el nuevo formato UI. Detectar por presencia del campo `result_json`.
2. **Re-procesamiento:** correr un script que tome cada `report_text`, lo parsee y genere el `result_json` equivalente.

**Recomendación:** migración lazy. Es más segura y no requiere re-procesar datos históricos.

### Rollout sugerido
| Fase | Qué se implementa |
|------|-------------------|
| **Fase 1** | Onboarding visual + guardar perfil estructurado |
| **Fase 2** | compiler_node devuelve JSON + página de Resultados |
| **Fase 3** | Página de Detalle del destino con todos los datos |
| **Fase 4** | Chat adaptado al contexto post-resultados |
| **Fase 5** | Nuevo branding completo (tipografía, colores, logo) |

Cada fase es deployable de forma independiente sin romper lo que ya funciona.

---

## Estimación de esfuerzo

| Fase | Complejidad | Estimación |
|------|-------------|------------|
| Onboarding visual | Media | 2-3 días |
| JSON output en compiler_node | Media | 1 día |
| Página de Resultados | Alta | 2-3 días |
| Página de Detalle | Alta | 3-4 días |
| Chat adaptado | Baja | 1 día |
| Nuevo branding completo | Alta | 3-4 días |
| **Total** | | **~2-3 semanas** |

---

## Lo que NO cambia

- Infraestructura AWS (Lambda, SQS, DynamoDB, ECR)
- Sistema de autenticación Google OAuth
- Pipeline de LangGraph (nodos, grafo, checkpoints)
- RAG con FAISS
- Sistema de jobs async con polling
- Rate limiting
- CI/CD con GitHub Actions
