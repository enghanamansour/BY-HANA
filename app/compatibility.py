"""Rule-based check for products that should not be layered together.

Llama labels each product's base; this code (not the AI) decides whether the combination is safe,
so the warning is always consistent and never hallucinated.
"""
from collections import Counter

from .schemas import CompatibilityWarning, Product

# Face-base layers that sit on top of each other and must agree.
FACE_STEPS = ["primer", "foundation", "concealer", "setting_spray"]

# Each label is (Arabic, English).
CONFLICTS = {
    frozenset({"water", "silicone"}): ("المائي والسيليكوني ما يركبون على بعض، ويكتّلون المكياج ويقشّرونه.",
                                       "Water- and silicone-based products don't layer: the makeup pills and flakes."),
    frozenset({"water", "oil"}): ("المائي والزيتي ما يركبون على بعض، والمكياج يتكسّر ويروح بسرعة.",
                                  "Water- and oil-based products separate: the makeup breaks up and fades fast."),
}
STEPS = {"primer": ("البرايمر", "Primer"), "foundation": ("الفاونديشن", "Foundation"),
         "concealer": ("الكونسيلر", "Concealer"), "setting_spray": ("مثبت المكياج", "Setting spray")}
BASES = {"water": ("مائي", "water-based"), "silicone": ("سيليكوني", "silicone-based"),
         "oil": ("زيتي", "oil-based"), "powder": ("بودرة", "powder")}


def check_compatibility(products: list[Product], lang: str = "ar") -> list[CompatibilityWarning]:
    li = 1 if lang == "en" else 0  # index into the (Arabic, English) labels
    face = [p for p in products if p.step in FACE_STEPS and p.base]
    counts = Counter(p.base for p in face)

    # Blame the product whose base is the odd one out, so one swap fixes all of its clashes.
    clashes: dict[int, list[Product]] = {}
    for i, a in enumerate(face):
        for b in face[i + 1:]:
            if frozenset({a.base, b.base}) in CONFLICTS:
                odd, other = (a, b) if counts[a.base] <= counts[b.base] else (b, a)
                clashes.setdefault(id(odd), [odd]).append(other)

    warnings = []
    for odd, *others in clashes.values():
        warnings.append(CompatibilityWarning(
            product=STEPS[odd.step][li],
            product_name=odd.name,
            base=BASES[odd.base][li],
            conflicts_with=[f"{STEPS[o.step][li]} ({BASES[o.base][li]})" for o in others],
            message=CONFLICTS[frozenset({odd.base, others[0].base})][li],
        ))
    return warnings
