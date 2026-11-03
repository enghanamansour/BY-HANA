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
    """An error that is safe to show to the user: a message key from i18n.py and the HTTP status to return."""

    def __init__(self, key: str, status: int = 502):
        super().__init__(key)
        self.key = key
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
            extra_body={"provider": {"sort": "throughput"}},  # OpenRouter: route to the fastest Llama host
        )
    except openai.AuthenticationError:
        raise LlamaError("bad_key", 500)
    except openai.APITimeoutError:
        raise LlamaError("timeout", 504)
    except openai.RateLimitError:
        raise LlamaError("rate_limit", 429)
    except openai.APIStatusError as e:
        log.warning("Llama provider error %s: %s", e.status_code, e.message)
        if e.status_code == 402:
            raise LlamaError("no_credit", 503)
        raise LlamaError("unavailable", 503)
    except openai.APIConnectionError:
        raise LlamaError("connection", 503)

    content = response.choices[0].message.content if response.choices else None
    if not content or not content.strip():
        raise ValueError("empty reply")
    return content


def _ask_json(schema: type[T], model: str, system: str, user: str | list, max_tokens: int = 2000,
              history: list[dict] | None = None) -> T:
    """Send a prompt, and keep only a reply that matches `schema`. Retries once with the exact error."""
    if not config.LLM_API_KEY:
        raise LlamaError("not_configured", 500)

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

    raise LlamaError("incomplete", 502)


def _with_image(text: str, image: str) -> list[dict]:
    return [{"type": "text", "text": text}, {"type": "image_url", "image_url": {"url": image}}]


def generate_look(req: LookRequest, weather=None) -> LlamaLook:
    return _ask_json(LlamaLook, config.LLAMA_MODEL, LOOK_PROMPT, build_look_prompt(req, weather))


def scan_products(image: str) -> ScanResult:
    return _ask_json(ScanResult, config.LLAMA_VISION_MODEL, SCAN_PROMPT,
                     _with_image("List the products in this photo.", image), max_tokens=800)


def ask_product(question: str, image: str | None, history: list[ChatTurn] = (),
                owned: list[OwnedProduct] = (), lang: str = "ar") -> AskAnswer:
    text = build_ask_prompt(question, image is not None, list(owned), lang)
    past = [t.model_dump() for t in history]  # earlier chat turns, as plain text
    if image:
        return _ask_json(AskAnswer, config.LLAMA_VISION_MODEL, ASK_PROMPT, _with_image(text, image), 900, past)
    return _ask_json(AskAnswer, config.LLAMA_MODEL, ASK_PROMPT, text, 900, past)


SAUDI_PROMPT = (
    "أنت تعيد صياغة النصوص باللهجة السعودية البيضاء، بأسلوب بنت سعودية تكلم صديقتها عن المكياج. "
    "حافظ على المعنى بالضبط، ولا تضف ولا تحذف معلومات. "
    "اترك أسماء المنتجات والماركات والمكونات والكلمات الإنجليزية كما هي. "
    "ممنوع الفصحى: قل تدورين بدل تبحثين، تلقين بدل تجدين، أحسن بدل يُفضل، مرة بدل جداً، كذا بدل هكذا، وش بدل ماذا. "
    "أرجع النص المعاد صياغته فقط، بدون مقدمة ولا شرح ولا علامات تنصيص.\n\n"
    "مثال:\nالنص: إذا كنتِ تبحثين عن برايمر مائي فمن الأفضل أن تقرئي المكونات، فإن وجدتِ water في البداية فهو مائي.\n"
    "الصياغة: إذا تدورين برايمر مائي أحسن شي تقرين المكونات، لو لقيتي water بأول القائمة يعني مائي."
)


def to_saudi(text: str) -> str | None:
    """Rewrite one Arabic text in Saudi dialect with ALLaM. Returns None on any failure, so the caller keeps Llama's text."""
    if not config.ALLAM_API_KEY or not text:
        return None
    try:
        response = OpenAI(api_key=config.ALLAM_API_KEY, base_url=config.ALLAM_BASE_URL,
                          timeout=config.ALLAM_TIMEOUT, max_retries=0).chat.completions.create(
            model=config.ALLAM_MODEL, max_tokens=600, temperature=0.3,
            messages=[{"role": "system", "content": SAUDI_PROMPT}, {"role": "user", "content": text}])
        out = (response.choices[0].message.content or "").strip().strip('"«»')
    except Exception as exc:  # ALLaM is a bonus: never let it break the answer
        log.warning("ALLaM failed, keeping Llama's text: %s", exc)
        return None
    # Reject replies that drifted: no Arabic, or far shorter/longer than the original.
    if not re.search(r"[؀-ۿ]", out) or not 0.5 <= len(out) / len(text) <= 1.8:
        log.warning("ALLaM reply rejected (length %d vs %d)", len(out), len(text))
        return None
    return out
