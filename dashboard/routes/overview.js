const express = require('express');
const { page } = require('../lib/layout');
const { countBy } = require('../lib/format');
const data = require('../lib/data');

const router = express.Router();

router.get('/', (req, res) => {
  const { account, accounts } = req;
  const queue = data.getQueue(account);
  const statusCounts = countBy(queue, (i) => i.status);
  const unapproved = queue.filter((i) => i.status === 'pending' && !i.approved).length;
  const factCheckPending = queue.filter((i) => (i.factCheckStatus || 'pending') === 'pending' && i.status === 'pending').length;
  const topicBank = data.getTopicBank(account);
  const blog = data.getBlogPosts(account);

  const stats = [
    ['기획 주제 수', topicBank.length],
    ['정보확인 대기', factCheckPending],
    ['검수 대기(미승인)', unapproved],
    ['발행됨', statusCounts.published || 0],
    ['부분 실패', statusCounts.partial || 0],
    ['블로그 글', blog.available ? blog.posts.length : 'N/A']
  ];

  const body = `
    <h1>개요</h1>
    <p class="sub">${account.label} · 6단계(기획/정보확인/검수/발행/검증/댓글) + 성과확인 전체 현황</p>
    <div class="grid">
      ${stats.map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')}
    </div>
    <div class="card">
      <b>안내</b>
      <p class="sub" style="margin-bottom:0">각 단계는 왼쪽 메뉴에서 따로 조작합니다. 검수/검증을 통과하지 못한 항목은 자동 발행되지 않습니다(하드 게이트).</p>
    </div>
  `;
  res.send(page({ title: '개요', activePath: '/', body, account, accounts }));
});

module.exports = router;
