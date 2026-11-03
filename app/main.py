"""by HANA API: designs looks, reads products from photos, and answers product questions with Llama."""
import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .compatibility import check_compatibility
from .llama import LlamaError, ask_product, generate_look, scan_products, to_saudi
from .schemas import AskRequest, AskResponse, LookRequest, LookResponse, ScanRequest, ScanResult
from .i18n import msg, request_lang
from .shades import SHADES, english_name, to_colors

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="by HANA", description="Saudi AI makeup artist powered by Llama")


@app.middleware("http")
async def always_fresh_frontend(request: Request, call_next):
    """Make browsers re-check the page, scripts and styles on every visit, so updates show without a hard refresh."""
    response = await call_next(request)
    if not request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.exception_handler(RequestValidationError)
async def invalid_input(request: Request, exc: RequestValidationError):
    fields = sorted({str(err["loc"][-1]) for err in exc.errors()})
    key = "bad_image" if "image" in fields else "bad_input"
    return JSONResponse(status_code=400, content={"error": msg(key, request_lang(request)), "fields": fields})


@app.exception_handler(LlamaError)
async def llama_failed(request: Request, exc: LlamaError):
    return JSONResponse(status_code=exc.status, content={"error": msg(exc.key, request_lang(request))})


@app.get("/api/health")
def health():
    return {"status": "ok", "model": config.LLAMA_MODEL, "vision_model": config.LLAMA_VISION_MODEL,
            "llama_configured": bool(config.LLM_API_KEY), "allam_configured": bool(config.ALLAM_API_KEY)}


@app.get("/api/shades")
def shades():
    """The curated palette, so the manual 'try it yourself' mode uses exactly the same colours as Llama."""
    return {area: [{"id": k, "hex": hex_, "name": name, "name_en": english_name(k)} for k, (hex_, name) in items.items()]
            for area, items in SHADES.items()}


@app.post("/api/look", response_model=LookResponse)
def create_look(req: LookRequest):
    look = generate_look(req)
    warnings = check_compatibility(look.products, req.lang)
    return LookResponse(
        **look.model_dump(),
        colors=to_colors(look.shades.model_dump()),
        compatibility_ok=not warnings,
        compatibility_warnings=warnings,
        model=config.LLAMA_MODEL,
    )


@app.post("/api/scan", response_model=ScanResult)
def scan(req: ScanRequest):
    result = scan_products(req.image)
    if not result.products:
        raise LlamaError("no_products", 422)
    return result


@app.post("/api/ask", response_model=AskResponse)
def ask(req: AskRequest, request: Request):
    if not req.question and not req.image:
        return JSONResponse(status_code=400, content={
            "error": msg("empty_question", request_lang(request)), "fields": ["question"]})
    answer = ask_product(req.question, req.image, req.history, req.owned_products, req.lang)
    saudi = to_saudi(answer.answer) if req.lang == "ar" else None
    if saudi:
        answer.answer = saudi
    return AskResponse(**answer.model_dump(),
                       model=config.LLAMA_VISION_MODEL if req.image else config.LLAMA_MODEL,
                       dialect_model=config.ALLAM_MODEL if saudi else None)


# The frontend (static/index.html) is served from the same app, so one deploy covers everything.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
