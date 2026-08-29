const Anthropic = require('@anthropic-ai/sdk');

// SNS 캡션(curate.js)과 블로그 글(sync-blog-posts.js)이 공용으로 쓰는 Claude 호출 헬퍼입니다.
// 기존 Gemini 경로와 동일하게 "JSON만 응답하라"는 프롬프트 계약을 그대로 쓰고, 코드
// 펜스만 벗겨서 파싱합니다. ANTHROPIC_API_KEY가 없으면 null을 반환해 호출부가 기존
// 규칙 기반 템플릿으로 폴백하도록 합니다.
const askClaudeForJSON = async (prompt) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }]
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('Claude 응답에 텍스트 블록이 없습니다.');
  }
  const text = textBlock.text.trim().replace(/^```json\s*|```$/g, '');
  return JSON.parse(text);
};

module.exports = { askClaudeForJSON };
