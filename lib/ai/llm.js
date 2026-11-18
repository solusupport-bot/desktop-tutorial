// SNS 캡션(curate.js)·품질 게이트·주제 생성·댓글 초안이 공용으로 쓰는 LLM 호출 헬퍼입니다.
// 2026-09-24: Anthropic·OpenAI·Gemini 크레딧이 모두 소진돼 Groq 무료 등급(OpenAI 호환 API)으로
// 옮겼다. "JSON만 응답하라"는 프롬프트 계약은 그대로다.
//
// 2026-11-18 실측: Groq 무료 일일 한도(20만 토큰)가 캡션 생성 호출만으로 하루 중 자주
// 바닥나서(translate.js의 번역 폴백과 같은 근본 원인), 막힐 때마다 바로 규칙 기반
// 템플릿(reshapeByTemplate)으로 떨어지고 있었다. Groq가 실패하면 포기하기 전에
// Cloudflare Workers AI(media_guard.js/translate.js가 이미 쓰는, 완전히 별개의 무료
// 쿼터)를 한 번 더 시도한다 — 모델이 작아 품질은 Groq보다 살짝 떨어질 수 있지만,
// 하드코딩 템플릿보다는 훨씬 낫다. 둘 다 없거나 둘 다 실패하면 기존과 똑같이
// null/에러를 돌려줘서 호출부가 그대로 자기 폴백을 타게 한다.
const log = require('../logger');

const GROQ_MODEL = process.env.GROQ_WRITER_MODEL || 'openai/gpt-oss-120b';
const CF_TEXT_MODEL = process.env.CLOUDFLARE_TEXT_MODEL || '@cf/meta/llama-3.1-8b-instruct';

// 2026-11-18 실측 버그: Cloudflare 응답(json.result?.response)이 문자열이 아니라
// 객체로 올 때가 있어(모델이 response_format 없이도 가끔 구조화된 형태로 답함)
// String()이 "[object Object]"로 뭉개버려 JSON.parse가 항상 실패했다 — 객체면
// 그대로 쓴다(이미 파싱된 결과이므로 재파싱 불필요).
const parseJSONResponse = (text) => {
  if (text && typeof text === 'object') return text;
  return JSON.parse(String(text || '').trim()
    .replace(/^```+\w*\s*/, '').replace(/^json\s*/i, '').replace(/```+$/, '').trim());
};

const askGroqForJSON = async (prompt) => {
  // 2026-10-13: 무료 등급 분당 8,000토큰 한도에 글 작성 직후 게이트 호출이 자주 걸렸다(run-local.log 실측 429).
  // 한도 초과면 Groq가 알려주는 retry-after만큼 쉬고 최대 3번 다시 시도한다 — 모든 호출부에 한 번에 적용된다.
  let res;
  let json;
  for (let attempt = 1; ; attempt += 1) {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        // ponytail: 무료 등급은 요청 1건의 입력+max_tokens가 분당 8,000토큰을 넘으면 거절한다 — 긴 글이 필요해지면 유료 등급이나 다른 제공자로.
        max_tokens: 5000,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    });
    json = await res.json();
    const waitSec = Number(res.headers.get('retry-after'));
    if (res.status !== 429 || attempt > 3 || !waitSec) break;
    await new Promise((r) => setTimeout(r, Math.min(waitSec + 1, 65) * 1000));
  }
  if (!res.ok) throw new Error(`Groq 호출 실패: ${json.error?.message || res.status}`);
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq 응답에 본문이 없습니다.');
  // 2026-09-17 실측: 모델이 가끔 싱글/트리플 백틱으로 감싸서 응답한다 — 앞뒤로 벗겨낸다.
  return parseJSONResponse(text);
};

const askCloudflareForJSON = async (prompt) => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return null;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CF_TEXT_MODEL}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // 2026-11-18 실측 버그: curate.js의 8플랫폼 캡션 프롬프트처럼 응답이 긴 경우
        // Workers AI 기본 max_tokens(256)에 걸려 JSON이 중간에 잘려 "Unterminated
        // string in JSON"으로 매번 파싱 실패했다 — Groq(max_tokens:5000)와 맞춘다.
        max_tokens: 5000,
        messages: [{ role: 'user', content: `${prompt}\n\nRespond with ONLY the JSON object, no markdown fences, no explanation.` }]
      })
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Cloudflare 호출 실패: ${json.errors?.[0]?.message || res.status}`);
  return parseJSONResponse(json.result?.response);
};

const askAIForJSON = async (prompt) => {
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  if (hasGroq) {
    try {
      return await askGroqForJSON(prompt);
    } catch (err) {
      log.warn(`Groq 호출 실패, Cloudflare로 폴백: ${err.message}`);
    }
  }
  try {
    const cf = await askCloudflareForJSON(prompt);
    if (cf) return cf;
  } catch (err) {
    log.warn(`Cloudflare 호출도 실패: ${err.message}`);
  }
  if (!hasGroq) return null;
  throw new Error('Groq와 Cloudflare 둘 다 실패했습니다.');
};

module.exports = { askAIForJSON, askCloudflareForJSON };
