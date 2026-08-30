import os
import re
import time
import hmac
import hashlib
import random
import logging
from collections import deque

import requests
from flask import Flask, request, jsonify

try:
    from langdetect import detect
except ImportError:
    def detect(_x):
        return "ko"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("comment-auto-reply")

app = Flask(__name__)

ACCESS_TOKEN = os.getenv("ACCESS_TOKEN", "")           # Page/IG Graph API access token, used to actually post replies
APP_SECRET = os.getenv("APP_SECRET", "")               # Meta app secret, used to verify webhook signatures
VERIFY_TOKEN = os.getenv("VERIFY_TOKEN", "landinkorea_verify")
# 원문 SNS 글은 사람(Claude Code 세션)이 미리 써두는 방식으로 바꿨지만, 댓글 답장은 실시간으로
# 와야 해서 자동화가 계속 필요하다 — 유료 Claude API 대신 무료 티어가 있는 Gemini를 쓴다
# (2026-08-30 사용자 요청: 원문 작성 + 댓글 답장 둘 다 유료 API면 비용이 이중으로 나감).
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
GRAPH_API_BASE = os.getenv("GRAPH_API_BASE", "https://graph.facebook.com/v21.0")

BLOG_BASE = "https://solusupport-bot.github.io/desktop-tutorial/land-in-korea-blog/site"

