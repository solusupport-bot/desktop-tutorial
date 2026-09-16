const { GoogleGenerativeAI } = require('@google/generative-ai');

// lib/ai/claude.js(askClaudeForJSON)와 동일한 "JSON만 응답하라" 프롬프트 계약을
// 쓰는 Gemini 버전. 콘텐츠를 생성하는 AI(Claude)와 검증하는 AI(Gemini)를 다르게
// 둬서 자기검증 편향을 피한다(lib/scheduler/quality_gate.js가 이걸 씀). 이미
// package.json에 있던 의존성(@google/generative-ai)을 처음으로 실제 호출한다
// (PARALLELIZATION_RISKS.md 3장에서 미리 짚어둔 확장 지점). GEMINI_API_KEY가
// 없으면 null을 반환해 호출부가 "검증 스킵 -> 기존처럼 사람 검수"로 폴백하게 한다.
const askGeminiForJSON = async (prompt) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim().replace(/^```json\s*|```$/g, '');
  return JSON.parse(text);
};

module.exports = { askGeminiForJSON };
