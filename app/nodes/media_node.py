from app.graph.state import NomadState, DestinationMedia
from app.tools.youtube_tool import search_youtube_reviews
from app.tools.search_tool import search_web


def media_node(state: NomadState) -> dict:
    updated_destinations = []

    for destination in state.destinations:
        query = f"{destination.city} {destination.country} digital nomad review"

        youtube_links = search_youtube_reviews(query)
        influencers = _find_influencers(destination.city, destination.country)

        media = DestinationMedia(
            youtube_links=youtube_links,
            influencers=influencers,
        )
        updated_destinations.append(destination.model_copy(update={"media": media}))

    return {"destinations": updated_destinations}


def _find_influencers(city: str, country: str) -> list[str]:
    query = f"digital nomad influencer living in {city} {country} YouTube channel"
    results = search_web(query)
    return results[:3] if results else []
