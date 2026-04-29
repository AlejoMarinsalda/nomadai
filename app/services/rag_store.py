"""
RAG store: carga el índice FAISS que fue bakeado en la imagen Docker durante el build.
El índice vive en LAMBDA_TASK_ROOT/rag_index/ — no se descarga nada en runtime.

Se cachea a nivel de módulo para que los Lambda calientes reusen el vectorstore
sin recargarlo en cada invocación.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# En Lambda: /var/task/rag_index (LAMBDA_TASK_ROOT es /var/task)
# En local: sobreescribir con RAG_INDEX_PATH=<ruta>
_INDEX_PATH = Path(os.environ.get("RAG_INDEX_PATH", "/var/task/rag_index"))

_vectorstore = None


def _load():
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore

    if not (_INDEX_PATH / "index.faiss").exists():
        logger.warning("RAG index no encontrado en %s — se usarán APIs externas", _INDEX_PATH)
        return None

    try:
        from langchain_community.vectorstores import FAISS
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        from app.config import settings

        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=settings.google_api_key,
        )

        _vectorstore = FAISS.load_local(
            str(_INDEX_PATH),
            embeddings,
            allow_dangerous_deserialization=True,
        )
        logger.info("RAG cargado: %d vectores desde %s", _vectorstore.index.ntotal, _INDEX_PATH)

    except Exception as e:
        logger.warning("RAG no disponible — se usarán APIs externas: %s", e)
        _vectorstore = None

    return _vectorstore


def search_rag(query: str, k: int = 3) -> list[str]:
    """Retorna hasta k fragmentos relevantes. Lista vacía si el RAG no está disponible."""
    vs = _load()
    if vs is None:
        return []
    try:
        docs = vs.similarity_search(query, k=k)
        return [doc.page_content for doc in docs]
    except Exception as e:
        logger.warning("RAG search falló: %s", e)
        return []
