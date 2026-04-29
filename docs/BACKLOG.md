# NomadAI — Product Backlog

**Última actualización:** 2026-04-29

Prioridades: 🔴 Alta | 🟡 Media | 🟢 Baja

---

## En progreso

_(nada en este momento — ver Pendiente)_

---

## Pendiente

### Seguridad y confiabilidad

| # | Tarea | Prioridad | Notas |
|---|-------|-----------|-------|
| 2 | Rate limiting por user_id | 🔴 | Evita que un usuario queme el presupuesto de APIs. Implementar con sliding window en DynamoDB o Redis |
| 3 | Validar token de Google en cada request de chat | 🔴 | Hoy el user_id viaja como string sin verificar. Cualquiera puede impersonar a otro usuario |
| 4 | CloudWatch Alarms | 🔴 | Alertas en: tasa de error Lambda > 5%, duración > 120s, cola SQS > 50 mensajes acumulados |
| 5 | Dead Letter Queue (DLQ) para SQS | 🟡 | Mensajes que fallan 3 veces deben ir a una DLQ para análisis, no desaparecer |

### Calidad de datos y RAG

| # | Tarea | Prioridad | Notas |
|---|-------|-----------|-------|
| 6 | Limpiar knowledge_base.json de datos no verificados | 🔴 | Remover todos los documentos de hobbies y networking que no fueron verificados manualmente. Dejar solo visa con fuente oficial |
| 7 | Mejorar obtención de info de hobbies (ver detalle abajo) | 🔴 | Reemplazar datos inventados por fuentes reales |
| 8 | Agregar `source_url` y `last_verified` a cada doc del KB | 🟡 | Trazabilidad y proceso de actualización periódica |
| 9 | Expandir knowledge base a 25+ destinos (solo verificados) | 🟡 | Priorizar destinos anglófonos dado el perfil de usuario actual |

### Calidad de respuestas

| # | Tarea | Prioridad | Notas |
|---|-------|-----------|-------|
| 10 | Detectar más objetivos como filtros excluyentes | 🟡 | Hoy solo detectamos inglés. Agregar: portugués → Brasil/Portugal, bajo costo → excluir destinos caros, etc. |
| 11 | Followup node con contexto de hobbies | 🟡 | Las preguntas de seguimiento sobre actividades no tienen acceso a la info detallada del reporte |
| 12 | Respuesta cuando no hay destinos que cumplan todos los filtros | 🟡 | Hoy el LLM puede ignorar los filtros. Validar que los destinos devueltos sean anglófonos si se pidió inglés |

### Infraestructura

| # | Tarea | Prioridad | Notas |
|---|-------|-----------|-------|
| 13 | Custom domain (Route 53 + ACM) | 🟡 | Reemplazar la URL de Lambda Function URL por un dominio propio |
| 14 | Separar entornos dev/prod | 🟡 | Hoy todo va a producción. Crear stack `nomadai-dev` para testing sin afectar usuarios reales |
| 15 | Caché de resultados por perfil similar | 🟢 | Si dos usuarios tienen perfiles casi idénticos, reusar el reporte (ahorra ~$0.10 en APIs por request) |

### Frontend

| # | Tarea | Prioridad | Notas |
|---|-------|-----------|-------|
| 16 | Textos del spinner más representativos del proceso real | 🟢 | Hoy: "Analizando tu perfil", "Buscando destinos", etc. Mejorar con pasos más específicos |
| 17 | Manejo de error visible para el usuario | 🟢 | Si el job falla, hoy no hay feedback claro. Mostrar mensaje de error amigable |
| 18 | Migración del frontend a React | 🟢 | Reemplazar el `index.html` + vanilla JS por una SPA en React + Vite. Prerequisito: tener más de una vista o estado complejo que justifique el cambio. Hosting: S3 + CloudFront (separado de Lambda) o servido desde el mismo contenedor. Incluye: componentes reutilizables para el chat, el reporte y el perfil de usuario |

---

## Completado ✅

| # | Tarea | Fecha |
|---|-------|-------|
| ✅ | Rate limiting: 30 req/hora por usuario via DynamoDB sliding window, fail-open en errores | 2026-04-29 |
| ✅ | Autenticación real: Google ID token validado en cada request vía FastAPI Depends | 2026-04-29 |
| ✅ | SQS async pipeline (HTTP retorna en 100ms) | 2026-04-28 |
| ✅ | async/await en FastAPI | 2026-04-28 |
| ✅ | Paralelización del enrichment node (asyncio.gather) | 2026-04-28 |
| ✅ | RAG con FAISS bakeado en imagen Docker | 2026-04-29 |
| ✅ | CI/CD con GitHub Actions (deploy automático en push a main) | 2026-04-29 |
| ✅ | Tests: 35 tests cubriendo API, nodos y servicios | 2026-04-29 |
| ✅ | Filtros excluyentes en destination_node (inglés, presupuesto) | 2026-04-29 |
| ✅ | Google OAuth login | 2026-04-28 |
| ✅ | DynamoDB checkpoints + S3 offload para LangGraph | 2026-04-28 |
| ✅ | Reset de perfil de usuario | 2026-04-28 |

---

## Detalle: Tarea 7 — Obtención de info de hobbies

### El problema
El RAG actual tiene datos de hobbies inventados (nombres de canchas, casinos, coworkings) que pueden no existir. Darle al usuario información incorrecta sobre lugares específicos es peor que no dársela.

### Propuesta: fuentes verificables por categoría de hobby

#### Fútbol
- **Google Maps API** — buscar "fútbol 5" o "soccer field" en la ciudad, retorna lugares reales con nombre, dirección y rating
- **Facebook Groups** — grupos de "fútbol para expats en [ciudad]" son la fuente más confiable para ligas informales
- **Meetup.com API** — eventos de fútbol agrupados por ciudad

#### Poker en vivo
- **The Hendon Mob** (thehendonmob.com) — base de datos global de casinos con poker en vivo, completamente verificada
- **Poker Atlas** (pokeratlas.com) — directorio de cardrooms por ciudad con horarios y juegos disponibles

#### Networking / Coworkings
- **Coworker.com API** — directorio global de coworkings con precios reales
- **Nomad List** — comunidades activas por ciudad, verificadas por la propia comunidad de nómadas
- **Meetup.com API** — eventos de tech/startup/networking por ciudad

### Implementación sugerida
En lugar de datos estáticos en el RAG, crear un `hobby_enrichment_tool` que llame a estas APIs en tiempo real para la ciudad recomendada. El resultado se cachea en DynamoDB por ciudad+hobby con TTL de 30 días (los lugares no cambian tan frecuente).

### Costo estimado
- Google Maps API: $0.017 por búsqueda → ~$0.05 por reporte (3 destinos × 1 búsqueda)
- Coworker.com: API gratuita con límite generoso
- Meetup.com: API gratuita con autenticación
- The Hendon Mob / Poker Atlas: scraping o acceso manual al KB (no tienen API pública)
- **Total adicional: ~$0.05/reporte** vs. $0 actual con RAG estático

### Por qué es mejor que el RAG estático
| | RAG estático actual | Fuentes verificadas |
|---|---|---|
| Precisión | Desconocida (datos inventados) | Alta (fuentes oficiales) |
| Actualización | Manual + deploy | Automática (TTL 30d) |
| Costo | $0 | ~$0.05/reporte |
| Mantenimiento | Alto | Bajo |
