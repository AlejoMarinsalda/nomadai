"""
Popula la colección de Qdrant con el knowledge base de NomadAI.

Uso:
    python scripts/populate_qdrant.py

Variables de entorno requeridas:
    QDRANT_URL       — URL del cluster de Qdrant Cloud (ej: https://xxx.qdrant.io:6333)
    QDRANT_API_KEY   — API key del cluster
    GOOGLE_API_KEY   — Para generar embeddings con Gemini

Opcional:
    QDRANT_COLLECTION — Nombre de la colección (default: nomadai-knowledge)

El script es idempotente: usa upsert, puede correr múltiples veces sin duplicar datos.
"""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DATA_PATH = Path(__file__).parent.parent / "data" / "knowledge_base.json"


def main() -> None:
    qdrant_url = os.environ.get("QDRANT_URL", "")
    qdrant_api_key = os.environ.get("QDRANT_API_KEY", "")
    google_api_key = os.environ.get("GOOGLE_API_KEY", "")
    collection_name = os.environ.get("QDRANT_COLLECTION", "nomadai-knowledge")

    if not qdrant_url:
        print("Error: QDRANT_URL no está definida")
        sys.exit(1)
    if not google_api_key:
        print("Error: GOOGLE_API_KEY no está definida")
        sys.exit(1)

    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams
        from langchain_qdrant import QdrantVectorStore
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        from langchain_core.documents import Document
    except ImportError as e:
        print(f"Dependencias faltantes: {e}")
        print("pip install qdrant-client langchain-qdrant langchain-google-genai")
        sys.exit(1)

    print(f"Cargando knowledge base desde {DATA_PATH}...")
    with open(DATA_PATH, encoding="utf-8") as f:
        kb = json.load(f)

    documents = [
        Document(
            page_content=doc["text"],
            metadata={
                "id": doc.get("id", ""),
                "destination": doc.get("destination", ""),
                "category": doc.get("category", ""),
                "country": doc.get("country", ""),
                "nationality": doc.get("nationality", ""),
            },
        )
        for doc in kb
    ]
    print(f"  {len(documents)} documentos")

    print("Inicializando embeddings (gemini-embedding-001)...")
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=google_api_key,
    )

    print(f"Conectando a Qdrant: {qdrant_url}")
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key or None)

    # gemini-embedding-001 genera vectores de 3072 dimensiones
    existing = [c.name for c in client.get_collections().collections]
    if collection_name in existing:
        info = client.get_collection(collection_name)
        current_size = info.config.params.vectors.size
        if current_size != 3072:
            print(f"  Coleccion existente tiene {current_size} dims (esperado 3072) — recreando...")
            client.delete_collection(collection_name)
            existing.remove(collection_name)

    if collection_name not in existing:
        print(f"  Creando coleccion '{collection_name}' (3072 dims)...")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=3072, distance=Distance.COSINE),
        )
        print("  OK - Coleccion creada")
    else:
        print(f"  Coleccion '{collection_name}' OK - haciendo upsert")

    print("Generando embeddings y subiendo a Qdrant...")
    QdrantVectorStore.from_documents(
        documents=documents,
        embedding=embeddings,
        url=qdrant_url,
        api_key=qdrant_api_key or None,
        collection_name=collection_name,
        force_recreate=False,
    )

    count = client.count(collection_name=collection_name).count
    print(f"✅ {count} vectores en '{collection_name}'")


if __name__ == "__main__":
    main()
