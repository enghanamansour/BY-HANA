# by HANA — خبيرة مكياجك الذكية

**An AI makeup artist for women in Saudi Arabia, powered by Meta's Llama.**

Pick your skin type, skin tone, city, occasion, budget and whether you wear a hijab or niqab. Hno (هنو), the app's makeup artist, designs a complete look: shades, products in application order, how to apply each one, and tips for your city's weather. It paints the look onto an illustrated face and warns you when two products won't layer well together (water-based vs silicone-based).

### Features

| Tab | What it does | Llama model |
|---|---|---|
| ✨ **هنو تصمم** (Hno designs) | Full look from your profile, hair colour, lashes and preferred finish | Llama 3.3 70B |
| 👜 **شنطة مكياجي** (My makeup bag) | Add products you own by typing or **photographing them**. Hno builds the look around them and only suggests what's missing | Llama 4 Maverick (vision) |
| 🔍 **اسألي هنو** (Ask Hno) | Ask about any product by text or photo, e.g. "is this primer silicone or water-based?" | Llama 3.3 / Llama 4 for photos |
| 🎨 **جربي بنفسك** (Try it yourself) | Pick shades by hand from the same palette and see them on the face | No AI needed |
| 💾 **لوكاتي** (My looks) | Save any look and reopen it later (stored in the browser) | No AI needed |

---

## The problem

Generic makeup advice ignores what matters here:

- **Climate.** Jeddah's humidity and Riyadh's dry heat need different products.
- **Occasions.** A milka, a wedding, Eid and the office each call for a different look.
- **Coverage.** With a niqab the look is all about the eyes, and products must not transfer onto fabric.
- **Product clashes.** A silicone primer under a water-based foundation pills and breaks apart. Most people don't know this until it happens.

## How Llama is used

Llama is the main model. It receives the user's profile and returns **one JSON object with a fixed shape**:

| Field | What Llama decides |
|---|---|
| `look_name`, `description` | Arabic name and description of the look |
| `shades` | One shade **name** per area (lips, blush, lid, crease, liner, highlighter), chosen from a curated palette |
| `products[]` | Step, product name, how to apply, **base** (water / silicone / oil / powder), cheaper alternative |
| `climate_tips[]` | Tips for her city's weather |

Each part of the work goes to whoever does it best:

1. **Llama does the reasoning.** It chooses shades that suit her undertone and occasion, picks products and writes instructions.
2. **Code supplies the exact colours.** Language models can't see colour, so hex codes they invent often clash. Llama picks shade *names* from [`app/shades.py`](app/shades.py), and the code maps each name to a tested colour.
3. **Code translates Saudi dialect.** Llama often misreads dialect (it took «المويه», water, for a product). [`app/dialect.py`](app/dialect.py) finds dialect words in her message (مويه، يطيح، يتكتل، روج، طرحة…) and sends their meaning along with it, so she can write the way she talks.
4. **Code makes the safety decision.** [`app/compatibility.py`](app/compatibility.py) checks the product bases with fixed rules, so the water/silicone warning is always consistent and never hallucinated.

### Handling bad or missing responses

- Every reply is validated against a strict Pydantic schema ([`app/schemas.py`](app/schemas.py)): required fields, allowed shade names, allowed steps and bases, list lengths.
- JSON wrapped in markdown fences or extra text is extracted automatically.
- If the reply is invalid, Llama is told exactly what was wrong and asked once more.
- Provider failures (bad key, timeout, rate limit, no credit, outage) each return a clear Arabic message with the right HTTP status.

