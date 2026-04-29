"""Verifica que el GOOGLE_API_KEY tenga acceso a modelos de embedding."""
import os
import sys

api_key = os.environ.get("GOOGLE_API_KEY", "")
print(f"Key present: {bool(api_key)}, starts with: '{api_key[:4] if api_key else 'EMPTY'}'")

if not api_key:
    print("ERROR: GOOGLE_API_KEY no está definida")
    sys.exit(1)

try:
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    models = [
        m.name for m in genai.list_models()
        if "embedContent" in m.supported_generation_methods
    ]
    print(f"Embedding models disponibles: {models}")
    if not models:
        print("WARNING: No hay modelos de embedding disponibles para este API key")
        sys.exit(1)
except Exception as e:
    print(f"ERROR al conectar con Google API: {e}")
    sys.exit(1)
