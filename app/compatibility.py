"""Rule-based check for products that should not be layered together.

Llama labels each product's base; this code (not the AI) decides whether the combination is safe,
so the warning is always consistent and never hallucinated.
"""
from collections import Counter

from .schemas import CompatibilityWarning, Product

# Face-base layers that sit on top of each other and must agree.
FACE_STEPS = ["primer", "foundation", "concealer", "setting_spray"]

CONFLICTS = {
    frozenset({"water", "silicone"}): "المائي والسيليكوني ما يمتزجون، وممكن يسببون تكتّل وتقشّر بالمكياج.",
    frozenset({"water", "oil"}): "المائي والزيتي ما يمتزجون، وممكن يتفكك المكياج ويختفي بسرعة.",
}

STEP_AR = {"primer": "البرايمر", "foundation": "الفاونديشن", "concealer": "الكونسيلر", "setting_spray": "مثبت المكياج"}
BASE_AR = {"water": "مائي", "silicone": "سيليكوني", "oil": "زيتي", "powder": "بودرة"}


def check_compatibility(products: list[Product]) -> list[CompatibilityWarning]:
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
            product=STEP_AR[odd.step],
            product_name=odd.name,
            base=BASE_AR[odd.base],
            conflicts_with=[f"{STEP_AR[o.step]} ({BASE_AR[o.base]})" for o in others],
            message=CONFLICTS[frozenset({odd.base, others[0].base})],
        ))
    return warnings
