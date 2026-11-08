#!/usr/bin/env node
/**
 * scripts/auto-reply-threads.js
 *
 * 우리 Threads 게시물에 달린 "새 댓글"을 스스로 찾아서 답글을 단다. 기존
 * scripts/reply-to-thread.js는 사람이 대상 댓글(shortcode/needle)을 직접 지정해야
 * 했던 수동 도구 — 이 스크립트는 그 발견(discovery) 과정 자체를 자동화한다
 * (2026-11-08 사용자 요청: "진짜 자동화로 가자").
 *
 * 흐름: 최근 게시물 목록 -> 각 게시물의 댓글 목록 -> 이미 답글 단 댓글/본인 댓글
 * 제외 -> AI로 답글 초안(lib/ai/comment_draft.js draftThreadReply) -> 발행.
 * 간격/일일한도는 lib/scheduler/api_safety.js의 threads_reply 정책을 따르고,
 * 플랫폼이 봇/의심활동으로 인식하는 응답이 오면 lib/scheduler/engagement_halt.js가
 * 즉시 영구정지한다.
 *
 * 사용법:
 *   node scripts/auto-reply-threads.js            # 기본 dry-run (미리보기만)
 *   node scripts/auto-reply-threads.js --live      # 실제로 답글 게시
 *   node scripts/auto-reply-threads.js --max 3 --live
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const log = require('../lib/logger');
const { publishTextReply } = require('../lib/publishing/threads');
const { draftThreadReply } = require('../lib/ai/comment_draft');
const { canPublishNow, recordPublishResult } = require('../lib/scheduler/api_safety');
const { isHalted, checkAndHalt } = require('../lib/scheduler/engagement_halt');

const THREADS_API_BASE = 'https://graph.threads.com/v1.0';
const LOG_PATH = path.join(__dirname, '..', 'data', 'thread_reply_log.json');
const MAX_SEEN = 1000;
const MAX_POST_PAGES = 3;
const MAX_REPLY_PAGES = 2;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = { live: false, max: 5 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--live') opts.live = true;
    else if (args[i] === '--max') { opts.max = Number(args[i + 1]); i += 1; }
  }
  return opts;
};

const loadLog = () => {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch (_) {
    return { repliedCommentIds: [] };
  }
};

const saveLog = (state) => {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
};

const markReplied = (state, commentId) => {
  state.repliedCommentIds.push(commentId);
  if (state.repliedCommentIds.length > MAX_SEEN) {
    state.repliedCommentIds = state.repliedCommentIds.slice(-MAX_SEEN);
  }
};

const getOwnUsername = async (userId, accessToken) => {
  try {
    const res = await axios.get(`${THREADS_API_BASE}/${userId}`, {
      params: { fields: 'username', access_token: accessToken },
      timeout: 10000
    });
    return res.data?.username || null;
  } catch (err) {
    log.warn(`본인 계정 정보 조회 실패 — 본인 댓글 필터 없이 진행합니다: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

const listOwnPosts = async (userId, accessToken) => {
  const posts = [];
  let url = `${THREADS_API_BASE}/${userId}/threads`;
  let params = { fields: 'id,text,permalink,timestamp', limit: 25, access_token: accessToken };
  for (let page = 0; page < MAX_POST_PAGES; page += 1) {
    const res = await axios.get(url, { params, timeout: 15000 });
    posts.push(...(res.data?.data || []));
    const next = res.data?.paging?.next;
    if (!next) break;
    url = next;
    params = undefined;
  }
  return posts;
};

const listReplies = async (postId, accessToken) => {
  const replies = [];
  let url = `${THREADS_API_BASE}/${postId}/replies`;
  let params = { fields: 'id,text,username,timestamp', access_token: accessToken };
  for (let page = 0; page < MAX_REPLY_PAGES; page += 1) {
    const res = await axios.get(url, { params, timeout: 15000 });
    replies.push(...(res.data?.data || []));
    const next = res.data?.paging?.next;
    if (!next) break;
    url = next;
    params = undefined;
  }
  return replies;
};

const main = async () => {
  const opts = parseArgs();
  log.section(`Threads 댓글 자동 답글 — ${opts.live ? '실제 게시' : 'DRY RUN (미리보기만)'}`);

  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!accessToken || !userId) {
    log.err('THREADS_ACCESS_TOKEN 또는 THREADS_USER_ID가 없습니다.');
    process.exit(1);
  }

  if (isHalted('threads')) {
    log.warn('Threads 비상정지 상태(data/engagement_halt.json) — 봇 탐지 신호가 있었습니다. 건너뜁니다.');
    return;
  }

  const ownUsername = await getOwnUsername(userId, accessToken);
  const logState = loadLog();
  const repliedSet = new Set(logState.repliedCommentIds);

  const posts = await listOwnPosts(userId, accessToken);
  log.ok(`최근 게시물 ${posts.length}건 조회`);

  const candidates = [];
  for (const post of posts) {
    let replies;
    try {
      replies = await listReplies(post.id, accessToken);
    } catch (err) {
      log.warn(`댓글 조회 실패 (${post.id}): ${err.response?.data?.error?.message || err.message}`);
      continue;
    }
    for (const reply of replies) {
      if (repliedSet.has(reply.id)) continue;
      if (ownUsername && reply.username && reply.username.toLowerCase() === ownUsername.toLowerCase()) continue;
      candidates.push({ post, comment: reply });
    }
  }
  log.ok(`답글 안 단 새 댓글 ${candidates.length}건 발견`);

  const picked = candidates.slice(0, opts.max);
  for (const { post, comment } of picked) {
    const draft = await draftThreadReply({ originalPostText: post.text || '', commentText: comment.text || '' });
    if (!draft) {
      log.warn(`답글 초안 생성 실패: ${comment.id}`);
      continue;
    }

    log.step(`게시물 "${(post.text || '').slice(0, 60)}" / @${comment.username}: "${comment.text}"`);
    log.step(`-> [${draft.language}] ${draft.reply}`);

    if (!opts.live) {
      log.info('[DRY RUN] 게시하지 않음 — 위 답글은 미리보기입니다.');
      continue;
    }

    const gate = canPublishNow('threads_reply');
    if (!gate.allowed) {
      log.warn(`Threads 답글 한도/간격 미충족 — 이번 실행 종료 (${gate.reason})`);
      break;
    }

    let success = false;
    try {
      const replyId = await publishTextReply({ userId, accessToken, text: draft.reply, replyToId: comment.id });
      log.ok(`Threads 답글 발행 완료 (Media ID: ${replyId})`);
      success = true;
    } catch (err) {
      const apiError = err.response?.data?.error;
      const detail = apiError ? `${apiError.message} (code=${apiError.code}, subcode=${apiError.error_subcode})` : err.message;
      log.err(`Threads 답글 발행 실패: ${detail}`);
      if (checkAndHalt('threads', detail)) break;
    }
    recordPublishResult('threads_reply', success);
    if (success) {
      markReplied(logState, comment.id);
      saveLog(logState);
    }
    await new Promise((r) => setTimeout(r, 15000 + Math.random() * 30000));
  }

  if (!opts.live) {
    log.info('실제로 게시하려면 --live 를 붙여서 다시 실행하세요.');
  }
};

main().catch((err) => {
  log.err(`실패: ${err.message}`);
  process.exitCode = 1;
});
