"""Curated makeup palette. Llama picks shades by name; the exact colours always come from here.

Language models cannot see colour, so hex codes they invent are often clashing or unwearable.
Restricting them to this list guarantees every look uses professional, flattering shades.
"""

# area -> {shade name: (hex, Arabic label)}
SHADES: dict[str, dict[str, tuple[str, str]]] = {
    "lips": {
        "nude_beige": ("#C48A78", "نود بيج"),
        "nude_rose": ("#B87070", "نود وردي"),
        "brown_nude": ("#8E5A4A", "نود بني"),
        "peach": ("#D98E74", "خوخي"),
        "coral": ("#D06A55", "مرجاني"),
        "dusty_rose": ("#B05F6D", "روز ترابي"),
        "mauve": ("#9C5F6E", "موف"),
        "berry": ("#8C3050", "توتي"),
        "plum": ("#6E2E45", "برقوقي"),
        "classic_red": ("#A82632", "أحمر كلاسيك"),
        "brick_red": ("#9A3B2E", "أحمر طوبي"),
    },
    "blush": {
        "soft_pink": ("#E8A0A0", "وردي ناعم"),
        "peach": ("#EFA88A", "خوخي"),
        "rose": ("#D98088", "روز"),
        "coral": ("#E8876E", "مرجاني"),
        "mauve": ("#C68A92", "موف"),
        "berry": ("#B65A6E", "توتي"),
        "bronze": ("#B97A5A", "برونزي"),
    },
    "eyeshadow_lid": {
        "champagne": ("#E8CFAE", "شامبين"),
        "peach": ("#E3A887", "خوخي"),
        "rose_gold": ("#C98F7A", "روز قولد"),
        "gold": ("#C9A04F", "ذهبي"),
        "bronze": ("#A86B3C", "برونزي"),
        "copper": ("#B5653A", "نحاسي"),
        "taupe": ("#9C8473", "توب"),
        "soft_brown": ("#8A6249", "بني ناعم"),
        "burgundy": ("#7A2E3A", "عنابي"),
        "plum": ("#6B3A55", "برقوقي"),
        "olive_gold": ("#8C7A45", "زيتي ذهبي"),
        "smoky_grey": ("#5A5458", "رمادي سموكي"),
    },
    "eyeshadow_crease": {
        "soft_peach": ("#C98A6E", "خوخي ناعم"),
        "warm_brown": ("#8A5A3E", "بني دافئ"),
        "cool_taupe": ("#7D6B66", "توب بارد"),
        "bronze": ("#8E5A30", "برونزي"),
        "deep_brown": ("#5A3A2C", "بني غامق"),
        "burgundy": ("#6E2C36", "عنابي"),
        "plum": ("#5A3048", "برقوقي"),
        "charcoal": ("#3E3A3C", "فحمي"),
    },
    "eyeliner": {
        "black": ("#1E1A1A", "أسود"),
        "brown": ("#4A2E22", "بني"),
        "deep_plum": ("#3E2236", "برقوقي غامق"),
        "navy": ("#23283F", "كحلي"),
        "bronze": ("#6E4A2A", "برونزي"),
    },
    "highlighter": {
        "pearl": ("#F5ECE6", "لؤلؤي"),
        "champagne": ("#F3E3C8", "شامبين"),
        "rose_gold": ("#EDC2B0", "روز قولد"),
        "gold": ("#EBCB8B", "ذهبي"),
        "bronze": ("#D9A877", "برونزي"),
    },
}


def to_colors(choice: dict[str, str]) -> dict[str, dict[str, str]]:
    """{"lips": "berry", ...} -> {"lips": {"hex": "#8C3050", "name": "توتي"}, ...}"""
    return {area: {"hex": SHADES[area][name][0], "name": SHADES[area][name][1]}
            for area, name in choice.items()}


def prompt_list() -> str:
    """The allowed shade names, one line per area, for the system prompt."""
    return "\n".join(f'  "{area}": {", ".join(names)}' for area, names in SHADES.items())
