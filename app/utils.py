import json
import re


def extract_json(text: str) -> dict | list | None:
    """Extrae JSON de texto aunque venga envuelto en bloques markdown."""
    text = text.strip()

    # Intenta parsear directo
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Busca dentro de ```json ... ``` o ``` ... ```
    match = re.search(r"```(?:json)?\s*([\[\{].*?[\]\}])\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Busca cualquier bloque JSON (array o dict) en el texto
    for pattern in (r"(\[.*\])", r"(\{.*\})"):
        match = re.search(pattern, text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

    return None
