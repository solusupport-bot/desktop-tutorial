const express = require('express');
const { page, escapeHtml, withAccount } = require('../lib/layout');
const { runScript, getLastRun } = require('../lib/runner');
const data = require('../lib/data');

const router = express.Router();
const RUN_KEY = 'daily-auto-post';

router.get('/planning', (req, res) => {
  const { account, accounts } = req;
  const topics = data.getTopicBank(account);
  const upcoming = data.getUpcomingTopicPreview(account, 5);
  const lastRun = getLastRun(account, RUN_KEY);

  const body = `
    <h1>기획</h1>
    <p class="sub">주제 은행(data/topic_bank.json) ${topics.length}건 · 편집은 아직 이 화면에서 지원하지 않습니다(Phase 2 예정) — 지금은 파일을 직접 수정하세요.</p>

    <div class="card">
      <b>다음 예정 주제 (로테이션 미리보기)</b>
      <table>
        <tr><th>순서</th><th>주제</th><th>카테고리</th></tr>
        ${upcoming.map((t, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(t.source)}</td><td>${escapeHtml(t.category || '-')}</td></tr>`).join('')}
      </table>
    </div>

    <div class="card">
      <b>daily-auto-post.js 지금 실행</b>
      <p class="sub">오늘 이미 큐잉했다면 안전하게 스킵됩니다(alreadyQueuedToday 가드). 실행 결과는 로컬 data/queue.json에만 쓰이며, 실제 발행 워커에 반영하려면 직접 git push가 필요합니다.</p>
      <form method="post" action="${withAccount('/planning/run-daily', account.id)}"><button class="primary" type="submit">지금 실행</button></form>
      ${lastRun ? `<p class="sub" style="margin-top:10px">마지막 실행: ${lastRun.at} (${lastRun.ok ? '성공' : '실패'})</p><pre>${escapeHtml(lastRun.output)}</pre>` : ''}
    </div>

    <div class="card">
      <b>주제 은행 전체 (${topics.length}건)</b>
      <table>
        <tr><th>주제</th><th>카테고리</th><th>장소 키워드</th><th>각도 수</th></tr>
        ${topics.map((t) => `<tr><td>${escapeHtml(t.topic)}</td><td>${escapeHtml(t.category || '-')}</td><td>${escapeHtml(t.placeKeyword || '-')}</td><td>${(t.content || []).length}</td></tr>`).join('')}
      </table>
    </div>
  `;
  res.send(page({ title: '기획', activePath: '/planning', body, account, accounts }));
});

router.post('/planning/run-daily', (req, res) => {
  const result = runScript(req.account, RUN_KEY, 'scripts/daily-auto-post.js');
  res.redirect(withAccount('/planning', req.account.id) + `&ran=${result.ok ? 'ok' : 'err'}`);
});

module.exports = router;
