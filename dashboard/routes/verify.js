const express = require('express');
const { page, escapeHtml, withAccount } = require('../lib/layout');
const { runScript, getLastRun } = require('../lib/runner');

const router = express.Router();
const SCRIPTS = {
  'no-duplicate-media': 'scripts/verify-no-duplicate-media.js',
  'topic-media-alignment': 'scripts/verify-topic-media-alignment.js'
};

function badge(v) { return `<span class="badge ${v}">${v}</span>`; }

router.get('/verify', (req, res) => {
  const { account, accounts } = req;
  const sections = Object.entries(SCRIPTS).map(([key, scriptPath]) => {
    const last = getLastRun(account, key);
    return `
      <div class="card">
        <b>${escapeHtml(scriptPath)}</b>
        <form method="post" action="${withAccount(`/verify/run/${key}`, account.id)}"><button class="primary" type="submit">지금 실행</button></form>
        ${last ? `<p class="sub" style="margin-top:10px">마지막 실행: ${last.at} — ${last.ok ? badge('passed') : badge('failed')}</p><pre>${escapeHtml(last.output)}</pre>` : ''}
      </div>`;
  }).join('');

  const body = `
    <h1>검증 (하드 게이트)</h1>
    <p class="sub">실패 시(종료코드 0이 아님) 해당 큐 항목의 verifyStatus가 'failed'로 기록되어 발행이 차단됩니다.</p>
    ${sections}
  `;
  res.send(page({ title: '검증', activePath: '/verify', body, account, accounts }));
});

router.post('/verify/run/:key', (req, res) => {
  const scriptPath = SCRIPTS[req.params.key];
  if (scriptPath) runScript(req.account, req.params.key, scriptPath);
  res.redirect(withAccount('/verify', req.account.id));
});

module.exports = router;
