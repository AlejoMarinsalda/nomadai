import os
from tavily import TavilyClient


def search_web(query: str, max_results: int = 3) -> list[str]:
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return []

    try:
        client = TavilyClient(api_key=api_key)
        response = client.search(query=query, max_results=max_results)
        return [result["content"] for result in response.get("results", [])]
    except Exception:
        return []
