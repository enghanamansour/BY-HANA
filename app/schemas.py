"""Data contracts: what the user sends us, and exactly what Llama must send back."""
import re
from typing import Literal, get_args

from pydantic import BaseModel, Field, create_model, field_validator

from .shades import SHADES

# ---------- Shared vocabularies ----------

Base = Literal["water", "silicone", "oil", "powder"]
Step = Literal[
    "skincare", "primer", "foundation", "concealer", "powder",
    "contour", "blush", "highlighter", "eyeshadow", "eyeliner",
    "mascara", "lashes", "brows", "lips", "setting_spray",
]



def normalise(allowed: tuple[str, ...]):
    """'Setting Spray' -> 'setting_spray'; anything not in the vocabulary becomes None."""
    def fix(v):
        if isinstance(v, str):
            v = v.strip().lower().replace(" ", "_").replace("-", "_")
            return v if v in allowed else None
        return v
    return fix


# A product the user already owns (typed in, or read from a photo).
class OwnedProduct(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    step: Step | None = None
    base: Base | None = None

    _step = field_validator("step", mode="before")(normalise(get_args(Step)))
    _base = field_validator("base", mode="before")(normalise(get_args(Base)))


# Photos arrive as data URLs; the browser shrinks them before upload.
DATA_URL = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")
MAX_IMAGE_CHARS = 6_000_000  # ~4.5 MB of image


def check_image(v: str | None) -> str | None:
    if v is None:
        return v
    if len(v) > MAX_IMAGE_CHARS or not DATA_URL.match(v):
        raise ValueError("image must be a JPEG, PNG or WebP under 4 MB")
    return v


# ---------- 1) Design a look ----------

SkinType = Literal["dry", "oily", "combination", "normal", "sensitive"]
SkinTone = Literal["fair", "light", "medium", "tan", "deep"]
Undertone = Literal["warm", "cool", "neutral", "unknown"]
City = Literal["riyadh", "jeddah", "dammam", "makkah", "madinah", "abha", "taif", "other"]
Occasion = Literal["wedding", "milka", "eid", "graduation", "work", "daily", "evening"]
Budget = Literal["low", "medium", "high"]
Coverage = Literal["none", "hijab", "niqab"]
Lang = Literal["ar", "en"]
HairColor = Literal["black", "dark_brown", "brown", "caramel", "honey", "burgundy"]
Lashes = Literal["none", "natural", "dramatic"]
Finish = Literal["any", "matte", "satin", "dewy"]
FaceShape = Literal["oval", "round", "square", "heart", "long"]
Jaw = Literal["soft", "defined", "sharp"]
EyeShape = Literal["almond", "round", "narrow", "upturned", "downturned", "hooded"]
EyeColor = Literal["dark_brown", "brown", "honey", "hazel", "green", "grey", "blue"]
Lens = Literal["none", "honey", "hazel", "grey", "green", "blue"]  # coloured contact lenses
BrowShape = Literal["arched", "soft", "straight"]
BrowThickness = Literal["thin", "natural", "thick"]
Nose = Literal["slim", "medium", "wide"]
LipsShape = Literal["thin", "medium", "full"]


class LookRequest(BaseModel):
    skin_type: SkinType
    skin_tone: SkinTone
    undertone: Undertone = "unknown"
    city: City
    occasion: Occasion
    budget: Budget
    coverage: Coverage = "none"
    hair_color: HairColor = "black"
    lashes: Lashes = "natural"
    finish: Finish = "any"
    face_shape: FaceShape = "oval"
    jaw: Jaw = "defined"
    eye_shape: EyeShape = "almond"
    eye_color: EyeColor = "dark_brown"
    lens: Lens = "none"
    brow_shape: BrowShape = "arched"
    brow_thickness: BrowThickness = "natural"
    nose: Nose = "medium"
    lips_shape: LipsShape = "medium"
    owned_products: list[OwnedProduct] = Field(default_factory=list, max_length=25)
    notes: str = Field(default="", max_length=300)
    lang: Lang = "ar"

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, v: str) -> str:
        return v.strip()


