const { GoogleGenerativeAI } = require('@google/generative-ai');
const log = require('../logger');

const PLATFORM_GUIDE = {
  threads: '해시태그 없이, **같은 마크다운 기호 없이, 다정한 반말 톤으로 300자 이내.',
  facebook: '조금 더 설명적인 문단 형태로 작성하고, 이모지는 1~2개만 사용.',
  instagram: '짧고 임팩트 있는 첫 문장으로 시작하고, 마지막 줄에 관련 해시태그 5개를 붙일 것.'
};

/**
 * 수집된 원본 트렌드 항목 하나를 플랫폼별 게시글 초안으로 큐레이션합니다.
 * GEMINI_API_KEY가 없으면 원문을 요약 없이 그대로 잘라 반환합니다(모의 모드).
 */
const curateContent = async (rawItem, platforms = ['threads', 'facebook', 'instagram']) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    log.warn('GEMINI_API_KEY가 없어 원문을 그대로 사용하는 모의 큐레이션을 수행합니다.');
    const fallback = {};
    platforms.forEach((p) => { fallback[p] = rawItem.content.slice(0, 280); });
    return fallback;
  }

  const guide = platforms.map((p) => `- ${p}: ${PLATFORM_GUIDE[p] || '자유롭게 작성.'}`).join('\n');
  const prompt = `너는 AI 트렌드를 소개하는 한국어 SNS 채널 운영자야. 아래 원문을 바탕으로 플랫폼별 게시글 초안을 작성해.

[원문]
출처: ${rawItem.source} / @${rawItem.author}
내용: ${rawItem.content}
링크: ${rawItem.url}

[플랫폼별 작성 가이드]
${guide}

반드시 아래 JSON 형식으로만 응답해 (설명 문구, 코드블록 금지):
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
