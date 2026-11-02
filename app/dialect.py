"""Saudi dialect glossary. Llama often misreads dialect ("المويه" taken as a product instead of water),
so the code finds dialect words in her message and tells Llama exactly what they mean."""
import re

# Dialect word (normalised spelling) -> meaning in English, which Llama understands reliably.
GLOSSARY = {
    # water, sweat, weather
    "مويه": "water (H2O), not a product", "مويا": "water (H2O), not a product", "ماي": "water (H2O)",
    "عرق": "sweat", "اعرق": "I sweat", "حر": "heat / hot weather", "رطوبه": "humidity", "شمس": "sun",
    "مطر": "rain", "سباحه": "swimming", "بحر": "sea / swimming",
    # what makeup does
    "يسيح": "melts / runs", "يتسيل": "runs / smudges", "يسيل": "runs / drips", "يسيحون": "they melt / run",
    "يطيح": "wears off / slides off", "يطير": "fades away", "يروح": "fades / comes off",
    "يتكتل": "pills / cakes", "يكتل": "pills / cakes", "يتقشر": "flakes / peels", "يقشر": "flakes / peels",
    "يتكسر": "breaks up / separates", "يلمع": "gets shiny / oily", "يزيت": "gets oily", "ينشف": "dries",
    "يحرق": "stings / irritates", "يحسس": "causes an allergy / irritation", "يطلع حبوب": "causes breakouts",
    "يلطخ": "transfers / stains", "يوسخ": "transfers / stains", "يثبت": "lasts / stays in place",
    "يركب": "layers well / works with", "يمشي": "goes well with", "يخرب": "ruins",
    "يشيل": "removes", "ينشال": "comes off / can be removed",
    # makeup words as Saudis say them
    "روج": "lipstick", "روجات": "lipsticks", "حمره": "lipstick or blush", "قلوس": "lip gloss", "قلوز": "lip gloss",
    "تنت": "lip/cheek tint", "ليب": "lip", "بلم": "lip balm", "كحل": "kohl / eyeliner pencil", "ايلاينر": "eyeliner",
    "ظلال": "eyeshadow", "شادو": "eyeshadow", "باليت": "eyeshadow palette", "بلشر": "blush", "هايلايتر": "highlighter",
    "كونتور": "contour", "برونزر": "bronzer", "كريم اساس": "foundation", "اساس": "foundation", "فاونديشن": "foundation",
    "كونسيلر": "concealer", "خافي": "concealer", "بودره": "powder", "باودر": "powder", "برايمر": "primer",
    "مثبت": "setting spray", "سبراي": "setting spray", "رموش": "lashes", "مسكره": "mascara", "مسكرا": "mascara",
    "ماسكرا": "mascara", "قلم": "pencil", "فرشه": "brush", "اسفنجه": "beauty sponge", "بيوتي بلندر": "beauty sponge",
    "مرطب": "moisturiser", "واقي": "sunscreen", "مزيل": "makeup remover", "سيروم": "serum", "تونر": "toner",
    # clothing
    "طرحه": "headscarf / hijab", "شيله": "headscarf / hijab", "لثمه": "face veil", "نقاب": "niqab (face veil)",
    "عبايه": "abaya", "ثوب": "dress",
    # skin
    "دسمه": "oily", "دهنيه": "oily", "ناشفه": "dry", "حبوب": "pimples / acne", "رووس سودا": "blackheads",
    "هالات": "dark circles", "مسام": "pores", "بقع": "dark spots",
    # everyday words
    "وش": "what", "ايش": "what", "ليش": "why", "كيف": "how", "متى": "when", "وين": "where",
    "ابي": "I want", "ابغى": "I want", "ابغا": "I want", "ودي": "I would like", "ينفع": "is it suitable / does it work",
    "زين": "good", "حلو": "nice / good", "مره": "very", "شوي": "a little", "مب": "not", "مو": "not",
    "حق": "belonging to", "حقي": "my / mine", "حقتي": "my / mine", "حقها": "hers", "عندي": "I have / I own",
    "الحين": "now", "طول اليوم": "all day", "برا": "outside", "دوام": "work / office", "طلعه": "outing",
    "ملكه": "milka (engagement party)", "زواج": "wedding", "عرس": "wedding",
}

_PREFIXES = ("وبال", "وال", "بال", "فال", "لل", "ال", "و", "ف", "ب")


def _norm(text: str) -> str:
    text = re.sub("[ً-ْـ]", "", text)          # diacritics and tatweel
    text = re.sub("[أإآ]", "ا", text)
    return text.replace("ة", "ه").replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")


def _variants(word: str):
    yield word
    for p in _PREFIXES:
        if word.startswith(p) and len(word) - len(p) >= 2:
            yield word[len(p):]


def dialect_notes(text: str) -> str:
    """'Dialect notes: "المويه" = water (H2O), ...' for every glossary word in the text, or '' if none."""
    if not text:
        return ""
    clean = _norm(text)
    words = re.findall(r"[ء-ي]+", clean)
    found: dict[str, str] = {}
    for w in words:
        for v in _variants(w):
            if v in GLOSSARY and w not in found:
                found[w] = GLOSSARY[v]
                break
    # Two-word expressions.
    for phrase in (k for k in GLOSSARY if " " in k):
        if phrase in clean:
            found[phrase] = GLOSSARY[phrase]
    if not found:
        return ""
    return "Saudi dialect notes for her message: " + "; ".join(f'"{w}" = {m}' for w, m in found.items())
