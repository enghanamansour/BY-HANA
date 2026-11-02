"""App settings, read once from environment variables (.env locally, dashboard vars in production)."""
import os

from dotenv import load_dotenv

load_dotenv()

LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1")
LLAMA_MODEL = os.getenv("LLAMA_MODEL", "meta-llama/llama-3.3-70b-instruct")
# Multimodal Llama used when the user sends a photo.
LLAMA_VISION_MODEL = os.getenv("LLAMA_VISION_MODEL", "meta-llama/llama-4-maverick")

# Seconds to wait for Llama before giving up, and how many extra tries if it returns broken JSON.
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "90"))
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "1"))
