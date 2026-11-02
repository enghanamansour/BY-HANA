// Arabic is written directly in index.html; this file holds the English for every tagged element
// (data-i18n = text, data-i18n-html = text with <br>, data-i18n-ph = placeholder, data-i18n-aria = aria-label).

const EN = {
  "doc.title": "by HANA | Your smart makeup artist",
  "theme.toggle": "Toggle dark mode",
  "hero.eyebrow": "Hanu, your smart makeup artist",
  "hero.title": "A look made for your skin,<br>your city's weather and your own makeup",
  "hero.lead": "Tell Hanu about yourself and what's in your makeup bag. She'll design a full look, from colours to how to apply them, and check that your products layer well together (water vs silicone).",
  "mirror.hint": "The mirror changes as you choose",
  "look.save": "Save look",

  "step1.label": "My face", "step1.sub": "Features & skin tone",
  "step2.label": "Hanu designs", "step2.sub": "Look & products",
  "side.manual": "Try it yourself", "side.saved": "My looks",

  "face.h": "Draw your face",
  "face.hint": "Make the mirror look like you. Hanu adapts the makeup to your features: hooded eyes, for example, need a different eyeliner technique than almond eyes.",
  "f.tone": "Skin tone",
  "tone.fair": "Very fair", "tone.light": "Light", "tone.medium": "Medium", "tone.tan": "Tan", "tone.deep": "Deep",
  "f.under": "Undertone", "f.under.hint": "(green veins = warm, blue = cool)",
  "under.warm": "Warm", "under.cool": "Cool", "under.neutral": "Neutral", "under.unknown": "Not sure",
  "f.shape": "Face shape",
  "shape.oval": "Oval", "shape.round": "Round", "shape.square": "Square", "shape.heart": "Heart", "shape.long": "Long",
  "f.jaw": "Jawline", "jaw.soft": "Soft", "jaw.defined": "Defined", "jaw.sharp": "Sharp",
  "f.eyes": "Eye shape",
  "eye.almond": "Almond", "eye.round": "Round / wide", "eye.narrow": "Narrow", "eye.upturned": "Upturned",
  "eye.downturned": "Downturned", "eye.hooded": "Hooded",
  "f.eyecolor": "Eye colour",
  "c.dark_brown": "Dark brown", "c.brown": "Brown", "c.honey": "Honey", "c.hazel": "Hazel",
  "c.green": "Green", "c.grey": "Grey", "c.blue": "Blue",
  "f.lens": "Coloured lenses", "f.lens.hint": "(if you wear lenses, Hanu picks shadows for their colour)",
  "lens.none": "No lenses",
  "f.browshape": "Brow shape", "brow.arched": "Arched", "brow.soft": "Soft", "brow.straight": "Straight",
  "f.browthick": "Brow thickness", "thick.thin": "Thin", "thick.natural": "Medium", "thick.thick": "Thick",
  "f.nose": "Nose", "nose.slim": "Slim", "nose.medium": "Medium", "nose.wide": "Wide",
  "f.lips": "Lips", "lips.thin": "Thin", "lips.medium": "Medium", "lips.full": "Full",
  "f.hair": "Hair colour", "f.hair.hint": "(we match your brows to it)",
  "hair.black": "Black", "hair.caramel": "Caramel", "hair.burgundy": "Burgundy",
  "face.save": "Save my face & continue", "face.skip": "Continue without saving",
  "face.saved": "Your face is saved and will be here every time you visit.",

  "design.h": "Tell us about you", "design.editface": "Edit my face",
  "f.skintype": "Skin type",
  "skin.dry": "Dry", "skin.oily": "Oily", "skin.combination": "Combination", "skin.normal": "Normal", "skin.sensitive": "Sensitive",
  "f.city": "City", "city.pick": "Choose your city", "city.riyadh": "Riyadh", "city.jeddah": "Jeddah",
  "city.dammam": "Dammam / Eastern Province", "city.makkah": "Makkah", "city.madinah": "Madinah", "city.abha": "Abha",
  "city.other": "Another city",
  "f.occasion": "Occasion", "occ.pick": "Choose the occasion", "occ.wedding": "Wedding", "occ.milka": "Milka (engagement)",
  "occ.eid": "Eid", "occ.graduation": "Graduation", "occ.work": "Work", "occ.daily": "Everyday", "occ.evening": "Night out",
  "f.budget": "Budget", "budget.low": "Budget-friendly", "budget.medium": "Mid-range", "budget.high": "Luxury",
  "f.coverage": "Hijab", "cov.none": "None", "cov.hijab": "Hijab", "cov.niqab": "Niqab",
  "extras.h": "Extras for your look",
  "f.lashes": "Lashes", "lash.none": "My natural lashes", "lash.natural": "Soft falsies", "lash.dramatic": "Dramatic falsies",
  "f.finish": "Finish", "finish.any": "Hanu decides", "finish.matte": "Matte", "finish.satin": "Satin", "finish.dewy": "Dewy",
  "bag.h": "My makeup bag", "optional": "(optional)",
  "bag.hint": "Add the products you own. Hanu builds the look around them and only suggests what's missing.",
  "bag.ph": "Product name, e.g. Maybelline Fit Me", "bag.add": "Add",
  "bag.camera": "Photograph products", "bag.album": "From gallery",
  "f.notes": "Notes", "notes.ph": "e.g. I love nude lipstick and I'm sensitive to fragrance",
  "design.submit": "Let Hanu design my look",
  "loading.sub": "This takes about 30 seconds, hang tight",
  "error.title": "We couldn't design the look", "error.retry": "Try again",
  "result.eyebrow": "Your look from Hanu", "result.facetips": "Tips for your features",
  "result.steps": "Steps & products", "result.climate": "Tips for your city's weather", "result.again": "Another look",

  "manual.hint": "Pick a colour for each area and see it on the mirror. Skin and hair come from \"My face\", lashes from \"Hanu designs\".",
  "manual.loading": "Loading colours...", "manual.ph": "Name your look, e.g. Eid look", "manual.save": "Save",
  "saved.hint": "Looks you liked are saved in this browser. Tap \"View\" to open one.",
  "saved.empty": "No saved looks yet. Design one with Hanu or try it yourself, then tap \"Save look\".",

  "chat.fab": "Ask Hanu", "chat.name": "Hanu", "chat.sub": "Ask about any product or makeup",
  "chat.close": "Close chat", "chat.attach": "Attach a photo", "chat.send": "Send", "chat.removephoto": "Remove photo",
  "chat.ph": "Type your question...",
  "chat.welcome": "Hi! I'm Hanu. Ask me about any product: is it silicone or water-based? Does it work with your foundation? You can send me a photo of it too.",
  "footer.note": "These are suggestions only. Patch-test any new product on a small area of skin first.",
  "footer.powered": "by HANA · Powered by Llama from Meta",
  "footer.model": "3D face model:", "footer.modified": "(recoloured with makeup)",
  "mirror.drag": "Drag to turn the face",
};

