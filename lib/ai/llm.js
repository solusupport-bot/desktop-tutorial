// SNS 캡션(curate.js)·주제 생성·품질 게이트가 공용으로 쓰는 LLM 호출 헬퍼입니다.
// 2026-09-24: Anthropic·OpenAI·Gemini 크레딧이 모두 소진돼 Groq 무료 등급(OpenAI 호환 API)으로
// 옮겼다. "JSON만 응답하라"는 프롬프트 계약은 그대로다. GROQ_API_KEY가 없으면 null을 반환해
// 호출부가 기존 규칙 기반 템플릿으로 폴백하도록 합니다.
const MODEL = process.env.GROQ_WRITER_MODEL || 'openai/gpt-oss-120b';

const askAIForJSON = async (prompt) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      // ponytail: 무료 등급은 요청 1건의 입력+max_tokens가 분당 8,000토큰을 넘으면 거절한다 — 긴 글이 필요해지면 유료 등급이나 다른 제공자로.
      max_tokens: 5000,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Groq 호출 실패: ${json.error?.message || res.status}`);
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq 응답에 본문이 없습니다.');
  // 2026-09-17 실측: 모델이 가끔 싱글/트리플 백틱으로 감싸서 응답한다 — 앞뒤로 벗겨낸다.
  return JSON.parse(text.trim().replace(/^`+/, '').replace(/^json\s*/i, '').replace(/`+$/, '').trim());
};

module.exports = { askAIForJSON };
