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
    + 'Format: a scroll-stopping hook (a specific number, a contrarian claim, or "the one mistake that...") '
    + '-> two short practical observations -> one caution or rule of thumb -> a genuine question. '
    + 'No hashtags, no markdown symbols, under 300 characters.',
  facebook: 'Purpose: stand completely on its own as useful native content — do not ask readers to tag, '
    + 'share, or comment as a command (Meta downranks explicit engagement-bait CTAs in 2026). '
    + 'Format: a practical promise -> 3-5 short numbered points or a short paragraph -> a one-line checklist to remember '
    + '-> end with a genuine question or a "save this" line, never a command to share/tag. '
    + '1-2 emojis max, still scannable. Never include a link in the Facebook draft.',
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

// 'Tag someone!' / 'Share with a friend' 류의 명령형 CTA는 Meta가 2026년 기준
// engagement bait로 분류해 노출을 깎는다 — 저장/질문 등 콘텐츠 자체 가치에서
// 자연스럽게 나오는 CTA만 사용한다 (공유/태그를 직접 명령하지 않음).
const FACEBOOK_CTAS = [
  'Save this before your trip. 🇰🇷',
  'What would you add to this list?',
  'Bookmark this for arrival day. ✈️',
  'Which of these did you already know?'
];

const INSTAGRAM_CLOSERS = [
  'Save this for your Korea trip.',
  'Keep this guide handy for arrival day.',
  'Save this before you land in Korea.'
];

const INSTAGRAM_HASHTAGS = '#KoreaTravel #SeoulTrip #KoreaTips #TravelKorea #VisitSeoul';

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

  if (platform === 'instagram') {
    const intro = sentences[0] || rawItem.content;
    const tip = sentences[1] || sentences[0] || rawItem.content;
    const closer = pick(INSTAGRAM_CLOSERS, seed);
    return [intro, tip, closer, INSTAGRAM_HASHTAGS].join('\n\n');
  }

  return rawItem.content.slice(0, 280);
};

/**
 * 수집된 원본 항목 하나를 "Land in Korea" 브랜드 톤의 플랫폼별 게시글 초안으로 큐레이션합니다.
 * GEMINI_API_KEY가 없으면 reshapeByTemplate으로 플랫폼별 구조를 다르게 재가공합니다(모의 모드가 아닌
 * 규칙 기반 재가공 — 두 플랫폼이 같은 문장을 그대로 반복하지 않습니다).
 */
const curateContent = async (rawItem, platforms = ['threads', 'facebook', 'instagram'], seed = 0) => {
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