class Product(BaseModel):
    step: Step
    name: str = Field(min_length=2)
    how_to_apply: str = Field(min_length=2)
    base: Base | None = None  # mascara, lashes, brow wax... have no meaningful face base
    owned: bool = False
    budget_alternative: str | None = None

    _step = field_validator("step", mode="before")(normalise(get_args(Step)))
    _base = field_validator("base", mode="before")(normalise(get_args(Base)))


# Llama may only pick shade names from the curated palette in shades.py.
LookShades = create_model("LookShades", **{
    area: (Literal[tuple(names)], ...) for area, names in SHADES.items()
})

# Llama sometimes translates shade names into Arabic ("توتي") or writes them as words ("Nude Rose").
# Map every spelling we know back to the shade id before validating.
SHADE_ALIASES = {
    area: {alias: sid for sid, (_, ar) in names.items()
           for alias in (sid, ar, sid.replace("_", " "), sid.replace("_", "-"))}
    for area, names in SHADES.items()
}


def shade_ids(value):
    if not isinstance(value, dict):
        return value
    fixed = {}
    for area, name in value.items():
        if isinstance(name, str) and area in SHADE_ALIASES:
            name = SHADE_ALIASES[area].get(name.strip().lower(), SHADE_ALIASES[area].get(name.strip(), name))
        fixed[area] = name
    return fixed


class LlamaLook(BaseModel):
    look_name: str = Field(min_length=2)
    description: str = Field(min_length=10)
    shades: LookShades
    products: list[Product] = Field(min_length=4, max_length=16)

    _shades = field_validator("shades", mode="before")(shade_ids)
    climate_tips: list[str] = Field(min_length=1, max_length=5)
    face_tips: list[str] = Field(default_factory=list, max_length=5)
    compatibility_note: str = ""


class CompatibilityWarning(BaseModel):
    product: str               # the step to swap, e.g. "البرايمر"
    product_name: str
    base: str
    conflicts_with: list[str]  # the layers it clashes with
    message: str


class Colour(BaseModel):
    hex: str
    name: str      # Arabic
    name_en: str


class Weather(BaseModel):
    temp_c: int
    humidity: int
    uv: float


class LookResponse(LlamaLook):
    colors: dict[str, Colour]  # area -> exact colour from the palette, painted onto the face
    compatibility_ok: bool
    compatibility_warnings: list[CompatibilityWarning]
    model: str
    weather: Weather | None = None  # live conditions from Open-Meteo, when available


# ---------- 2) Read products from a photo ----------

class ScanRequest(BaseModel):
    image: str

    _image = field_validator("image")(check_image)


class ScanResult(BaseModel):
    products: list[OwnedProduct] = Field(max_length=15)


# ---------- 3) Ask about a product ----------

class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=1500)


class AskRequest(BaseModel):
    question: str = Field(default="", max_length=500)
    image: str | None = None
    # Chat mode: earlier turns so follow-up questions make sense, and her bag so "my primer" is known.
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
    owned_products: list[OwnedProduct] = Field(default_factory=list, max_length=25)
    lang: Literal["ar", "en"] = "ar"

    _image = field_validator("image")(check_image)

    @field_validator("question")
    @classmethod
    def strip_question(cls, v: str) -> str:
        return v.strip()


class AskAnswer(BaseModel):
    product_name: str | None = None
    step: Step | None = None
    base: Base | None = None

    _step = field_validator("step", mode="before")(normalise(get_args(Step)))
    _base = field_validator("base", mode="before")(normalise(get_args(Base)))
    confidence: Literal["high", "medium", "low"] = "medium"
    answer: str = Field(min_length=5)
    how_to_check: str | None = None
    pairs_well_with: list[str] = Field(default_factory=list, max_length=5)
    avoid_with: list[str] = Field(default_factory=list, max_length=5)


class AskResponse(AskAnswer):
    model: str
    dialect_model: str | None = None  # set when ALLaM rewrote the answer in Saudi dialect
