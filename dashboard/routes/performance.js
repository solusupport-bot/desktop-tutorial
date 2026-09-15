const express = require('express');
const { page, escapeHtml, withAccount } = require('../lib/layout');
const { fmtDate, countBy } = require('../lib/format');
const { runScript, getLastRun } = require('../lib/runner');
const data = require('../lib/data');

const router = express.Router();
const COLLECT_KEY = 'collect-insights';

router.get('/performance', (req, res) => {
  const { account, accounts } = req;
  const platform = data.getPlatformPerformance(account);
  const questions = data.getQuestionPerformance(account);
  const insights = data.getCollectedInsights(account);
  const lastRun = getLastRun(account, COLLECT_KEY);

  // 이번 주 요약 — SMTP가 아직 없어 이메일 발송 대신 화면에 표시(나중에 SMTP
  // 준비되면 이 요약을 그대로 이메일 본문으로 재사용하면 됨).
  const queue = data.getQueue(account);
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const thisWeek = queue.filter((i) => i.processedAt && new Date(i.processedAt).getTime() >= weekAgo);
  const weekCounts = countBy(thisWeek, (i) => i.status);
  const insightRows = Object.values(insights).sort((a, b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''));

  const body = `
    <h1>성과확인</h1>
    <p class="sub">data/platform_performance.json · data/question_performance.json — curate.js가 platform_performance.json의 avg_views를 실시간으로 캡션에 반영합니다.</p>

    <div class="card">
      <b>이번 주 요약 (지난 7일)</b>
      <p class="sub">SMTP 미설정 — 이메일 대신 여기 표시. 설정되면 이 요약을 그대로 이메일로 보낼 수 있습니다.</p>
      <div class="grid">
        <div class="stat"><div class="n">${thisWeek.length}</div><div class="l">이번 주 처리된 게시</div></div>
        <div class="stat"><div class="n">${weekCounts.published || 0}</div><div class="l">완전 발행</div></div>
        <div class="stat"><div class="n">${weekCounts.partial || 0}</div><div class="l">부분 실패</div></div>
      </div>
    </div>

    <div class="card">
      <b>실측 인사이트 (Threads/Facebook)</b>
      <p class="sub">최근 30일 발행분의 Graph API 인사이트를 수집합니다. 액세스 토큰(THREADS_ACCESS_TOKEN/FB_PAGE_ACCESS_TOKEN)이 없으면 스킵됩니다.</p>
      <form method="post" action="${withAccount('/performance/collect', account.id)}"><button class="primary" type="submit">지금 갱신</button></form>
      ${lastRun ? `<p class="sub" style="margin-top:10px">마지막 실행: ${lastRun.at} (${lastRun.ok ? '성공' : '실패'})</p><pre>${escapeHtml(lastRun.output)}</pre>` : ''}
      ${insightRows.length ? `
        <table style="margin-top:12px">
          <tr><th>플랫폼</th><th>주제</th><th>발행시각</th><th>지표</th></tr>
          ${insightRows.map((r) => `<tr><td>${escapeHtml(r.platform)}</td><td>${escapeHtml(r.topic || '-')}</td><td>${fmtDate(r.publishedAt)}</td><td>${escapeHtml(JSON.stringify(r.metrics))}</td></tr>`).join('')}
        </table>` : '<div class="empty" style="margin-top:12px">아직 수집된 인사이트가 없습니다.</div>'}
    </div>

    <div class="card">
      <b>플랫폼별 수동 성과 (last_updated: ${escapeHtml(platform.last_updated || '-')})</b>
      <pre>${escapeHtml(JSON.stringify(platform, null, 2))}</pre>
    </div>

    <div class="card">
      <b>질문/CTA 성과 (last_updated: ${escapeHtml(questions.last_updated || '-')})</b>
      <pre>${escapeHtml(JSON.stringify(questions, null, 2))}</pre>
    </div>
  `;
  res.send(page({ title: '성과확인', activePath: '/performance', body, account, accounts }));
});

router.post('/performance/collect', (req, res) => {
  runScript(req.account, COLLECT_KEY, 'scripts/collect-insights.js');
  res.redirect(withAccount('/performance', req.account.id));
});

module.exports = router;
