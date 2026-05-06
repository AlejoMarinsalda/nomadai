# Knowledge Base — Base de datos vectorial (Qdrant Cloud)

## ¿Qué es y para qué sirve?

NomadAI usa una base de datos vectorial para proveer al modelo de IA información precisa y actualizada sobre destinos para nómadas digitales. Antes de generar una recomendación, el sistema busca en esta base de datos los fragmentos más relevantes para la consulta del usuario (técnica RAG — Retrieval-Augmented Generation). Esto permite que el modelo responda con datos concretos (requisitos de visa, costos, clima) en lugar de depender únicamente de su entrenamiento general.

---

## Infraestructura

| Componente | Valor |
|---|---|
| Proveedor | Qdrant Cloud (free tier) |
| Cluster | `us-east-1-1` (AWS, misma región que Lambda) |
| Colección | `nomadai-knowledge` |
| Dimensiones del vector | 3072 (modelo `gemini-embedding-001`) |
| Métrica de similitud | Cosine |
| Total de documentos indexados | 34 |

---

## ¿Qué es un embedding?

Un embedding es la representación numérica de un texto. El modelo de embeddings lee un fragmento de texto y lo convierte en un vector: una lista de números decimales (en este caso, 3072 números) que captura el **significado semántico** del texto, no su forma literal.

```
"Los ciudadanos argentinos no necesitan visa para Colombia..."
        ↓ gemini-embedding-001
[0.0231, -0.1847, 0.0593, 0.2201, ..., -0.0412]  ← 3072 números
```

La propiedad clave es que textos con significados similares producen vectores cercanos en el espacio de 3072 dimensiones, aunque usen palabras distintas. Por ejemplo:

- "¿Necesito visa para ir a Colombia?" y "requisitos de entrada argentina Colombia" producen vectores similares
- "¿Cuánto cuesta vivir en Bali?" y "presupuesto mensual Indonesia" también son cercanos
- Pero "visa Colombia" y "clima Berlín" serán vectores distantes

Esto permite hacer búsquedas por **significado** en lugar de por palabras exactas.

---

## Pipeline completo: de JSON a vector en Qdrant

### Paso 1 — Lectura del JSON

El archivo `data/knowledge_base.json` contiene 34 objetos. Cada uno tiene esta estructura:

```json
{
  "id": "medellin_visa_arg",
  "destination": "Medellín",
  "country": "Colombia",
  "category": "visa",
  "nationality": "argentina",
  "text": "Los ciudadanos argentinos no necesitan visa para ingresar a Colombia..."
}
```

El campo `text` es el contenido que se indexa. Los demás campos (`id`, `destination`, `country`, `category`, `nationality`) se guardan como **metadata** y permiten filtrar resultados sin hacer búsqueda semántica.

### Paso 2 — Conversión a objetos `Document` de LangChain

El script convierte cada entrada JSON en un objeto `Document` de LangChain:

```python
from langchain_core.documents import Document

documents = [
    Document(
        page_content=doc["text"],      # el texto que se va a embeddear
        metadata={
            "id":          doc.get("id", ""),
            "destination": doc.get("destination", ""),
            "category":    doc.get("category", ""),
            "country":     doc.get("country", ""),
            "nationality": doc.get("nationality", ""),
        },
    )
    for doc in kb
]
```

`Document` es la abstracción de LangChain que separa el contenido textual (lo que se embedea) de la metadata estructurada (lo que se filtra).

### Paso 3 — Inicialización del modelo de embeddings

```python
from langchain_google_genai import GoogleGenerativeAIEmbeddings

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=google_api_key,
)
```

`GoogleGenerativeAIEmbeddings` es el wrapper de LangChain sobre la API de Google AI. Cuando recibe un texto, hace un HTTP POST a `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent` y recibe como respuesta el vector de 3072 dimensiones.

El modelo `gemini-embedding-001` es el modelo de embeddings de Google optimizado para búsqueda semántica. Genera vectores de **3072 dimensiones**, lo que le da mayor capacidad de distinguir matices de significado que modelos más pequeños (768 o 1536 dims).

### Paso 4 — Creación de la colección en Qdrant

Antes de insertar vectores, Qdrant necesita saber la configuración de la colección: cuántas dimensiones tienen los vectores y cómo medir la distancia entre ellos.

```python
from qdrant_client.models import Distance, VectorParams

client.create_collection(
    collection_name="nomadai-knowledge",
    vectors_config=VectorParams(
        size=3072,            # debe coincidir exactamente con el modelo de embeddings
        distance=Distance.COSINE,
    ),
)
```

**Cosine distance** mide el ángulo entre dos vectores, ignorando su magnitud. Es la métrica estándar para embeddings de texto porque lo que importa es la dirección (significado) del vector, no su longitud.

Si el `size` no coincide con la dimensión real del modelo (como ocurrió en la primera corrida donde estaba en 768), Qdrant rechaza los inserts con un error de validación.

### Paso 5 — Generación de embeddings e inserción (upsert)

```python
QdrantVectorStore.from_documents(
    documents=documents,
    embedding=embeddings,
    url=qdrant_url,
    api_key=qdrant_api_key,
    collection_name="nomadai-knowledge",
    force_recreate=False,
)
```

