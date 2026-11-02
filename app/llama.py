"""Talks to Llama and turns its replies into validated objects, or raises a clear LlamaError."""
import json
import logging
import re
from typing import TypeVar

import openai
from openai import OpenAI
from pydantic import BaseModel, ValidationError

from . import config
from .prompts import ASK_PROMPT, LOOK_PROMPT, SCAN_PROMPT, build_ask_prompt, build_look_prompt
from .schemas import AskAnswer, ChatTurn, LlamaLook, LookRequest, OwnedProduct, ScanResult

log = logging.getLogger("by-hana.llama")
T = TypeVar("T", bound=BaseModel)


class LlamaError(Exception):
    """An error that is safe to show to the user, with the HTTP status the API should return."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


_client = OpenAI(api_key=config.LLM_API_KEY or "missing", base_url=config.LLM_BASE_URL,
                 timeout=config.LLM_TIMEOUT, max_retries=0)


# Llama sometimes slips Cyrillic letters into Arabic words ("سيликوني"). Map them back to Arabic.
_CYRILLIC_TO_ARABIC = str.maketrans({
    "и": "ي", "й": "ي", "ы": "ي", "е": "ي", "л": "ل", "к": "ك", "о": "و", "у": "و", "н": "ن", "а": "ا",
    "р": "ر", "т": "ت", "с": "س", "м": "م", "д": "د", "в": "ف", "ф": "ف", "б": "ب", "п": "ب", "з": "ز",
    "г": "ج", "х": "خ", "ш": "ش", "ч": "ش", "я": "يا", "ю": "يو", "ь": "", "ъ": "",
})


def _escape_inner_quotes(raw: str) -> str:
    """Escape quotes Llama puts inside a string, e.g. "روج "مطفي" ثابت". A quote only closes a string
    when the next non-space character is JSON punctuation (, : } ]); any other quote is part of the text."""
    out, in_str, i = [], False, 0
    while i < len(raw):
        ch = raw[i]
        if ch == "\\" and in_str:
            out.append(raw[i:i + 2])
            i += 2
            continue
        if ch == '"':
            if not in_str:
                in_str = True
            else:
                rest = raw[i + 1:].lstrip()
                if not rest or rest[0] in ",:}]":
                    in_str = False
                else:
                    out.append('\\"')
                    i += 1
                    continue
        out.append(ch)
        i += 1
    return "".join(out)


def _extract_json(text: str) -> dict:
    """Llama sometimes wraps JSON in ```json fences or adds a sentence; keep only the {...} object."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON object in reply")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return json.loads(_escape_inner_quotes(match.group(0)))


def _call_llama(model: str, messages: list[dict], max_tokens: int) -> str:
    try:
        response = _client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.6,
            max_tokens=max_tokens,
        )
    except openai.AuthenticationError:
        raise LlamaError("فيه مشكلة في إعدادات التطبيق. كلمي المسؤول عنه.", 500)
    except openai.APITimeoutError:
        raise LlamaError("هنو طوّلت في الرد. جربي مرة ثانية بعد شوي.", 504)
    except openai.RateLimitError:
        raise LlamaError("فيه زحمة على الخدمة الحين. انتظري دقيقة وجربي مرة ثانية.", 429)
    except openai.APIStatusError as e:
        log.warning("Llama provider error %s: %s", e.status_code, e.message)
        if e.status_code == 402:
            raise LlamaError("رصيد خدمة الذكاء الاصطناعي خلص. كلمي المسؤول عن التطبيق.", 503)
        raise LlamaError("خدمة Llama واقفة الحين. جربي بعد شوي.", 503)
    except openai.APIConnectionError:
        raise LlamaError("ما قدرنا نوصل لـ Llama. تأكدي من النت وجربي مرة ثانية.", 503)

    content = response.choices[0].message.content if response.choices else None
    if not content or not content.strip():
        raise ValueError("empty reply")
    return content


def _ask_json(schema: type[T], model: str, system: str, user: str | list, max_tokens: int = 2000,
              history: list[dict] | None = None) -> T:
    """Send a prompt, and keep only a reply that matches `schema`. Retries once with the exact error."""
    if not config.LLM_API_KEY:
        raise LlamaError("التطبيق مو جاهز: مفتاح Llama ناقص.", 500)

    messages = [{"role": "system", "content": system}, *(history or []), {"role": "user", "content": user}]
    for attempt in range(config.LLM_MAX_RETRIES + 1):
        try:
            content = _call_llama(model, messages, max_tokens).translate(_CYRILLIC_TO_ARABIC)
            return schema.model_validate(_extract_json(content))
        except (ValueError, ValidationError) as e:
            log.warning("Invalid Llama reply (attempt %d): %s", attempt + 1, e)
            if attempt < config.LLM_MAX_RETRIES:
                messages.append({"role": "user", "content":
                                 f"Your previous reply was not valid ({str(e)[:300]}). "
                                 "Return ONLY the JSON object with the exact shape requested."})

    raise LlamaError("رد هنو طلع ناقص. جربي مرة ثانية.", 502)


def _with_image(text: str, image: str) -> list[dict]:
    return [{"type": "text", "text": text}, {"type": "image_url", "image_url": {"url": image}}]


def generate_look(req: LookRequest) -> LlamaLook:
    return _ask_json(LlamaLook, config.LLAMA_MODEL, LOOK_PROMPT, build_look_prompt(req))


def scan_products(image: str) -> ScanResult:
    return _ask_json(ScanResult, config.LLAMA_VISION_MODEL, SCAN_PROMPT,
                     _with_image("List the products in this photo.", image), max_tokens=800)


def ask_product(question: str, image: str | None, history: list[ChatTurn] = (),
                owned: list[OwnedProduct] = ()) -> AskAnswer:
    text = build_ask_prompt(question, image is not None, list(owned))
    past = [t.model_dump() for t in history]  # earlier chat turns, as plain text
    if image:
        return _ask_json(AskAnswer, config.LLAMA_VISION_MODEL, ASK_PROMPT, _with_image(text, image), 900, past)
    return _ask_json(AskAnswer, config.LLAMA_MODEL, ASK_PROMPT, text, 900, past)
