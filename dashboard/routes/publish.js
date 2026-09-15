const express = require('express');
const { page, escapeHtml, withAccount } = require('../lib/layout');
const { fmtDate, badge, countBy } = require('../lib/format');
const { runScript, getLastRun } = require('../lib/runner');
const data = require('../lib/data');

const router = express.Router();

router.get('/publish', (req, res) => {
  const { account, accounts } = req;
  const queue = data.getQueue(account);
  const counts = countBy(queue, (i) => i.status);
  const upcoming = queue
    .filter((i) => i.status === 'claimed' || (i.status === 'pending' && i.approved))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .slice(0, 15);
  const recent = queue
    .filter((i) => i.status === 'published' || i.status === 'partial')
    .sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''))
    .slice(0, 15);

  const claimRun = getLastRun(account, 'claim-due-posts');
  const publishRun = getLastRun(account, 'publish-claimed-posts');

  const body = `
    <h1>발행</h1>
    <p class="sub">실제 발행은 GitHub Actions(scheduler.yml, 15분 간격)가 처리합니다. 아래 버튼은 로컬 테스트용이며 검수/검증 게이트를 동일하게 적용받습니다.</p>

    <div class="grid">
      ${Object.entries(counts).map(([s, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${badge(s)}</div></div>`).join('')}
    </div>

    <div class="card">
      <b>로컬 테스트 실행</b>
      <form class="inline" method="post" action="${withAccount('/publish/run-claim', account.id)}"><button type="submit">claim-due-posts.js 실행</button></form>
      <form class="inline" method="post" action="${withAccount('/publish/run-publish', account.id)}" style="margin-left:8px"><button type="submit">publish-claimed-posts.js 실행</button></form>
      ${claimRun ? `<pre>${escapeHtml(claimRun.output)}</pre>` : ''}
      ${publishRun ? `<pre>${escapeHtml(publishRun.output)}</pre>` : ''}
    </div>

    <div class="card">
      <b>다가오는 발행 (승인/클레임됨)</b>
      <table><tr><th>주제</th><th>플랫폼</th><th>예약시각</th><th>상태</th></tr>
        ${upcoming.map((i) => `<tr><td>${escapeHtml(i.topic || '-')}</td><td>${escapeHtml(i.platforms.join(','))}</td><td>${fmtDate(i.scheduledAt)}</td><td>${badge(i.status)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">없음</td></tr>'}
      </table>
    </div>

    <div class="card">
      <b>최근 발행 결과</b>
      <table><tr><th>주제</th><th>플랫폼</th><th>처리시각</th><th>상태</th></tr>
        ${recent.map((i) => `<tr><td>${escapeHtml(i.topic || '-')}</td><td>${escapeHtml(i.platforms.join(','))}</td><td>${fmtDate(i.processedAt)}</td><td>${badge(i.status)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">없음</td></tr>'}
      </table>
    </div>
  `;
  res.send(page({ title: '발행', activePath: '/publish', body, account, accounts }));
});

router.post('/publish/run-claim', (req, res) => {
  runScript(req.account, 'claim-due-posts', 'scripts/claim-due-posts.js');
  res.redirect(withAccount('/publish', req.account.id));
});

router.post('/publish/run-publish', (req, res) => {
  runScript(req.account, 'publish-claimed-posts', 'scripts/publish-claimed-posts.js');
  res.redirect(withAccount('/publish', req.account.id));
});

module.exports = router;
