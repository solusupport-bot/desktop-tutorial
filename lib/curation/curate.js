const { GoogleGenerativeAI } = require('@google/generative-ai');
const log = require('../logger');

// "Land in Korea" — 외국인 인바운드 관광객 대상 영어 콘텐츠.
// 주제 범위는 CARD_DESIGN_SPEC.md 기준: eSIM, T-money(교통카드), 세금환급, 관광경보 등
// 한국 첫 방문/체류에 실질적으로 필요한 실용 정보. 제휴처: Klook, Trip.com, GetYourGuide.
const BRAND_TOPICS = [
  'eSIM & mobile data for Korea',
  'T-money transit card (subway/bus/taxi)',
  'Tax refund (Tax Free) shopping for tourists',
  'Travel advisories & safety notices',
  'Airport transfer options (ICN/GMP)',
  'First-timer etiquette & common mistakes'
];

const PLATFORM_GUIDE = {
  threads: 'Purpose: turn a real first-timer friction point into a short useful exchange. '
    + 'Format: friction/first-timer hook -> two short practical observations -> one caution or rule of thumb -> a genuine question. '
    + 'No hashtags, no markdown symbols, under 300 characters.',
  facebook: 'Purpose: explain practical context and invite a save/share/helpful comment. '
    + 'Format: a practical promise -> 3-5 short numbered points or a short paragraph -> a one-line checklist to remember -> save/share/question CTA. '
    + '1-2 emojis max, still scannable.',
  instagram: 'Purpose: a visual guide people save and share. '
    + 'Format: punchy first line -> one clear tip -> save-worthy closer. End with 5 relevant hashtags (e.g. #KoreaTravel #SeoulTrip).'
};

const splitSentences = (text) => (text.match(/[^.!?]+[.!?]*/g) || [text])
  .map((s) => s.trim())
  .filter(Boolean);

const THREADS_QUESTIONS = [
  'Anyone else run into this on their first trip?',
  'What would you add for someone landing tomorrow?',
  'Worth knowing before you land?',
  'Did this trip you up your first time too?'
];

const FACEBOOK_CTAS = [
  'Save this before your trip. 🇰🇷',
  'Tag someone planning their first visit to Korea!',
  'Bookmark this for arrival day. ✈️',
  'Share this with a friend who\'s heading to Korea soon.'
];

const pick = (arr, seed) => arr[seed % arr.length];

/**
 * GEMINI_API_KEY 없이도 같은 원본을 플랫폼 특성에 맞게 서로 다른 구조로 재가공합니다.
 * Threads: 훅 문장 + 핵심 디테일 1개 + 질문형 CTA (대화 유도, 300자 이내)
 * Facebook: 도입 문장 + 번호 목록 + CTA (저장/공유 유도, 스캔하기 쉬운 형태)
 * seed는 같은 주제가 반복될 때 훅/CTA 문구가 겹치지 않도록 회전시키는 값입니다.
 */
const reshapeByTemplate = (rawItem, platform, seed = 0) => {
  const sentences = splitSentences(rawItem.content);

  if (platform === 'threads') {
    const hook = sentences[0] || rawItem.content;
    const detail = sentences[1] || '';
    const question = pick(THREADS_QUESTIONS, seed);
    const suffix = ` ${question}`;
    let base = [hook, detail].filter(Boolean).join(' ').trim();
    const maxBase = 280 - suffix.length;
    if (base.length > maxBase) base = `${base.slice(0, Math.max(0, maxBase - 3))}...`;
    return `${base}${suffix}`.trim();
  }

  if (platform === 'facebook') {
    const intro = sentences[0] || rawItem.content;
    const points = sentences.slice(1, 4);
    const bullets = points.length
      ? points.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '';
    const cta = pick(FACEBOOK_CTAS, seed);
    return [intro, bullets, cta].filter(Boolean).join('\n\n');
  }

  // instagram 등 그 외 플랫폼은 원문을 안전 길이로 축약
  return rawItem.content.slice(0, 280);
};

/**
 * 수집된 원본 항목 하나를 "Land in Korea" 브랜드 톤의 플랫폼별 게시글 초안으로 큐레이션합니다.
 * GEMINI_API_KEY가 없으면 reshapeByTemplate으로 플랫폼별 구조를 다르게 재가공합니다(모의 모드가 아닌
 * 규칙 기반 재가공 — 두 플랫폼이 같은 문장을 그대로 반복하지 않습니다).
 */
const curateContent = async (rawItem, platforms = ['threads', 'facebook'], seed = 0) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    log.warn('GEMINI_API_KEY가 없어 규칙 기반(템플릿) 재가공을 수행합니다.');
    const fallback = {};
    platforms.forEach((p) => { fallback[p] = reshapeByTemplate(rawItem, p, seed); });
    return fallback;
  }

  const guide = platforms.map((p) => `- ${p}: ${PLATFORM_GUIDE[p] || 'Write naturally.'}`).join('\n');
  const prompt = `You run "Land in Korea", an English-language social account helping first-time visitors and foreign residents navigate practical life in Korea. Write platform-specific post drafts based on the source material below.

[Brand topic focus — stay within these unless the source clearly fits one]
${BRAND_TOPICS.map((t) => `- ${t}`).join('\n')}

[Source material]
Source: ${rawItem.source} / @${rawItem.author}
Content: ${rawItem.content}
Link: ${rawItem.url}

[Platform guides]
${guide}

Respond ONLY with this JSON shape (no explanation, no code fences):
{${platforms.map((p) => `"${p}": "..."`).join(', ')}}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.startChat({ history: [] }).sendMessage(prompt);
    const text = result.response.text().trim().replace(/^```json\s*|```$/g, '');
    const parsed = JSON.parse(text);
    log.ok('Gemini 큐레이션 완료');
    return parsed;
  } catch (err) {
    log.err(`Gemini 큐레이션 실패: ${err.message}. 템플릿 재가공으로 대체합니다.`);
    const fallback = {};
    platforms.forEach((p) => { fallback[p] = reshapeByTemplate(rawItem, p, seed); });
    return fallback;
  }
};

module.exports = { curateContent, reshapeByTemplate };
