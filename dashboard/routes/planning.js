const express = require('express');
const path = require('path');
const fs = require('fs');
const { page, escapeHtml, withAccount } = require('../lib/layout');
const { runScript, getLastRun } = require('../lib/runner');
const { syncAndCommit } = require('../lib/git_sync');
const data = require('../lib/data');

const router = express.Router();
const RUN_KEY = 'daily-auto-post';
const CUSTOM_TOPIC_RUN_KEY = 'queue-custom-topic';

const renderPlanning = (req, res, flash) => {
  const { account, accounts } = req;
  const topics = data.getTopicBank(account);
  const upcoming = data.getUpcomingTopicPreview(account, 5);
  const lastRun = getLastRun(account, RUN_KEY);
  const lastCustomRun = getLastRun(account, CUSTOM_TOPIC_RUN_KEY);

  const body = `
    <h1>기획</h1>
    <p class="sub">주제 은행(data/topic_bank.json) ${topics.length}건</p>

    <div class="card">
      <b>새 주제 추가 + 지금 실행</b>
      <p class="sub">저장하면 주제 은행에 영구 편입(git commit+push)되고, 곧바로 실제 파이프라인(이미지/영상 수집~8플랫폼 큐레이션~큐 등록)을 태워 결과를 아래에 보여줍니다.</p>
      <form method="post" action="${withAccount('/planning/add-topic', account.id)}">
        <p><input name="topic" placeholder="주제명 (필수)" required style="width:100%;padding:6px"></p>
        <p><input name="category" placeholder="카테고리 (선택)" style="width:49%;padding:6px">
           <input name="placeKeyword" placeholder="장소 키워드 (선택)" style="width:49%;padding:6px"></p>
        <p><textarea name="content" placeholder="콘텐츠 각도 (여러 개면 빈 줄로 구분)" rows="4" style="width:100%;padding:6px" required></textarea></p>
        <button class="primary" type="submit">추가하고 지금 실행</button>
      </form>
      ${lastCustomRun ? `<p class="sub" style="margin-top:10px">마지막 실행: ${lastCustomRun.at} (${lastCustomRun.ok ? '성공' : '실패'})</p><pre>${escapeHtml(lastCustomRun.output)}</pre>` : ''}
    </div>

    <div class="card">
      <b>다음 예정 주제 (로테이션 미리보기)</b>
      <table>
        <tr><th>순서</th><th>주제</th><th>카테고리</th></tr>
        ${upcoming.map((t, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(t.source)}</td><td>${escapeHtml(t.category || '-')}</td></tr>`).join('')}
      </table>
    </div>

    <div class="card">
      <b>daily-auto-post.js 지금 실행 (오늘의 로테이션 3건)</b>
      <p class="sub">오늘 이미 큐잉했다면 안전하게 스킵됩니다(alreadyQueuedToday 가드).</p>
      <form method="post" action="${withAccount('/planning/run-daily', account.id)}"><button type="submit">지금 실행</button></form>
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
  res.send(page({ title: '기획', activePath: '/planning', body, flash, account, accounts }));
};

router.get('/planning', (req, res) => renderPlanning(req, res, null));

router.post('/planning/run-daily', (req, res) => {
  const result = runScript(req.account, RUN_KEY, 'scripts/daily-auto-post.js');
  res.redirect(withAccount('/planning', req.account.id) + `&ran=${result.ok ? 'ok' : 'err'}`);
});

router.post('/planning/add-topic', (req, res) => {
  const { account } = req;
  const topicName = (req.body.topic || '').trim();
  const content = (req.body.content || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);

  if (!topicName || !content.length) {
    return renderPlanning(req, res, { ok: false, message: '주제명과 콘텐츠는 필수입니다.' });
  }

  try {
    syncAndCommit(account, ['data/topic_bank.json'], `dashboard: 새 주제 추가 - ${topicName}`, () => {
      const bankPath = path.join(account.repoPath, 'data/topic_bank.json');
      const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
      if (bank.some((t) => t.topic === topicName)) {
        throw new Error(`이미 존재하는 주제명입니다: ${topicName}`);
      }
      bank.push({
        topic: topicName,
        author: 'Dashboard',
        url: '',
        category: req.body.category || undefined,
        placeKeyword: req.body.placeKeyword || undefined,
        content
      });
      fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n', 'utf8');
    });
  } catch (err) {
    return renderPlanning(req, res, { ok: false, message: err.message });
  }

  const runResult = runScript(account, CUSTOM_TOPIC_RUN_KEY, 'scripts/queue-custom-topic.js', ['--topic', topicName]);
  renderPlanning(req, res, runResult.ok
    ? { ok: true, message: `"${topicName}" 추가 및 큐잉 완료.` }
    : { ok: false, message: `주제는 추가됐지만 즉시 실행에 실패했습니다 — 아래 출력 확인.` });
});

module.exports = router;