Internamente, `from_documents` hace lo siguiente por cada documento:

1. Extrae el `page_content` del `Document`
2. Lo envía a la API de Google para obtener el vector de 3072 floats
3. Arma un `PointStruct` de Qdrant con el vector + la metadata
4. Hace un `upsert` en la colección (inserta si no existe, actualiza si ya existe)

El **upsert** usa el hash del contenido como ID de punto, lo que hace el proceso idempotente: correr el script dos veces no duplica los datos.

En total se realizaron **34 llamadas a la API de embeddings** de Google (una por documento).

### Resultado en Qdrant

Cada punto almacenado en Qdrant tiene esta forma lógica:

```
Point {
  id: <uuid generado por LangChain>,
  vector: [0.0231, -0.1847, 0.0593, ..., -0.0412],  ← 3072 floats
  payload: {
    page_content: "Los ciudadanos argentinos no necesitan visa...",
    metadata: {
      id: "medellin_visa_arg",
      destination: "Medellín",
      category: "visa",
      country: "Colombia",
      nationality: "argentina"
    }
  }
}
```

---

## Cómo funciona la búsqueda en runtime

Cuando un usuario escribe algo en el chat, el `enrichment_node` del grafo llama a `search_rag()`:

```python
# app/services/rag_store.py
def search_rag(query: str, k: int = 3) -> list[str]:
    vs = _load()
    docs = vs.similarity_search(query, k=k)
    return [doc.page_content for doc in docs]
```

`similarity_search` hace lo siguiente:

1. **Embedea la query**: envía el texto del usuario a `gemini-embedding-001` → obtiene un vector de 3072 dims que representa la pregunta
2. **Busca los k vecinos más cercanos**: Qdrant compara ese vector contra los 34 vectores almacenados usando similitud coseno
3. **Retorna los documentos más similares**: devuelve los `page_content` de los k puntos con mayor similitud

El resultado son fragmentos de texto de la knowledge base que el LLM puede usar como contexto al generar la respuesta. Con `k=3`, se retornan hasta 3 fragmentos.

### Ejemplo concreto

```
Query del usuario: "soy argentino, ¿necesito visa para ir a Bali?"

    ↓ embedding de la query → vector de 3072 dims

Comparación coseno contra los 34 vectores almacenados:

  medellin_visa_arg  →  similitud: 0.72
  bali_visa_arg      →  similitud: 0.94  ← más cercano
  bangkok_visa_arg   →  similitud: 0.81
  bogota_clima       →  similitud: 0.31
  ...

Resultado: se retornan los 3 de mayor similitud
  → bali_visa_arg, bangkok_visa_arg, medellin_visa_arg

El LLM recibe ese contexto y responde con información precisa sobre visa en Indonesia.
```

---

## Caché de conexión en Lambda

```python
# app/services/rag_store.py
_vectorstore = None  # variable a nivel de módulo

def _load():
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore   # reutiliza la conexión existente
    # ... inicializa solo si es None
```

La conexión a Qdrant se inicializa una única vez por instancia de Lambda (en el primer request) y se reutiliza en todos los requests siguientes de esa instancia caliente. Esto evita el overhead de autenticación y handshake en cada llamada al chat.

Si `QDRANT_URL` no está configurada, `_load()` retorna `None` y `search_rag()` devuelve lista vacía sin lanzar excepción, permitiendo que el pipeline continúe usando Tavily como única fuente.

---

## Stack de librerías involucradas

| Librería | Rol |
|---|---|
| `langchain-google-genai` | Wrapper sobre Google AI API para generar embeddings |
| `langchain-qdrant` | Integración LangChain ↔ Qdrant (abstrae upsert y similarity search) |
| `langchain-core` | Define la clase `Document` y la interfaz `VectorStore` |
| `qdrant-client` | Cliente HTTP/gRPC directo contra la API de Qdrant Cloud |

---

## Procedimiento de configuración realizado

### 1. Creación del cluster en Qdrant Cloud

