const express = require('express');
const path = require('path');
const { page, escapeHtml, withAccount } = require('../lib/layout');
const { fmtDate, badge } = require('../lib/format');
const { syncAndCommit } = require('../lib/git_sync');
const data = require('../lib/data');

const router = express.Router();
const STATUSES = ['pending', 'passed', 'flagged'];

const renderFactcheck = (req, res, flash) => {
  const { account, accounts } = req;
  const queue = data.getQueue(account).filter((i) => i.status === 'pending');
  const batches = data.groupQueueByBatch(queue);

  const rows = batches.map(({ items }) => {
    const first = items[0];
    const ids = items.map((i) => i.id).join(',');
    const status = first.factCheckStatus || 'pending';
    const options = STATUSES.map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('');
    return `<tr>
      <td>${escapeHtml(first.topic || first.source || '(주제 없음)')}</td>
      <td>${fmtDate(first.createdAt)}</td>
      <td>${items.map((i) => escapeHtml(i.platforms.join(','))).join(', ')}</td>
      <td>${badge(status)}</td>
      <td>
        <form class="inline" method="post" action="${withAccount('/factcheck/status', account.id)}">
          <input type="hidden" name="ids" value="${escapeHtml(ids)}">
          <select name="status">${options}</select>
          <button type="submit">저장</button>
        </form>
      </td>
    </tr>`;
  }).join('');

  const body = `
    <h1>정보확인</h1>
    <p class="sub">발행 대기(pending) 배치 ${batches.length}건 — 같은 주제/생성시각으로 묶임. 상태 변경 시 git commit+push됩니다.</p>
    <div class="card">
      ${batches.length ? `<table><tr><th>주제</th><th>생성시각</th><th>플랫폼</th><th>현재 상태</th><th>변경</th></tr>${rows}</table>` : '<div class="empty">대기 중인 배치가 없습니다.</div>'}
    </div>
  `;
  res.send(page({ title: '정보확인', activePath: '/factcheck', body, flash, account, accounts }));
};

router.get('/factcheck', (req, res) => renderFactcheck(req, res, null));

router.post('/factcheck/status', (req, res) => {
  const { account } = req;
  const ids = new Set((req.body.ids || '').split(',').filter(Boolean));
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'pending';
  try {
    syncAndCommit(account, ['data/queue.json'], `dashboard: 정보확인 상태 변경 (${ids.size}건 -> ${status})`, () => {
      const { loadQueue, saveQueue } = require(path.join(account.repoPath, 'lib/scheduler/queue'));
      const queue = loadQueue();
      queue.forEach((item) => { if (ids.has(item.id)) item.factCheckStatus = status; });
      saveQueue(queue);
    });
    res.redirect(withAccount('/factcheck', account.id) + '&ok=1');
  } catch (err) {
    renderFactcheck(req, res, { ok: false, message: err.message });
  }
});

module.exports = router;
