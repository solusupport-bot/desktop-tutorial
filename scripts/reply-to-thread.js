#!/usr/bin/env node
// 우리 계정 Threads 게시물에 달린 실제 댓글에 답글을 답니다.
// Threads Graph API는 shortcode가 아니라 숫자 media ID가 필요하므로,
// 1) 우리 계정 최근 게시물 중 permalink에 shortcode가 일치하는 걸 찾고
// 2) 그 게시물의 댓글(replies) 중 본문이 일치하는 댓글을 찾은 뒤
// 3) 그 댓글에 reply_to_id로 답글을 단다.
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');

const THREADS_API_BASE = 'https://graph.threads.com/v1.0';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return opts;
};

const findPostByShortcode = async (userId, accessToken, shortcode) => {
  let url = `${THREADS_API_BASE}/${userId}/threads`;
  let params = { fields: 'id,permalink,text', limit: 25, access_token: accessToken };
  for (let page = 0; page < 8; page += 1) {
    const res = await axios.get(url, { params, timeout: 15000 });
    const match = (res.data?.data || []).find((p) => p.permalink && p.permalink.includes(shortcode));
    if (match) return match;
    const next = res.data?.paging?.next;
    if (!next) break;
    url = next;
    params = undefined;
  }
  return null;
};

/**
 * threads.com/share/... 링크는 실제 게시물 permalink와 다른 별도 코드를 써서
 * shortcode로 못 찾는 경우가 있다(2026-08-30 실측) — 그럴 때 원 게시물 "본문"의
 * 일부로 대신 찾는다.
 */
const findPostByTextMatch = async (userId, accessToken, needle) => {
  let url = `${THREADS_API_BASE}/${userId}/threads`;
  let params = { fields: 'id,permalink,text', limit: 25, access_token: accessToken };
  for (let page = 0; page < 8; page += 1) {
    const res = await axios.get(url, { params, timeout: 15000 });
    const match = (res.data?.data || []).find((p) => p.text && p.text.includes(needle));
    if (match) return match;
    const next = res.data?.paging?.next;
    if (!next) break;
    url = next;
    params = undefined;
  }
  return null;
};

const findCommentContaining = async (postId, accessToken, needle) => {
  const res = await axios.get(`${THREADS_API_BASE}/${postId}/replies`, {
    params: { fields: 'id,text,username,permalink', access_token: accessToken },
    timeout: 15000
  });
  const comments = res.data?.data || [];
  return comments.find((c) => (c.text || '').includes(needle)) || null;
};

const waitForThreadsContainer = async (creationId, accessToken) => {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await axios.get(`${THREADS_API_BASE}/${creationId}`, {
      params: { fields: 'status,error_message', access_token: accessToken },
      timeout: 15000
    });
    const status = res.data?.status;
    if (status === 'FINISHED') return;
    if (['ERROR', 'EXPIRED'].includes(status)) throw new Error(`컨테이너 처리 실패 (${status}): ${res.data?.error_message || ''}`);
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('컨테이너 처리 시간 초과');
};

const main = async () => {
  const opts = parseArgs();
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!accessToken || !userId) {
    log.err('THREADS_ACCESS_TOKEN 또는 THREADS_USER_ID가 없습니다.');
    process.exit(1);
  }
  // --list: 최근 게시물 id/permalink/본문 미리보기를 출력하고 끝낸다 — 공유 링크
  // 코드가 실제 permalink와 안 맞을 때 육안으로 대상 게시물을 찾기 위함.
  if (opts.list) {
    let url = `${THREADS_API_BASE}/${userId}/threads`;
    let params = { fields: 'id,permalink,text,timestamp', limit: 25, access_token: accessToken };
    for (let page = 0; page < 4; page += 1) {
      const res = await axios.get(url, { params, timeout: 15000 });
      (res.data?.data || []).forEach((p) => log.ok(`[${p.timestamp}] ${p.id} ${p.permalink} :: ${(p.text || '').slice(0, 90)}`));
      const next = res.data?.paging?.next;
      if (!next) break;
      url = next;
      params = undefined;
    }
    return;
  }

  if ((!opts.shortcode && !opts.postneedle) || !opts.needle || !opts.reply) {
    log.err('사용법: node scripts/reply-to-thread.js (--shortcode <permalink shortcode> | --postneedle "<원 게시물 본문 일부>") --needle "<원 댓글 일부>" --reply "<답글 내용>"\n또는: node scripts/reply-to-thread.js --list  (최근 게시물 목록만 출력)');
    process.exit(1);
  }

  log.section(opts.shortcode ? `shortcode ${opts.shortcode}로 게시물 찾는 중` : `본문 "${opts.postneedle}"로 게시물 찾는 중`);
  const post = opts.shortcode
    ? await findPostByShortcode(userId, accessToken, opts.shortcode)
    : await findPostByTextMatch(userId, accessToken, opts.postneedle);
  if (!post) {
    log.err(`일치하는 게시물을 우리 계정에서 못 찾았습니다.`);
    process.exit(1);
  }
  log.ok(`게시물 찾음: ${post.id} (${post.permalink})`);

  log.section('일치하는 댓글 찾는 중');
  const comment = await findCommentContaining(post.id, accessToken, opts.needle);
  if (!comment) {
    log.err(`"${opts.needle}"를 포함하는 댓글을 못 찾았습니다.`);
    process.exit(1);
  }
  log.ok(`댓글 찾음: ${comment.id} (@${comment.username}) "${comment.text}"`);

  log.section('답글 발행 중');
  const containerRes = await axios.post(
    `${THREADS_API_BASE}/${userId}/threads`,
    new URLSearchParams({
      media_type: 'TEXT',
      text: opts.reply,
      reply_to_id: comment.id,
      access_token: accessToken
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  const creationId = containerRes.data?.id;
  if (!creationId) throw new Error('답글 컨테이너 생성 실패');
  await waitForThreadsContainer(creationId, accessToken);

  const publishRes = await axios.post(
    `${THREADS_API_BASE}/${userId}/threads_publish`,
    new URLSearchParams({ creation_id: creationId, access_token: accessToken }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  log.ok(`답글 발행 완료 (ID: ${publishRes.data?.id})`);

  try {
    await new Promise((r) => setTimeout(r, 3000));
    const permalinkRes = await axios.get(`${THREADS_API_BASE}/${publishRes.data.id}`, {
      params: { fields: 'permalink', access_token: accessToken },
      timeout: 15000
    });
    log.ok(`답글 실제 URL: ${permalinkRes.data?.permalink}`);
  } catch (err) {
    log.warn(`답글 permalink 조회 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

main().catch((err) => {
  log.err(`실패: ${err.response?.data?.error?.message || err.message}`);
  process.exitCode = 1;
});
