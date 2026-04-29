import os
from googleapiclient.discovery import build


def search_youtube_reviews(query: str, max_results: int = 3) -> list[str]:
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        return []

    try:
        youtube = build("youtube", "v3", developerKey=api_key)
        request = youtube.search().list(
            part="snippet",
            q=query,
            type="video",
            maxResults=max_results,
            relevanceLanguage="es",
            order="relevance",
        )
        response = request.execute()
        return [
            f"https://www.youtube.com/watch?v={item['id']['videoId']}"
            for item in response.get("items", [])
        ]
    except Exception:
        return []
