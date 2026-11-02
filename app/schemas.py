"""Data contracts: what the user sends us, and exactly what Llama must send back."""
from typing import Literal

from pydantic import BaseModel, Field, create_model, field_validator

from .shades import SHADES

# ---------- Input from the user ----------

SkinType = Literal["dry", "oily", "combination", "normal", "sensitive"]
SkinTone = Literal["fair", "light", "medium", "tan", "deep"]
Undertone = Literal["warm", "cool", "neutral", "unknown"]
City = Literal["riyadh", "jeddah", "dammam", "makkah", "madinah", "abha", "other"]
Occasion = Literal["wedding", "milka", "eid", "graduation", "work", "daily", "evening"]
Budget = Literal["low", "medium", "high"]
Coverage = Literal["none", "hijab", "niqab"]


class LookRequest(BaseModel):
    skin_type: SkinType
    skin_tone: SkinTone
    undertone: Undertone = "unknown"
    city: City
    occasion: Occasion
    budget: Budget
    coverage: Coverage = "none"
    notes: str = Field(default="", max_length=300)

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, v: str) -> str:
        return v.strip()


# ---------- Output Llama must return ----------

Base = Literal["water", "silicone", "oil", "powder"]
Step = Literal[
    "skincare", "primer", "foundation", "concealer", "powder",
    "contour", "blush", "highlighter", "eyeshadow", "eyeliner",
    "mascara", "brows", "lips", "setting_spray",
]


class Product(BaseModel):
    step: Step
    name: str = Field(min_length=2)
    how_to_apply: str = Field(min_length=2)
    base: Base
    budget_alternative: str | None = None


# Llama may only pick shade names from the curated palette in shades.py.
LookShades = create_model("LookShades", **{
    area: (Literal[tuple(names)], ...) for area, names in SHADES.items()
})


class LlamaLook(BaseModel):
    look_name: str = Field(min_length=2)
    description: str = Field(min_length=10)
    shades: LookShades
    products: list[Product] = Field(min_length=4, max_length=14)
    climate_tips: list[str] = Field(min_length=1, max_length=5)
    compatibility_note: str = ""


# ---------- What our API returns to the frontend ----------

class CompatibilityWarning(BaseModel):
    product: str               # the step to swap, e.g. "البرايمر"
    product_name: str
    base: str
    conflicts_with: list[str]  # the layers it clashes with
    message: str


class Colour(BaseModel):
    hex: str
    name: str


class LookResponse(LlamaLook):
    colors: dict[str, Colour]  # area -> exact colour from the palette, painted onto the face
    compatibility_ok: bool
    compatibility_warnings: list[CompatibilityWarning]
    model: str
