"""by HANA API: receives the user's profile, asks Llama for a look, and returns a checked result."""
import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .compatibility import check_compatibility
from .llama import LlamaError, generate_look
from .schemas import LookRequest, LookResponse
from .shades import to_colors

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="by HANA", description="Saudi AI makeup artist powered by Llama")


@app.exception_handler(RequestValidationError)
async def invalid_input(request: Request, exc: RequestValidationError):
    fields = sorted({str(err["loc"][-1]) for err in exc.errors()})
    return JSONResponse(status_code=400, content={
        "error": "فضلًا عبّي كل الخانات المطلوبة بشكل صحيح.",
        "fields": fields,
    })


@app.exception_handler(LlamaError)
async def llama_failed(request: Request, exc: LlamaError):
    return JSONResponse(status_code=exc.status, content={"error": exc.message})


@app.get("/api/health")
def health():
    return {"status": "ok", "model": config.LLAMA_MODEL, "llama_configured": bool(config.LLM_API_KEY)}


@app.post("/api/look", response_model=LookResponse)
def create_look(req: LookRequest):
    look = generate_look(req)
    warnings = check_compatibility(look.products)
    return LookResponse(
        **look.model_dump(),
        colors=to_colors(look.shades.model_dump()),
        compatibility_ok=not warnings,
        compatibility_warnings=warnings,
        model=config.LLAMA_MODEL,
    )


# The frontend (static/index.html) is served from the same app, so one deploy covers everything.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
