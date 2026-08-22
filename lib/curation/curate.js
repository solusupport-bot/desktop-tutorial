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
  threads: 'Casual, friendly English, no hashtags, no markdown symbols, under 300 characters. One clear practical tip.',
  facebook: 'Slightly more descriptive paragraph, 1-2 emojis max, still practical and scannable.',
  instagram: 'Punchy first line, end with 5 relevant hashtags (e.g. #KoreaTravel #SeoulTrip).'
};

/**
 * 수집된 원본 항목 하나를 "Land in Korea" 브랜드 톤의 플랫폼별 게시글 초안으로 큐레이션합니다.
 * GEMINI_API_KEY가 없으면 원문을 요약 없이 그대로 잘라 반환합니다(모의 모드).
 */
const curateContent = async (rawItem, platforms = ['threads', 'facebook']) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    log.warn('GEMINI_API_KEY가 없어 원문을 그대로 사용하는 모의 큐레이션을 수행합니다.');
    const fallback = {};
    platforms.forEach((p) => { fallback[p] = rawItem.content.slice(0, 280); });
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
    log.err(`Gemini 큐레이션 실패: ${err.message}. 원문 fallback을 사용합니다.`);
    const fallback = {};
    platforms.forEach((p) => { fallback[p] = rawItem.content.slice(0, 280); });
    return fallback;
  }
};

module.exports = { curateContent };
