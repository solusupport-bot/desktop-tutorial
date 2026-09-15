const express = require('express');
const path = require('path');
const { page, escapeHtml, withAccount } = require('../lib/layout');
const { fmtDate } = require('../lib/format');
const { syncAndCommit } = require('../lib/git_sync');
const data = require('../lib/data');

const router = express.Router();

const renderReview = (req, res, flash) => {
  const { account, accounts } = req;
  const queue = data.getQueue(account).filter((i) => i.status === 'pending' && !i.approved);
  const batches = data.groupQueueByBatch(queue);

  const rows = batches.map(({ items }) => {
    const first = items[0];
    const ids = items.map((i) => i.id).join(',');
    const factCheck = first.factCheckStatus || 'pending';
    const warn = factCheck !== 'passed' ? `<span class="badge flagged">정보확인 미완료</span>` : '';
    return `<tr>
      <td>${escapeHtml(first.topic || first.source || '(주제 없음)')} ${warn}</td>
      <td>${escapeHtml((first.text || '').slice(0, 80))}${(first.text || '').length > 80 ? '…' : ''}</td>
      <td>${items.map((i) => escapeHtml(i.platforms.join(','))).join(', ')}</td>
      <td>${fmtDate(first.scheduledAt)}</td>
      <td>
        <form class="inline" method="post" action="${withAccount('/review/approve', account.id)}">
          <input type="hidden" name="ids" value="${escapeHtml(ids)}">
          <button class="primary" type="submit">승인</button>
        </form>
        <form class="inline" method="post" action="${withAccount('/review/reject', account.id)}" style="margin-left:6px">
          <input type="hidden" name="ids" value="${escapeHtml(ids)}">
          <button class="danger" type="submit">반려</button>
        </form>
      </td>
    </tr>`;
  }).join('');

  const body = `
    <h1>검수 (하드 게이트)</h1>
    <p class="sub">승인(approved:true)되지 않은 배치는 claimDuePosts()가 절대 클레임하지 않아 발행되지 않습니다. 승인/반려는 즉시 git commit+push됩니다.</p>
    <div class="card">
      ${batches.length ? `<table><tr><th>주제</th><th>미리보기</th><th>플랫폼</th><th>예약시각</th><th></th></tr>${rows}</table>` : '<div class="empty">검수 대기 중인 배치가 없습니다.</div>'}
    </div>
  `;
  res.send(page({ title: '검수', activePath: '/review', body, flash, account, accounts }));
};

router.get('/review', (req, res) => renderReview(req, res, null));

const updateByIds = (account, idsParam, apply) => {
  const ids = new Set((idsParam || '').split(',').filter(Boolean));
  syncAndCommit(account, ['data/queue.json'], `dashboard: 검수 처리 (${ids.size}건)`, () => {
    const { loadQueue, saveQueue } = require(path.join(account.repoPath, 'lib/scheduler/queue'));
    const queue = loadQueue();
    queue.forEach((item) => { if (ids.has(item.id)) apply(item); });
    saveQueue(queue);
  });
};

router.post('/review/approve', (req, res) => {
  const { account } = req;
  try {
    updateByIds(account, req.body.ids, (item) => {
      item.approved = true;
      item.reviewedBy = 'dashboard';
      item.reviewedAt = new Date().toISOString();
    });
    res.redirect(withAccount('/review', account.id) + '&ok=1');
  } catch (err) {
    renderReview(req, res, { ok: false, message: err.message });
  }
});

router.post('/review/reject', (req, res) => {
  const { account } = req;
  try {
    updateByIds(account, req.body.ids, (item) => {
      item.status = 'rejected';
      item.reviewedBy = 'dashboard';
      item.reviewedAt = new Date().toISOString();
    });
    res.redirect(withAccount('/review', account.id) + '&ok=1');
  } catch (err) {
    renderReview(req, res, { ok: false, message: err.message });
  }
});

module.exports = router;