# 실제 "Land in Korea" 콘텐츠(lib/ingestion/korea_travel.js)와 동일한 사실 기반 지식 베이스.
# 주제를 못 찾았을 때만 블로그 홈으로 안내하고, 답을 모르면서 뭉뚱그린 문구로 때우지 않는다.
KNOWLEDGE_BASE = {
    "esim": {
        "keywords": ["esim", "e-sim", "sim", "유심", "이심", "데이터", "wifi", "와이파이", "핫스팟"],
        "facts_ko": "한국 관광객용 eSIM은 출국 전 온라인 구매 후 도착해서 QR코드로 바로 활성화할 수 있어요(물리 유심 교체 불필요). 보통 5~8일 단위 요금제가 많고, 폰이 eSIM을 지원 안 하면 인천/김포 공항 도착장에서 유심이나 포켓 와이파이(에그)를 대여할 수 있어요. 에그는 사용 후 같은 공항 반납 카운터나 지정 반납함에 꼭 반납해야 연체료가 안 붙어요.",
        "facts_en": "Tourist eSIMs can be bought online before your trip and activated by QR code on arrival — no physical SIM swap. Plans usually run 5-8 days. If your phone doesn't support eSIM, physical SIM or pocket Wi-Fi rental counters are at Incheon/Gimpo arrivals — just return the Wi-Fi egg at the airport counter or a marked drop box to avoid a late fee.",
        "blog": f"{BLOG_BASE}/posts/korea-esim-comparison.html",
    },
    "tmoney": {
        "keywords": ["t-money", "tmoney", "티머니", "교통카드", "지하철카드", "transit card"],
        "facts_ko": "T-money는 편의점(GS25/CU/세븐일레븐)이나 지하철역 키오스크에서 구매하는 충전식 교통카드예요. 지하철/버스/일부 택시에서 다 쓸 수 있고, 환승 시간 내 지하철↔버스 환승하면 할인돼요. 남은 잔액은 출국 전 역 고객센터에서 소액 한도 내로 현금 환불 가능해요.",
        "facts_en": "T-money is a rechargeable transit card sold at convenience stores (GS25/CU/7-Eleven) or subway kiosks. It works on subway, buses, and many taxis, with discounted transfers within the transfer window. Unused balance under a small cap can be refunded in cash at a station counter before you leave.",
        "blog": f"{BLOG_BASE}/posts/tmoney-first-timer-mistake.html",
    },
    "tax_refund": {
        "keywords": ["tax free", "tax refund", "택스리펀", "세금환급", "부가세", "vat"],
        "facts_ko": "일정 금액 이상 Tax Free 가맹점에서 구매하면 부가세(VAT)를 환급받을 수 있어요. 계산할 때 Tax Free 영수증/서류를 꼭 받아두고, 물건은 미개봉 상태로 유지한 뒤 위탁수하물에 넣기 전에 공항 환급 키오스크나 카운터에서 처리해야 해요. 매장에 Tax Free 스티커가 있는지 결제 전에 확인하는 게 중요해요.",
        "facts_en": "Spend over the minimum threshold at Tax Free-affiliated stores and you can reclaim VAT. Get the Tax Free form at checkout, keep the item unused, and process the refund at an airport kiosk/counter before checking your luggage. Check for the Tax Free sticker at the register before you buy — not every store offers it.",
        "blog": f"{BLOG_BASE}/index.html",
    },
    "airport_transfer": {
        "keywords": ["incheon", "gimpo", "인천공항", "김포공항", "airport", "공항버스", "arex", "리무진"],
        "facts_ko": "인천/김포공항에서 서울 시내로는 AREX 공항철도가 가장 저렴하고 예측 가능해요. 짐이 많으면 리무진 버스가 숙소 근처에 내려주고, 심야에 도착하면 AREX 막차가 끊긴 시간일 수 있으니 정식 택시나 사전 예약한 전용 픽업을 이용하는 게 안전해요. 카카오T 앱으로 부르는 택시도 공항에서 잘 잡혀요.",
        "facts_en": "The AREX airport railway is the cheapest, most predictable way from Incheon/Gimpo into Seoul. Limousine buses are better if you have heavy luggage. If you land late at night after AREX stops running, a licensed airport taxi or a pre-booked private transfer is the safe option — Kakao T also works well at both airports.",
        "blog": f"{BLOG_BASE}/posts/incheon-airport-transfer-comparison.html",
    },
    "etiquette": {
        "keywords": ["etiquette", "예의", "매너", "실수", "mistake", "tip", "팁"],
        "facts_ko": "한국에서는 팁 문화가 없어서 오히려 직원을 당황하게 할 수 있어요. 카드나 현금은 한 손보다 두 손으로 건네는 게 더 공손하게 받아들여지고, 대중교통에서 큰 소리로 통화하는 건 눈총 받는 편이에요.",
        "facts_en": "Tipping isn't expected in Korea and can actually confuse staff. Passing money or a card with both hands (rather than one) reads as more polite, especially to older Koreans. Loud phone calls on public transit are frowned upon.",
        "blog": f"{BLOG_BASE}/index.html",
    },
    "currency": {
        "keywords": ["currency", "환전", "환율", "카드결제", "현금", "atm", "cash"],
        "facts_ko": "도시 지역은 카드 결제가 대부분 가능하지만, 전통시장이나 지방 일부는 현금만 받는 곳도 있어요. 해외카드는 'Global' 표시가 있는 ATM(우리·하나·세븐일레븐 등)에서 인출 가능하고, 카드 결제 시엔 원화(KRW)로 결제를 선택해야 해요 — 자국 통화로 결제하면 환전 수수료(DCC)가 더 붙어요.",
        "facts_en": "Most city businesses take card, though traditional markets and some rural spots are cash-only. Foreign cards work at ATMs marked 'Global' (Woori, KEB Hana, 7-Eleven). Always choose to be charged in Korean won, not your home currency — dynamic currency conversion adds a hidden markup.",
        "blog": f"{BLOG_BASE}/index.html",
    },
    "emergency": {
        "keywords": ["emergency", "응급", "병원", "약국", "pharmacy", "hospital", "112", "119"],
        "facts_ko": "경찰은 112, 화재·응급은 119로 전화하면 영어 지원이 돼요. 여행 관련 일반 문의는 1330 코리아 트래블 핫라인이 24시간 다국어로 도와줘요. 24시간 편의점은 흔하지만 24시간 약국은 드물어서, 초록색 십자가 간판을 찾거나 숙소 프런트에 문의하는 게 빨라요.",
        "facts_en": "Call 112 for police, 119 for fire/medical — both have English support. For general travel issues, the 1330 Korea Travel Hotline offers 24/7 multilingual help. 24-hour convenience stores are everywhere, but 24-hour pharmacies are rare — look for a green cross sign or ask your hotel front desk.",
        "blog": f"{BLOG_BASE}/index.html",
    },
    "apps": {
        "keywords": ["app", "앱", "naver map", "kakao map", "google map", "구글맵", "네이버맵", "카카오맵"],
        "facts_ko": "구글맵은 한국에서 길찾기 데이터가 부실해서 네이버맵이나 카카오맵이 훨씬 정확해요. 파파고는 메뉴판 카메라 번역까지 잘 되고, 카카오T는 택시 호출용으로 가장 많이 써요. 도착 전에 미리 다운받아 두는 걸 추천해요.",
        "facts_en": "Google Maps' local data is weak in Korea — Naver Map or KakaoMap work much better for walking/transit directions. Papago handles translation well, including camera translation for menus. Kakao T is the go-to app for calling taxis. Download these before you land.",
        "blog": f"{BLOG_BASE}/index.html",
    },
    "convenience_store": {
        "keywords": ["cu", "gs25", "seven eleven", "7-eleven", "편의점", "convenience store"],
        "facts_ko": "CU·GS25·세븐일레븐은 24시간 운영에 미니 약국·ATM·즉석식품 코너까지 갖추고 있어요. 공과금 납부나 택배 발송도 가능하고, 1+1·2+1 스티커는 실제 할인이니 확인해볼 만해요.",
        "facts_en": "CU, GS25, and 7-Eleven run 24/7 and double as a mini pharmacy, ATM, and hot-food counter. You can even pay bills or ship a parcel at some locations — and 1+1/2+1 stickers are real bundle discounts worth checking.",
        "blog": f"{BLOG_BASE}/index.html",
    },
    "weather": {
        "keywords": ["weather", "날씨", "패킹", "packing", "옷", "계절", "season"],
        "facts_ko": "여름(6~8월)은 덥고 습하고 장마가 껴서 가벼운 옷과 우산이 필요하고, 겨울(12~2월)은 건조하고 추워서 방한 레이어링이 중요해요. 실내 냉난방이 강해서 계절과 상관없이 겹쳐 입기 좋은 옷을 챙기는 게 실속 있어요.",
        "facts_en": "Summers (Jun-Aug) are hot, humid, and rainy — pack light clothing and an umbrella. Winters (Dec-Feb) are dry and cold, so proper layering matters. Indoor heating/AC runs strong year-round, so layers help regardless of season.",
        "blog": f"{BLOG_BASE}/index.html",
    },
    "luggage": {
        "keywords": ["luggage", "짐", "캐리어", "locker", "보관함", "storage"],
        "facts_ko": "지하철역 코인 로커는 주말·연휴엔 금방 차니 예비 계획이 필요해요. 명동·홍대 같은 주요 상권엔 종일 짐 보관 카운터도 있고, 숙소에 따라 체크아웃 후에도 무료로 맡아주는 곳이 있어요. 마지막 날 짐 없이 다니고 싶다면 당일 배송(포워딩) 서비스도 고려해볼 만해요.",
        "facts_en": "Subway coin lockers fill up fast on weekends and holidays. Major areas like Myeongdong and Hongdae have all-day luggage storage counters, and some hotels hold bags for free after checkout. Same-day luggage forwarding is worth it if you want your last day hands-free.",
        "blog": f"{BLOG_BASE}/index.html",
    },
}

