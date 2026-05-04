from __future__ import annotations

import re
from typing import Annotated, Any
from pydantic import BaseModel, Field, field_validator
from langgraph.graph.message import add_messages


class UserProfile(BaseModel):
    hobbies: list[str] = Field(default_factory=list)
    budget_usd_monthly: int | None = None
    work_timezone: str | None = None
    nationality: str | None = None
    goals: list[str] = Field(default_factory=list)
    preferred_climate: str | None = None
    remote_work: bool = True


class DestinationMedia(BaseModel):
    youtube_links: list[str] = Field(default_factory=list)
    photos: list[str] = Field(default_factory=list)
    influencers: list[str] = Field(default_factory=list)


class VisaInfo(BaseModel):
    visa_required: bool | None = None
    visa_type: str | None = None
    max_stay_days: int | None = None
    requirements: list[str] = Field(default_factory=list)
    source_url: str | None = None

    @field_validator("max_stay_days", mode="before")
    @classmethod
    def coerce_days(cls, v):
        if v is None or isinstance(v, int):
            return v
        if isinstance(v, str):
            # "365 días", "1 año", "90 días (renovable)" → primer número encontrado
            match = re.search(r"\d+", v)
            return int(match.group()) if match else None
        return None


class ClimateInfo(BaseModel):
    best_months: list[str] = Field(default_factory=list)
    avoid_months: list[str] = Field(default_factory=list)
    avg_temp_celsius: float | None = None
    rainy_season: str | None = None


class Destination(BaseModel):
    city: str
    country: str
    match_score: float = Field(ge=0, le=100)
    match_reasons: list[str] = Field(default_factory=list)
    monthly_cost_usd: int | None = None
    media: DestinationMedia = Field(default_factory=DestinationMedia)
    visa: VisaInfo = Field(default_factory=VisaInfo)
    climate: ClimateInfo = Field(default_factory=ClimateInfo)
    local_info: str = ""
    accommodation_links: list[dict] = Field(default_factory=list)


class NomadState(BaseModel):
    messages: Annotated[list[Any], add_messages] = Field(default_factory=list)
    user_profile: UserProfile = Field(default_factory=UserProfile)
    profile_complete: bool = False
    destinations: list[Destination] = Field(default_factory=list)
    final_report: str | None = None
    error: str | None = None
