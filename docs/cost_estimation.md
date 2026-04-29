# Estimación de Costos — NomadAI

## Costos actuales (sin RAG) — 100 sesiones/día

| Servicio | Uso mensual | Costo |
|---|---|---|
| Gemini 2.0 Flash | ~45M tokens input + 15M output | ~$7 |
| Tavily | 6.000 búsquedas (2/sesión) | ~$5 |
| Open-Meteo | Ilimitado | $0 |
| YouTube API | Dentro del free tier | $0 |
| **Total** | | **~$12/mes** |

---

## Costos adicionales con RAG híbrido

| Componente | Dev (local) | Prod (AWS) |
|---|---|---|
| Vector store | ChromaDB — $0 | Aurora Serverless v2 — $5-15/mes |
| Embeddings | MiniLM local — $0 | Titan Embeddings — ~$0.05/mes |
| Tavily fallback RAG | ~20% de queries sin hit | +$0.50/mes |
| Seed generación | ~$1-2 one-time | Lambda semanal ~$0.10/mes |
| **Total adicional** | **~$1 (one-time)** | **+$6-16/mes** |

**Aumento porcentual en producción: 50%-130%** → de $12 a $18-28/mes

---

## Punto de inflexión: a mayor escala el RAG es más barato

| Sesiones/día | Sin RAG (Tavily live) | Con RAG (Aurora fijo) | Diferencia |
|---|---|---|---|
| 100 | ~$12/mes | ~$20/mes | +67% |
| 500 | ~$45/mes | ~$35/mes | -22% ← RAG gana |
| 1.000 | ~$85/mes | ~$55/mes | -35% |
| 5.000 | ~$380/mes | ~$120/mes | -68% |

A partir de ~400 sesiones/día el RAG es más barato que hacer 9 búsquedas Tavily en vivo por sesión.

---

## Pros y contras del RAG

| | Pros | Contras |
|---|---|---|
| **Calidad** | Elimina alucinaciones sobre hobbies específicos (APT/WSOP en Manila) | Datos del RAG pueden desactualizarse entre refreshes semanales |
| **Velocidad** | Cache hit en <50ms vs Tavily ~1-2s | Primera carga del modelo de embeddings tarda ~3s |
| **Costo** | Más barato a escala (+400 sesiones/día) | Más caro en etapa temprana (+$6-16/mes) |
| **Confianza del usuario** | Info verificada = menos correcciones del usuario | Requiere mantener la base de datos curada |
| **Complejidad** | Fallback automático a Tavily para destinos raros | Agrega Aurora, DynamoDB, EventBridge al stack |
| **AWS fit** | Todo dentro del ecosistema AWS | Un servicio más que mantener |

---

## Veredicto y roadmap financiero

**Etapa actual (0-50 sesiones/día): no implementar RAG.**
El costo extra es mínimo pero la complejidad aumenta. Mejor terminar el producto primero.

**Con primeros usuarios (50-400 sesiones/día): evaluar RAG.**
El salto en calidad justifica +$10-15/mes si se detectan correcciones recurrentes de datos por parte de los usuarios.

**Escala (400+ sesiones/día): implementar RAG obligatoriamente.**
A partir de este punto el RAG reduce costos activamente además de mejorar la calidad.

### Orden recomendado
1. Terminar MVP y conseguir primeros usuarios
2. Implementar RAG cuando aparezcan correcciones recurrentes de datos
3. Migrar de Aurora Serverless a Aurora Provisioned cuando llegues a 400+ sesiones/día sostenidas
