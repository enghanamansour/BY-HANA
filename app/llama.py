"""Talks to Llama and turns its reply into a validated LlamaLook, or raises a clear LlamaError."""
import json
import logging
import re

import openai
from openai import OpenAI
from pydantic import ValidationError

from . import config
from .prompts import SYSTEM_PROMPT, build_user_prompt
from .schemas import LlamaLook, LookRequest

log = logging.getLogger("by-hana.llama")


class LlamaError(Exception):
    """An error that is safe to show to the user, with the HTTP status the API should return."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


_client = OpenAI(api_key=config.LLM_API_KEY or "missing", base_url=config.LLM_BASE_URL,
                 timeout=config.LLM_TIMEOUT, max_retries=0)


def _extract_json(text: str) -> dict:
    """Llama sometimes wraps JSON in ```json fences or adds a sentence; keep only the {...} object."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON object in reply")
    return json.loads(match.group(0))


def _call_llama(messages: list[dict]) -> str:
    try:
        response = _client.chat.completions.create(
            model=config.LLAMA_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=2000,
        )
    except openai.AuthenticationError:
        raise LlamaError("مفتاح خدمة الذكاء الاصطناعي غير صحيح. تواصلي مع مسؤول التطبيق.", 500)
    except openai.APITimeoutError:
        raise LlamaError("Llama تأخر في الرد. حاولي مرة ثانية بعد شوي.", 504)
    except openai.RateLimitError:
        raise LlamaError("فيه ضغط على الخدمة حاليًا. انتظري دقيقة وحاولي مرة ثانية.", 429)
    except openai.APIStatusError as e:
        log.warning("Llama provider error %s: %s", e.status_code, e.message)
        if e.status_code == 402:
            raise LlamaError("رصيد خدمة الذكاء الاصطناعي خلص. تواصلي مع مسؤول التطبيق.", 503)
        raise LlamaError("خدمة Llama غير متاحة حاليًا. حاولي مرة ثانية بعد شوي.", 503)
    except openai.APIConnectionError:
        raise LlamaError("ما قدرنا نتصل بخدمة Llama. تأكدي من الاتصال وحاولي مرة ثانية.", 503)

    content = response.choices[0].message.content if response.choices else None
    if not content or not content.strip():
        raise ValueError("empty reply")
    return content


def generate_look(req: LookRequest) -> LlamaLook:
    if not config.LLM_API_KEY:
        raise LlamaError("التطبيق غير مهيأ: مفتاح Llama غير موجود.", 500)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(req)},
    ]

    # If Llama returns missing or malformed JSON, tell it what was wrong and let it try again.
    for attempt in range(config.LLM_MAX_RETRIES + 1):
        try:
            content = _call_llama(messages)
            return LlamaLook.model_validate(_extract_json(content))
        except (ValueError, ValidationError) as e:
            log.warning("Invalid Llama reply (attempt %d): %s", attempt + 1, e)
            if attempt < config.LLM_MAX_RETRIES:
                messages.append({"role": "user", "content":
                                 f"Your previous reply was not valid ({str(e)[:300]}). "
                                 "Return ONLY the JSON object with the exact shape requested."})

    raise LlamaError("Llama رجّع رد غير مكتمل. حاولي مرة ثانية.", 502)
