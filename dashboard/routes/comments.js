const express = require('express');
const axios = require('axios');
const { page, escapeHtml } = require('../lib/layout');

const router = express.Router();

router.get('/comments', async (req, res) => {
  const { account, accounts } = req;
  const baseUrl = process.env.COMMENT_BOT_URL;
  let body;

  if (!baseUrl) {
    body = `
      <h1>댓글</h1>
      <p class="sub">services/comment-auto-reply (Render) 서비스의 활동을 여기서 확인합니다.</p>
      <div class="card"><div class="empty">COMMENT_BOT_URL 환경변수가 설정되지 않았습니다 — .env에 Render 배포 URL을 추가하세요 (예: COMMENT_BOT_URL=https://xxx.onrender.com).</div></div>
    `;
    return res.send(page({ title: '댓글', activePath: '/comments', body, account, accounts }));
  }

  try {
    const { data } = await axios.get(`${baseUrl}/recent-activity`, { timeout: 5000 });
    const events = data.events || [];
    const rows = events.slice().reverse().map((e) => `<tr>
      <td>${escapeHtml(e.at)}</td>
      <td>${escapeHtml((e.matched_topics || []).join(', ') || '(미매칭)')}</td>
      <td>${escapeHtml(e.lang)}</td>
      <td>${e.scheduled_delay_seconds != null ? `${Math.round(e.scheduled_delay_seconds / 60 * 10) / 10}분` : '-'}</td>
      <td>${e.dry_run ? '<span class="badge pending">dry-run</span>' : '<span class="badge published">전송됨</span>'}</td>
      <td>${escapeHtml(e.reply_preview || '')}</td>
    </tr>`).join('');

    body = `
      <h1>댓글</h1>
      <p class="sub">최근 답글 활동 ${events.length}건 (읽기 전용, ${escapeHtml(baseUrl)}) — 봇처럼 보이지 않도록 1~5분 지연 후 게시됩니다.</p>
      <div class="card">
        ${events.length ? `<table><tr><th>시각</th><th>매칭 주제</th><th>언어</th><th>지연</th><th>상태</th><th>답글 미리보기</th></tr>${rows}</table>` : '<div class="empty">최근 활동이 없습니다.</div>'}
      </div>
    `;
  } catch (err) {
    body = `
      <h1>댓글</h1>
      <div class="card"><div class="empty">서비스에 연결할 수 없습니다: ${escapeHtml(err.message)}</div></div>
    `;
  }
  res.send(page({ title: '댓글', activePath: '/comments', body, account, accounts }));
});

module.exports = router;
