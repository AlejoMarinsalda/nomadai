from urllib.parse import quote


def get_accommodation_links(city: str, country: str, budget_usd_monthly: int | None = None, language: str = "es") -> list[dict]:
    """Genera links de búsqueda de alojamiento filtrados por presupuesto del usuario."""
    c = quote(city)

    airbnb_url = f"https://www.airbnb.com/s/{c}/homes?monthly_length=1"
    booking_url = f"https://www.booking.com/searchresults.html?ss={c}&nflt=ht_id%3D201"

    if budget_usd_monthly:
        accom_monthly = int(budget_usd_monthly * 0.40)
        accom_nightly = max(10, accom_monthly // 30)
        airbnb_url += f"&price_max={accom_monthly}"
        booking_url += f"%3Bprice%3DUSD-0-{accom_nightly}-1"

    if language.startswith("en"):
        labels = {
            "airbnb":      f"Monthly stays in {city} — Airbnb",
            "booking":     f"Apartments in {city} — Booking.com",
            "hostelworld": f"Accommodation in {city} — Hostelworld",
        }
    else:
        labels = {
            "airbnb":      f"Estadías mensuales en {city} — Airbnb",
            "booking":     f"Apartamentos en {city} — Booking.com",
            "hostelworld": f"Hospedajes en {city} — Hostelworld",
        }

    return [
        {"platform": "Airbnb",       "url": airbnb_url,  "label": labels["airbnb"]},
        {"platform": "Booking.com",  "url": booking_url, "label": labels["booking"]},
        {"platform": "Hostelworld",
         "url": f"https://www.hostelworld.com/search?search_keywords={c}",
         "label": labels["hostelworld"]},
    ]