PROCESSED_COMMENTS = set()
LAST_REPLY_BY_USER = {}
USER_COOLDOWN_SECONDS = 120  # 같은 사람이 짧은 시간 안에 여러 댓글을 달아도 과도하게 반복 응답하지 않도록
HOURLY_COUNT = deque()
HOURLY_LIMIT = 12  # Gemini/Graph API 호출 폭주 방지용 시간당 상한


def is_rate_limited():
    now = time.time()
    while HOURLY_COUNT and now - HOURLY_COUNT[0] > 3600:
        HOURLY_COUNT.popleft()
    return len(HOURLY_COUNT) >= HOURLY_LIMIT


def detect_language_safe(text):
    has_ko = bool(re.search(r"[가-힣]", text))
    has_en = bool(re.search(r"[a-zA-Z]", text))
    if has_ko and has_en:
        return "mixed"
    try:
        lang = detect(text)
        return "ko" if lang.startswith("ko") else "en"
    except Exception:
        return "ko" if has_ko else "en"


def find_matching_topics(text, limit=2):
    """댓글 텍스트에 등장하는 키워드로 실제로 관련된 주제만 찾는다. 모르면 빈 리스트를 반환한다."""
    lowered = text.lower()
    matches = []
    for topic_id, topic in KNOWLEDGE_BASE.items():
        if any(kw.lower() in lowered for kw in topic["keywords"]):
            matches.append(topic_id)
    return matches[:limit]


def build_fallback_reply(text, lang, matched_topics):
    if not matched_topics:
        # 아는 주제가 아니면 뭉뚱그려 답하지 않고, 블로그로 정직하게 안내한다.
        if lang == "en":
            return f"Good question — we don't have a quick answer cached for that one yet. Check {BLOG_BASE}/index.html for our full guides, or tell us a bit more and we'll look into it."
        return f"이 질문은 저희가 바로 답변드릴 자료가 아직 없네요. {BLOG_BASE}/index.html 에서 관련 가이드를 확인해보시거나, 조금 더 구체적으로 알려주시면 확인해볼게요."

    topic = KNOWLEDGE_BASE[matched_topics[0]]
    if lang == "en":
        return f"{topic['facts_en']} More detail here: {topic['blog']}"
    return f"{topic['facts_ko']} 더 자세한 내용은 여기서 확인하세요: {topic['blog']}"


