from urllib.parse import quote


def get_accommodation_links(city: str, country: str) -> list[dict]:
    """Genera links de búsqueda de alojamiento para una ciudad. Sin API, costo cero."""
    c = quote(city)
    return [
        {
            "platform": "Airbnb",
            "url": f"https://www.airbnb.com/s/{c}/homes?monthly_length=1",
            "label": f"Estadías mensuales en {city} — Airbnb",
        },
        {
            "platform": "Booking.com",
            "url": f"https://www.booking.com/searchresults.html?ss={c}&nflt=ht_id%3D201",
            "label": f"Apartamentos en {city} — Booking.com",
        },
        {
            "platform": "Hostelworld",
            "url": f"https://www.hostelworld.com/search?search_keywords={c}",
            "label": f"Hospedajes en {city} — Hostelworld",
        },
    ]
