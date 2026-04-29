"""
Construye el índice FAISS a partir de knowledge_base.json.

Uso en Dockerfile (BuildKit secret):
    RUN --mount=type=secret,id=google_api_key \\
        GOOGLE_API_KEY=$(cat /run/secrets/google_api_key) \\
        python scripts/build_rag_index.py --output-dir /build/rag_index --skip-upload

Uso local (para probar o actualizar el índice sin Docker):
    python scripts/build_rag_index.py --output-dir /tmp/rag_build
    # Subir a S3 si querés usar el fallback de S3 en desarrollo:
    python scripts/build_rag_index.py
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

DATA_PATH = Path(__file__).parent.parent / "data" / "knowledge_base.json"
S3_BUCKET = "nomadai-rag-index"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Construye el índice FAISS del RAG")
    parser.add_argument(
        "--output-dir",
        default="/tmp/rag_build",
        help="Directorio donde guardar index.faiss e index.pkl",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="No subir el índice a S3 (usar cuando se buildea dentro de Docker)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)

    try:
        from langchain_community.vectorstores import FAISS
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        from langchain_core.documents import Document
    except ImportError as e:
        print(f"Dependencias faltantes: {e}")
        print("pip install faiss-cpu langchain-community langchain-google-genai")
        sys.exit(1)

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GOOGLE_API_KEY no está definida")
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
            },
        )
        for doc in kb
    ]
    print(f"  {len(documents)} documentos")

    print("Generando embeddings (text-embedding-004)...")
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=api_key,
    )

    print("Construyendo índice FAISS...")
    vectorstore = FAISS.from_documents(documents, embeddings)

    output_dir.mkdir(parents=True, exist_ok=True)
    vectorstore.save_local(str(output_dir))
    print(f"  Guardado en {output_dir}/")

    if args.skip_upload:
        print("✅ Índice listo (upload a S3 omitido)")
        return

    try:
        import boto3
        print(f"Subiendo a s3://{S3_BUCKET}/...")
        s3 = boto3.client("s3")
        for fname in ["index.faiss", "index.pkl"]:
            s3.upload_file(str(output_dir / fname), S3_BUCKET, fname)
            print(f"  ✓ {fname}")
        print("✅ Índice subido a S3")
    except Exception as e:
        print(f"Warning: no se pudo subir a S3: {e}")
        print("El índice local está en:", output_dir)


if __name__ == "__main__":
    main()