const I18N = {
  lang: "ar",
  _ar: new Map(),  // original Arabic, captured from the page the first time we switch away from it

  /** Pick the Arabic or English version of a string used in JavaScript. */
  t(ar, en) { return this.lang === "en" ? en : ar; },

  apply(lang) {
    this.lang = lang;
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "en" ? "ltr" : "rtl";

    const swap = (attr, read, write) => {
      document.querySelectorAll(`[${attr}]`).forEach((el) => {
        const key = el.getAttribute(attr);
        const id = attr + "|" + key;
        if (!this._ar.has(el)) this._ar.set(el, {});
        const saved = this._ar.get(el);
        if (!(id in saved)) saved[id] = read(el);
        write(el, lang === "en" ? (EN[key] ?? saved[id]) : saved[id]);
      });
    };
    swap("data-i18n", (el) => el.textContent, (el, v) => { el.textContent = v; });
    swap("data-i18n-html", (el) => el.innerHTML, (el, v) => { el.innerHTML = v; });  // only our own EN strings
    swap("data-i18n-ph", (el) => el.placeholder, (el, v) => { el.placeholder = v; });
    swap("data-i18n-aria", (el) => el.getAttribute("aria-label"), (el, v) => el.setAttribute("aria-label", v));

    if (!this._title) this._title = document.title;
    document.title = lang === "en" ? EN["doc.title"] : this._title;
  },
};
