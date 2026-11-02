"""User-facing messages in Arabic (Saudi) and English. The frontend sends its language in the X-Lang header."""
from fastapi import Request

MESSAGES = {
    "bad_key": ("فيه مشكلة في إعدادات التطبيق. كلمي المسؤول عنه.",
                "There's a problem with the app's settings. Please contact the app owner."),
    "timeout": ("هنو طوّلت في الرد. جربي مرة ثانية بعد شوي.",
                "Hanu took too long to reply. Please try again shortly."),
    "rate_limit": ("فيه زحمة على الخدمة الحين. انتظري دقيقة وجربي مرة ثانية.",
                   "The service is busy right now. Wait a minute and try again."),
    "no_credit": ("رصيد خدمة الذكاء الاصطناعي خلص. كلمي المسؤول عن التطبيق.",
                  "The AI service has run out of credit. Please contact the app owner."),
    "unavailable": ("خدمة Llama واقفة الحين. جربي بعد شوي.",
                    "The Llama service is down right now. Please try again shortly."),
    "connection": ("ما قدرنا نوصل لـ Llama. تأكدي من النت وجربي مرة ثانية.",
                   "We couldn't reach Llama. Check your connection and try again."),
    "not_configured": ("التطبيق مو جاهز: مفتاح Llama ناقص.",
                       "The app isn't set up yet: the Llama key is missing."),
    "incomplete": ("رد هنو طلع ناقص. جربي مرة ثانية.",
                   "Hanu's reply came back incomplete. Please try again."),
    "bad_image": ("الصورة لازم تكون JPG أو PNG وحجمها أقل من 4 ميقا.",
                  "The photo must be a JPG or PNG under 4 MB."),
    "bad_input": ("عبّي الخانات المطلوبة صح لو سمحتي.",
                  "Please fill in the required fields correctly."),
    "no_products": ("ما لقينا منتجات مكياج في الصورة. جربي صورة أوضح يبان فيها اسم المنتج.",
                    "We couldn't find makeup products in the photo. Try a clearer one that shows the product name."),
    "empty_question": ("اكتبي سؤالك أو حطي صورة المنتج.",
                       "Type your question or add a photo of the product."),
}


def request_lang(request: Request) -> str:
    return "en" if request.headers.get("x-lang", "").lower() == "en" else "ar"


def msg(key: str, lang: str) -> str:
    ar, en = MESSAGES[key]
    return en if lang == "en" else ar