## API

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/look` | Body: `skin_type`, `skin_tone`, `undertone`, `city`, `occasion`, `budget`, `coverage`, `hair_color`, `lashes`, `finish`, `owned_products[]`, `notes`. Returns the look. |
| `POST` | `/api/scan` | Body: `image` (data URL). Returns the products Llama 4 reads from the photo. |
| `POST` | `/api/ask` | Body: `question` and/or `image`. Returns the product, its base, a confidence level and advice. |
| `GET` | `/api/shades` | The curated palette (used by "try it yourself"). |
| `GET` | `/api/health` | Shows whether the server is up and Llama is configured. |

Empty or invalid input returns `400` with an Arabic message and the list of bad fields. Interactive docs are at `/docs`.

## Frontend

A plain HTML/CSS/JS page served by the same FastAPI app ([`static/`](static/)), with no build step. It has a modern clean design with light and dark themes (it follows the device the first time), Arabic (RTL, Saudi dialect) and English (LTR) versions, and Lucide icons. The flow is two clear steps, **1. My face → 2. Hno designs**, plus side sections for **Try it yourself** and **My looks**. The chat button is a powder compact with a red heart, and its lid opens when the chat opens. Llama answers in whichever language the page is in. It includes:

- A live "mirror": the SVG face updates as you pick skin tone and hijab/niqab, then gets painted with the look.
- Client-side validation that highlights missing fields.
- A loading state with a scanning animation and progress messages.
- Clear error messages with a retry button.
- A responsive RTL Arabic layout that works on phones.
- Model output is rendered with `textContent` only, never injected as HTML.

## Portrait mirror

The mirror is a still, front-facing portrait ([`static/portrait.png`](static/portrait.png)), repainted live on a canvas by [`static/portrait.js`](static/portrait.js). The code changes the skin tone, hair and brow colours and the iris colour, and paints the lipstick (found by the lips' own colour), blush, eyeshadow, liner and highlighter at fixed spots on the face. The lighting never changes. With a hijab or niqab, or if the image can't load, it falls back to the drawn SVG face ([`static/face.js`](static/face.js)).

**Image credit:** a front render of ["Female face Anime"](https://sketchfab.com/3d-models/female-face-anime-9a2018ca836648b982cdfddd8b9fe717) by [giueppeccc](https://sketchfab.com/giueppeccc), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: rendered as a single front view, decorative face dots removed, and recoloured at runtime with makeup.
## Project structure

```
app/
  main.py           API routes and error handlers
  llama.py          Calls Llama, extracts and validates JSON, retries
  prompts.py        System prompt and user prompt builder
  schemas.py        Input and output contracts (Pydantic)
  shades.py         Curated makeup palette
  compatibility.py  Water / silicone / oil clash rules
  config.py         Settings from environment variables
static/
  index.html        Page and SVG face
  style.css         Design
  app.js            Form, API call, rendering
```

## Run locally

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then put your key in .env
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000

## Configuration

| Variable | Default | |
|---|---|---|
| `LLM_API_KEY` | — | API key for the Llama provider (required) |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | Any OpenAI-compatible endpoint that serves Llama |
| `LLAMA_MODEL` | `meta-llama/llama-3.3-70b-instruct` | Text model |
| `LLAMA_VISION_MODEL` | `meta-llama/llama-4-maverick` | Model used for photos |
| `LLM_TIMEOUT` | `90` | Seconds to wait for Llama |
| `LLM_MAX_RETRIES` | `1` | Extra attempts when the reply is invalid |
| `ALLAM_API_KEY` | — | Optional. A [Groq](https://console.groq.com/keys) key for **ALLaM** (SDAIA's Arabic model, `allam-2-7b`). When set, ALLaM rewrites Hno's Arabic chat answers in Saudi dialect; if it fails or drifts, Llama's answer is kept. |

The provider is just configuration. Llama providers change which models they offer (Groq, for example, dropped its Llama chat models), so you can switch to another one by editing two variables, without touching the code.

## Deploy

**Vercel (recommended):** import the GitHub repo at vercel.com and add these environment variables:
`LLM_API_KEY`, and `LLM_TIMEOUT=55` (so Llama calls finish inside the 60-second function limit). Vercel detects the FastAPI app in [`app/main.py`](app/main.py), which serves both the API and the frontend; [`vercel.json`](vercel.json) only raises the time limit to 60 seconds. Every push to `main` redeploys.

**Render (alternative):**

The repo includes [`render.yaml`](render.yaml). On [Render](https://render.com), create a new Blueprint from this repo and set `LLM_API_KEY` in the dashboard.

---

> The suggestions are guidance only. Patch-test any new product on a small area of skin first.