def call_gemini(comment_text, lang, matched_topics):
    if not GEMINI_API_KEY:
        return build_fallback_reply(comment_text, lang, matched_topics)

    facts = [KNOWLEDGE_BASE[t]["facts_ko" if lang != "en" else "facts_en"] for t in matched_topics]
    facts_block = "\n".join(facts) if facts else "No specific fact matched — say so honestly and point to the blog instead of guessing."
    blog_url = KNOWLEDGE_BASE[matched_topics[0]]["blog"] if matched_topics else f"{BLOG_BASE}/index.html"

    system = (
        "You are the Land in Korea account replying to a real comment on our own post. "
        "Only use the facts given below — never invent details you're not given. "
        f"Facts you may use:\n{facts_block}\n"
        f"If relevant, you may mention this link once: {blog_url}\n"
        "Write 2 short sentences, no emoji, no hashtags, natural conversational tone, "
        "end with a genuine follow-up question about their trip."
    )
    try:
        resp = requests.post(
            f"{GEMINI_API_BASE}/models/{GEMINI_MODEL}:generateContent",
            params={"key": GEMINI_API_KEY},
            json={
                "system_instruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": comment_text}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 250},
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as exc:
        log.warning("Gemini 호출 실패, 사실 기반 폴백으로 대체: %s", exc)
        return build_fallback_reply(comment_text, lang, matched_topics)


def post_reply_to_meta(comment_id, message):
    """실제로 댓글에 답글을 게시한다. ACCESS_TOKEN이 없으면 안전하게 로그만 남기고 건너뛴다."""
    if not ACCESS_TOKEN:
        log.info("[dry-run, ACCESS_TOKEN 미설정] %s -> %s", comment_id, message)
        return None
    try:
        resp = requests.post(
            f"{GRAPH_API_BASE}/{comment_id}/replies",
            data={"message": message, "access_token": ACCESS_TOKEN},
            timeout=10,
        )
        if resp.status_code >= 400:
            log.error("답글 게시 실패 (%s): %s", resp.status_code, resp.text)
        else:
            log.info("답글 게시 완료: %s", comment_id)
        return resp
    except requests.RequestException as exc:
        log.error("답글 게시 중 네트워크 오류: %s", exc)
        return None


def verify_signature(raw_body, signature_header):
    """Meta 웹훅 요청이 실제로 Meta에서 온 것인지 X-Hub-Signature-256으로 검증한다."""
    if not APP_SECRET:
        log.warning("APP_SECRET이 설정되지 않아 서명 검증을 건너뜁니다 — 운영 환경에서는 반드시 설정하세요.")
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(APP_SECRET.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    provided = signature_header.split("sha256=", 1)[1]
    return hmac.compare_digest(expected, provided)


@app.route("/webhook", methods=["GET", "POST"])
def webhook():
    if request.method == "GET":
        if request.args.get("hub.mode") == "subscribe" and request.args.get("hub.verify_token") == VERIFY_TOKEN:
            return request.args.get("hub.challenge"), 200
        return "fail", 403

    if not verify_signature(request.get_data(), request.headers.get("X-Hub-Signature-256")):
        return jsonify({"status": "invalid_signature"}), 403

    data = request.json or {}
    if is_rate_limited():
        return jsonify({"status": "rate_limited"}), 200

    for entry in data.get("entry", []):
        for change in entry.get("changes", []):
            val = change.get("value", {})
            comment_id = val.get("id") or val.get("comment_id")
            text = val.get("text") or val.get("message", "")
            commenter_id = (val.get("from") or {}).get("id", "unknown")

            if not comment_id or not text or comment_id in PROCESSED_COMMENTS:
                continue

            last_reply_time = LAST_REPLY_BY_USER.get(commenter_id, 0)
            if time.time() - last_reply_time < USER_COOLDOWN_SECONDS:
                log.info("쿨다운 중인 사용자, 건너뜀: %s", commenter_id)
                continue

            lang = detect_language_safe(text)
            matched_topics = find_matching_topics(text)
            reply = call_gemini(text, lang, matched_topics)

            post_reply_to_meta(comment_id, reply)

            PROCESSED_COMMENTS.add(comment_id)
            LAST_REPLY_BY_USER[commenter_id] = time.time()
            HOURLY_COUNT.append(time.time())

    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
