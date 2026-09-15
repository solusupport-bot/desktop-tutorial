// "경쟁/벤치마킹 계정 구조 분석" — Apify/Whisper 없이, 참고하고 싶은 게시물의
// 캡션 텍스트를 직접 붙여넣으면 훅 유형·구조·재사용 가능한 템플릿을 뽑아준다.
// lib/ai/claude.js의 askClaudeForJSON을 그대로 재사용(curate.js와 동일 헬퍼) —
// ANTHROPIC_API_KEY가 없으면 null이 돌아오므로 그 경우를 안내 메시지로 처리한다.
const express = require('express');
const { page, escapeHtml, withAccount } = require('../lib/layout');
const { askClaudeForJSON } = require('../../lib/ai/claude');

const router = express.Router();

const ANALYSIS_PROMPT = (caption) => `다음은 다른 계정의 게시물 캡션이다. 이 캡션을 분석해 구조적 패턴만 뽑아라 —
원문 문장이나 고유 표현을 그대로 인용하지 말고, 재사용 가능한 추상 템플릿으로 바꿔라.

[캡션]
${caption}

아래 JSON 형식으로만 응답해(설명 없이):
{
  "hookType": "문제 제기 / 반전 / 결과 선공개 / 질문 중 하나",
  "hookPromise": "훅이 독자에게 약속하는 것 (한 문장)",
  "structure": "전개 구조 (예: 문제 -> 증거 -> 방법 -> 결과)",
  "informationDensity": "낮음 / 중간 / 높음",
  "closing": "댓글유도 / 저장유도 / 프로필방문 / 다음편예고 중 하나",
  "reusableTemplate": ["단계1 설명", "단계2 설명", "단계3 설명", "단계4 설명", "단계5 설명"]
}`;

const renderBenchmark = (req, res, result, flash) => {
  const { account, accounts } = req;
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  const body = `
    <h1>벤치마킹 (구조 분석)</h1>
    <p class="sub">참고하고 싶은 다른 계정의 게시물 캡션을 붙여넣으면 훅 유형·구조·재사용 가능한 템플릿을 분석합니다. 원문을 그대로 베끼는 게 아니라 구조만 참고하는 용도입니다.</p>

    ${!hasApiKey ? '<div class="card"><div class="empty">ANTHROPIC_API_KEY가 .env에 설정되어 있지 않습니다 — 이 기능은 Claude API 호출이 필요합니다.</div></div>' : ''}

    <div class="card">
      <form method="post" action="${withAccount('/benchmark/analyze', account.id)}">
        <textarea name="caption" rows="6" placeholder="분석하고 싶은 캡션을 붙여넣으세요" style="width:100%;padding:8px" required></textarea>
        <div style="margin-top:8px"><button class="primary" type="submit" ${hasApiKey ? '' : 'disabled'}>구조 분석</button></div>
      </form>
    </div>

    ${result ? `
    <div class="card">
      <b>분석 결과</b>
      <table>
        <tr><th>훅 유형</th><td>${escapeHtml(result.hookType || '-')}</td></tr>
        <tr><th>훅의 약속</th><td>${escapeHtml(result.hookPromise || '-')}</td></tr>
        <tr><th>전개 구조</th><td>${escapeHtml(result.structure || '-')}</td></tr>
        <tr><th>정보 밀도</th><td>${escapeHtml(result.informationDensity || '-')}</td></tr>
        <tr><th>마무리</th><td>${escapeHtml(result.closing || '-')}</td></tr>
      </table>
      <b style="display:block;margin-top:12px">재사용 가능한 템플릿</b>
      <ol>${(result.reusableTemplate || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    </div>` : ''}
  `;
  res.send(page({ title: '벤치마킹', activePath: '/benchmark', body, flash, account, accounts }));
};

router.get('/benchmark', (req, res) => renderBenchmark(req, res, null, null));

router.post('/benchmark/analyze', async (req, res) => {
  const caption = (req.body.caption || '').trim();
  if (!caption) return renderBenchmark(req, res, null, { ok: false, message: '캡션을 입력하세요.' });

  try {
    const result = await askClaudeForJSON(ANALYSIS_PROMPT(caption));
    if (!result) {
      return renderBenchmark(req, res, null, { ok: false, message: 'ANTHROPIC_API_KEY가 설정되지 않아 분석할 수 없습니다.' });
    }
    renderBenchmark(req, res, result, { ok: true, message: '분석 완료.' });
  } catch (err) {
    renderBenchmark(req, res, null, { ok: false, message: `분석 실패: ${err.message}` });
  }
});

module.exports = router;
