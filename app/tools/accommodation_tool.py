from urllib.parse import quote


def get_accommodation_links(city: str, country: str, budget_usd_monthly: int | None = None) -> list[dict]:
    """Genera links de búsqueda de alojamiento filtrados por presupuesto del usuario."""
    c = quote(city)

    # Alojamiento ≈ 40% del presupuesto mensual total (regla estándar para nómadas)
    airbnb_url = f"https://www.airbnb.com/s/{c}/homes?monthly_length=1"
    booking_url = f"https://www.booking.com/searchresults.html?ss={c}&nflt=ht_id%3D201"

    if budget_usd_monthly:
        accom_monthly = int(budget_usd_monthly * 0.40)
        accom_nightly = max(10, accom_monthly // 30)
        # Airbnb: price_max es el precio mensual total cuando monthly_length=1
        airbnb_url += f"&price_max={accom_monthly}"
        # Booking: filtro de precio por noche (formato: USD-0-{max}-1)
        booking_url += f"%3Bprice%3DUSD-0-{accom_nightly}-1"

    return [
        {
            "platform": "Airbnb",
            "url": airbnb_url,
            "label": f"Estadías mensuales en {city} — Airbnb",
        },
        {
            "platform": "Booking.com",
            "url": booking_url,
            "label": f"Apartamentos en {city} — Booking.com",
        },
        {
            "platform": "Hostelworld",
            "url": f"https://www.hostelworld.com/search?search_keywords={c}",
            "label": f"Hospedajes en {city} — Hostelworld",
        },
    ]
