# Modelo de Negocio y Proyección Financiera — NomadAI

## Definición de escala media

| Nivel | Usuarios registrados | Sesiones/mes |
|---|---|---|
| **Medio-bajo** | 1.000 usuarios | 3.000 sesiones |
| **Medio-alto** | 10.000 usuarios | 30.000 sesiones |

---

## Costos de infraestructura

### Medio-bajo (3.000 sesiones/mes)
| Servicio | Costo |
|---|---|
| Gemini 2.0 Flash | ~$14 |
| Aurora pgvector | ~$15 |
| Lambda + API Gateway | ~$8 |
| DynamoDB (sesiones) | ~$3 |
| CloudFront + S3 | ~$2 |
| Tavily | ~$5 |
| LangSmith (monitoring) | $0 (free tier) |
| **Total** | **~$47/mes** |

### Medio-alto (30.000 sesiones/mes)
| Servicio | Costo |
|---|---|
| Gemini 2.0 Flash | ~$105 |
| Aurora pgvector | ~$40 |
| ECS Fargate | ~$60 |
| DynamoDB | ~$20 |
| CloudFront + S3 | ~$8 |
| Tavily | ~$25 |
| LangSmith Pro | ~$40 |
| **Total** | **~$298/mes** |

---

## Modelos de monetización

### Opción A — Freemium con suscripción (recomendada)

```
Plan Free:    1 reporte/mes + 3 preguntas followup
Plan Pro:     $9.99/mes  → reportes ilimitados + followup ilimitado
Plan Nomad:   $19.99/mes → todo lo anterior + alertas de precio,
                           visa updates, refresh mensual de datos
```

**Proyección medio-bajo (1.000 usuarios, 5% conversión):**
```
50 usuarios Pro   × $9.99  = $499/mes
10 usuarios Nomad × $19.99 = $200/mes
─────────────────────────────────────
Revenue total:               $699/mes
Costos infra:                 $47/mes
─────────────────────────────────────
Ganancia neta:               $652/mes  — margen 93%
```

**Proyección medio-alto (10.000 usuarios, 5% conversión):**
```
400 usuarios Pro  × $9.99  = $3.996/mes
100 usuarios Nomad × $19.99 = $1.999/mes
──────────────────────────────────────────
Revenue total:                $5.995/mes
Costos infra:                   $298/mes
──────────────────────────────────────────
Ganancia neta:                $5.697/mes  — margen 95%
```

---

### Opción B — Afiliados (mayor potencial, ingreso pasivo)

Integrar links de afiliados en el reporte generado para cada destino:

| Programa | Comisión | Ticket promedio |
|---|---|---|
| Booking.com | 4-6% | Alojamiento mensual ~$800 → **$40/reserva** |
| SafetyWing (seguro nómada) | 10% | $45/mes → **$4.50/referral** |
| Airalo (SIM eSIM) | 10% | $20 → **$2/venta** |
| Wise (cuenta internacional) | $15 fijo | Por apertura de cuenta |

Si el 3% de 10.000 usuarios convierte en Booking.com:
```
300 reservas × $40 = $12.000/mes en afiliados
```

Los afiliados no reemplazan la suscripción — se combinan con ella.

---

### Opción C — B2B / API Access (escala exponencial)

Cuando el producto esté maduro, vender acceso API a:
- Agencias de viajes digitales
- Plataformas de trabajo remoto (Remote.com, Deel, Toptal)
- Bancos con tarjetas para viajeros

Precio estimado: $299-999/mes por empresa.
Dos clientes B2B cubren toda la infraestructura mensual.

---

## Punto de quiebre

```
Medio-bajo ($47/mes de infra):
  Con suscripción $9.99:  necesitás 5 usuarios pagos  → muy fácil
  Con afiliados:          necesitás 2 reservas/mes    → muy fácil

Medio-alto ($298/mes de infra):
  Con suscripción $9.99:  necesitás 30 usuarios pagos → 0.3% de 10.000
  Con afiliados:          necesitás 8 reservas/mes    → trivial
```

---

## Estrategias anti-quiebra

### 1. Rate limiting por plan
```python
# El pipeline completo cuesta ~$0.003 de infra por sesión
# Limitar el plan free a 1 pipeline completo/mes
# Followup queries cuestan <$0.0001 → casi gratis, no limitar
MAX_MONTHLY_COST_PER_FREE_USER_USD = 0.05
```

### 2. Caché agresivo de reportes
Guardar reportes en S3 para perfiles similares.
Reducción estimada del 30-40% en llamadas a Gemini.

### 3. Degradación elegante del modelo por plan
```
Plan Free  → Gemini 2.0 Flash  (rápido y barato)
Plan Pro   → Gemini 2.5 Pro    (mejor calidad y profundidad)
```
El costo del LLM solo escala para usuarios que pagan más.

### 4. Hard limit por usuario gratuito
Si un usuario free supera el costo máximo mensual configurado,
bloquear nuevas solicitudes de pipeline completo hasta el próximo ciclo.
Followup sobre reportes existentes sigue disponible (costo mínimo).

---

## Resumen ejecutivo

```
Escenario conservador (500 usuarios, 2% conversión):
  10 usuarios × $9.99  = $100/mes revenue
  Costos infra:           $47/mes
  Ganancia:               $53/mes  ← rentable desde el usuario 5

Escenario realista (5.000 usuarios, 5% conversión):
  250 usuarios × $9.99 = $2.497/mes
  Costos infra:           $180/mes
  Ganancia:             $2.317/mes

Escenario optimista (10.000 usuarios + afiliados):
  $5.995 suscripciones + $12.000 afiliados = $17.995/mes
  Costos infra:   $298/mes
  Ganancia:    $17.697/mes
```

### Por qué el modelo es eficiente
El costo marginal por usuario nuevo es casi cero — el RAG y la infraestructura
son costos mayormente fijos. Cada usuario pago que se agrega es casi pura ganancia.
El margen bruto se mantiene por encima del 90% en todos los escenarios proyectados.

---

## Archivos relacionados
- `docs/rag_architecture.md` — diseño técnico del RAG híbrido
- `docs/cost_estimation.md`  — comparativa de costos con y sin RAG