Se creó un cluster en [cloud.qdrant.io](https://cloud.qdrant.io) en la región `us-east-1` de AWS para minimizar la latencia respecto a la Lambda. El free tier incluye 1 cluster con 1 GB de almacenamiento, suficiente para la knowledge base actual.

### 2. Corrección de dimensiones

El script original definía la colección con 768 dimensiones. Al correr por primera vez, Qdrant creó la colección con esas dims. Cuando `from_documents` intentó insertar vectores de 3072 dims, lanzó un `QdrantVectorStoreError` por incompatibilidad. Se corrigió el script para:

- Consultar la dimensión configurada en la colección existente (`client.get_collection()`)
- Si no coincide con 3072, eliminar y recrear la colección
- Crear la colección con `VectorParams(size=3072, distance=Distance.COSINE)`

### 3. Ejecución del script de indexación

```bash
cd nomadai/
PYTHONIOENCODING=utf-8 py -3 scripts/populate_qdrant.py
```

Resultado:
```
Cargando knowledge base... 34 documentos
Inicializando embeddings (gemini-embedding-001)...
Conectando a Qdrant...
  Coleccion existente tiene 768 dims — recreando...
  Creando coleccion 'nomadai-knowledge' (3072 dims)...
Generando embeddings y subiendo a Qdrant...
✅ 34 vectores en 'nomadai-knowledge'
```

### 4. Variables de entorno en Lambda

Se actualizaron vía AWS CLI sin redeploy de imagen Docker (la configuración de entorno es independiente de la imagen):

```bash
aws lambda update-function-configuration \
  --function-name nomadai \
  --environment 'Variables={
    ...,
    QDRANT_URL=https://411e9951-3e9b-4d8d-8778-261c04969890.us-east-1-1.aws.cloud.qdrant.io,
    QDRANT_API_KEY=<jwt>,
    QDRANT_COLLECTION=nomadai-knowledge
  }'
```

---

## Contenido indexado

La knowledge base cubre **21 destinos** en **14 países**, con dos categorías de información por destino:

### Categoría: `visa`

Requisitos de entrada específicos para ciudadanos **argentinos**:

| Destino | País | Resumen |
|---|---|---|
| Medellín | Colombia | Sin visa hasta 180 días. Visa Nómada Digital (V): 2 años, ~$750 USD/mes, $52 USD |
| Bogotá | Colombia | Mismas condiciones que Medellín |
| Ciudad de México | México | Sin visa hasta 180 días. Sin visa de nómada digital |
| Playa del Carmen | México | Mismas condiciones que CDMX |
| Buenos Aires | Argentina | Sin requisitos (ciudadanos locales) |
| Lisboa | Portugal | 90 días sin visa (Schengen). Visa D8 Nómada Digital: 3280 EUR/mes |
| Porto | Portugal | Mismas condiciones que Lisboa |
| Barcelona | España | 90 días sin visa (Schengen). Visa Nómada Digital (Ley de Startups): ~$2500 USD/mes |
| Valencia | España | Mismas condiciones que Barcelona |
| Tallin | Estonia | 90 días sin visa (Schengen). D-visa Nómada Digital: 3504 EUR/mes, ~100 EUR |
| Berlín | Alemania | 90 días sin visa (Schengen). Freiberufler Visa para freelances |
| Ciudad del Cabo | Sudáfrica | Sin visa hasta 30 días (extensible a 90). Sin visa nómada digital |
| Ho Chi Minh | Vietnam | E-visa online $25 USD, 45 días extensibles |
| Kuala Lumpur | Malasia | Sin visa hasta 90 días. DE Rantau Nomad Pass: $2200 USD/mes, $250 USD |
| Bangkok | Tailandia | Visa on arrival 30 días. LTR Visa para ingresos >$40.000 USD/año |
| Chiang Mai | Tailandia | Mismas condiciones que Bangkok |
| Bali | Indonesia | Visa on arrival 30 días ($35 USD). Visa Nómada Digital E33G: 1 año, $2000 USD/mes |
| Budapest | Hungría | 90 días sin visa (Schengen). White Card: 1 año, $2000 USD/mes |
| Tbilisi | Georgia | Sin visa hasta 365 días, sin requisitos de ingresos |
| Montevideo | Uruguay | Sin visa con DNI argentino. Residencia permanente a los 6 meses |
| Praga | Rep. Checa | 90 días sin visa (Schengen). Zivnostensky list para freelances |

### Categoría: `clima`

| Destino | Clima | Temp. media | Mejor época |
|---|---|---|---|
| Medellín | Primaveral permanente | 22°C | Dic-Feb, Jul-Ago |
| Bogotá | Alta montaña | 14°C | Dic-Feb, Jun-Ago |
| Ciudad de México | Templado de altitud | 18°C | Oct-Mar |
| Playa del Carmen | Tropical caribeño | 27°C | Nov-Abr |
| Buenos Aires | Templado húmedo | ~18°C | Mar-May, Sep-Nov |
| Lisboa | Mediterráneo cálido | 17°C | May-Jun, Sep-Oct |
| Porto | Atlántico oceánico | 15°C | Jun-Sep |
| Valencia | Mediterráneo soleado | 18°C | Mar-Jun, Sep-Nov |
| Tallin | Continental | variable | Jun-Ago |
| Berlín | Continental oceánico | variable | May-Sep |
| Ciudad del Cabo | Mediterráneo (hemisferio sur) | ~18°C | Nov-Abr |
| Ho Chi Minh | Tropical dos estaciones | 28-34°C | Nov-Abr |
| Kuala Lumpur | Tropical ecuatorial | 27-32°C | Jun-Ago |

> Bangkok, Chiang Mai, Bali, Budapest, Tbilisi, Montevideo y Praga tienen documentos de visa pero no de clima en la versión actual.

---

## Cómo actualizar la knowledge base

1. Editar `data/knowledge_base.json` con el nuevo documento (misma estructura: `id`, `destination`, `country`, `category`, `nationality`, `text`)
2. Ejecutar el script:

```bash
cd nomadai/
py -3 scripts/populate_qdrant.py
```

El upsert actualiza documentos existentes y agrega nuevos sin borrar el resto. No es necesario recrear la colección.
