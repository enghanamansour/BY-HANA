"""Vercel entry point: Vercel's Python runtime serves this ASGI app for every /api/* request."""
from app.main import app  # noqa: F401
