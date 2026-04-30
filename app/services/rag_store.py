"""
RAG store: conecta con Qdrant Cloud para búsqueda semántica sobre el knowledge base.

El vectorstore se cachea a nivel de módulo — las Lambda calientes reusan la conexión
sin reinicializarla en cada invocación.

Si QDRANT_URL no está configurada, search_rag() retorna lista vacía y el pipeline
continúa usando Tavily como fuente de información.
"""

import logging
from app.config import settings

logger = logging.getLogger(__name__)

_vectorstore = None


def _load():
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore

    if not settings.qdrant_url:
        logger.warning("QDRANT_URL no configurada — RAG no disponible")
        return None

    try:
        from qdrant_client import QdrantClient
        from langchain_qdrant import QdrantVectorStore
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=settings.google_api_key,
        )

        client = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key or None,
        )

        _vectorstore = QdrantVectorStore(
            client=client,
            collection_name=settings.qdrant_collection,
            embedding=embeddings,
        )
        logger.info("RAG conectado a Qdrant: %s / %s", settings.qdrant_url, settings.qdrant_collection)

    except Exception as e:
        logger.warning("RAG no disponible: %s", e)
        _vectorstore = None

    return _vectorstore


def search_rag(query: str, k: int = 3) -> list[str]:
    """Retorna hasta k fragmentos relevantes del knowledge base. Lista vacía si no disponible."""
    vs = _load()
    if vs is None:
        return []
    try:
        docs = vs.similarity_search(query, k=k)
        return [doc.page_content for doc in docs]
    except Exception as e:
        logger.warning("RAG search falló: %s", e)
        return []
