const { askGeminiForJSON } = require('../ai/gemini');

// 2026-09-17 사용자 요청("하나씩 임무를 다하면 검증자가 필요", "나는 자동화가
// 목표"): queueOneTopic이 캡션을 만들고 나면(콘텐츠를 만든 AI는 Claude),
// 전혀 다른 AI(Gemini)에게 "이대로 발행해도 되는지"를 한 번 더 물어 자기검증
// 편향을 피한다. 통과하면 queue_topic.js가 그 배치를 approved:true로 등록해
// 사람 검수 단계를 건너뛰고(자동화), 실패하거나 GEMINI_API_KEY가 없으면 기존
// 그대로 approved:false로 남아 사람이 /review에서 본다(안전한 기본값 유지).
const QUALITY_PROMPT = (topic, captionSample) => `당신은 한국 여행 SNS 계정의 발행 전 마지막 품질 검수자입니다.
아래는 "${topic}" 주제로 자동 생성된 캡션입니다. 이 캡션을 그대로 발행해도 좋을지 판단하세요.

[캡션]
${captionSample}

판단 기준:
- 위에서 말한 "${topic}" 주제와 실제로 관련 있는 내용인가(엉뚱한 주제로 새지 않았는가)
- 문장이 자연스럽고 완성돼 있는가(끊기거나 반복되거나 깨진 텍스트가 없는가)
- 가격/시간/운영 여부 등 구체적 사실 주장이 과장되거나 의심스럽지 않은가
- 여행 콘텐츠로서 최소한의 유용성이 있는가

아래 JSON 형식으로만 응답하세요(설명 없이):
{ "pass": true 또는 false, "reason": "판단 이유 한 문장" }`;

/**
 * 주제 하나(배치 전체가 공유하는 대표 캡션)에 대해 발행 가능 여부를 판단한다.
 * GEMINI_API_KEY가 없으면 null(검증 스킵) — 호출부가 기존처럼 사람 검수로 둔다.
 * Gemini 호출 자체가 실패하면 안전하게 pass:false로 처리한다(fail closed).
 */
const runQualityGate = async (topic, captionSample) => {
  if (!captionSample) return null;
  try {
    const result = await askGeminiForJSON(QUALITY_PROMPT(topic, captionSample));
    if (!result) return null;
    return { pass: result.pass === true, reason: result.reason || '', model: 'gemini', checkedAt: new Date().toISOString() };
  } catch (err) {
    return { pass: false, reason: `검증 호출 실패: ${err.message}`, model: 'gemini', checkedAt: new Date().toISOString() };
  }
};

module.exports = { runQualityGate };
