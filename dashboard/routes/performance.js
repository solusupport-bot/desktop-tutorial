const express = require('express');
const { page, escapeHtml } = require('../lib/layout');
const data = require('../lib/data');

const router = express.Router();

router.get('/performance', (req, res) => {
  const { account, accounts } = req;
  const platform = data.getPlatformPerformance(account);
  const questions = data.getQuestionPerformance(account);

  const body = `
    <h1>성과확인</h1>
    <p class="sub">data/platform_performance.json · data/question_performance.json — curate.js가 platform_performance.json의 avg_views를 실시간으로 캡션에 반영합니다. 편집 폼은 아직 없습니다(직접 파일 수정) — Phase 3 예정.</p>

    <div class="card">
      <b>플랫폼별 성과 (last_updated: ${escapeHtml(platform.last_updated || '-')})</b>
      <pre>${escapeHtml(JSON.stringify(platform, null, 2))}</pre>
    </div>

    <div class="card">
      <b>질문/CTA 성과 (last_updated: ${escapeHtml(questions.last_updated || '-')})</b>
      <pre>${escapeHtml(JSON.stringify(questions, null, 2))}</pre>
    </div>
  `;
  res.send(page({ title: '성과확인', activePath: '/performance', body, account, accounts }));
});

module.exports = router;
