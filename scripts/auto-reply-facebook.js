#!/usr/bin/env node
/**
 * scripts/auto-reply-facebook.js
 *
 * 2026-11-09 사용자 요청: "돈 안들이고 할 수 있는 건 해보자" — Facebook은 이미 전환이
 * 가장 잘 되는 채널인데 자체 글에 달린 댓글엔 아무도 응답을 안 하고 있었다.
 * scripts/auto-reply-threads.js와 완전히 같은 패턴(발견 -> AI 답글 초안 -> 발행)을
 * Facebook Graph API로 그대로 옮긴 것 — 남의 글에 끼어드는 게 아니라 "우리 페이지
 * 글에 반응해준 사람에게 답하는" 것이라 Graph API 권한/리스크가 낮다.
 *
 * 흐름: 페이지 최근 게시물 목록 -> 각 게시물의 댓글 목록 -> 이미 답글 단 댓글 제외
 * -> AI로 답글 초안(lib/ai/comment_draft.js draftThreadReply, 플랫폼 중립적이라 재사용) ->
 * 발행. 간격/일일한도는 lib/scheduler/api_safety.js의 facebook_reply 정책을 따르고,
 * 플랫폼이 봇/의심활동으로 인식하는 응답이 오면 lib/scheduler/engagement_halt.js가
 * 즉시 영구정지한다.
 *
 * 사용법:
 *   node scripts/auto-reply-facebook.js            # 기본 dry-run (미리보기만)
 *   node scripts/auto-reply-facebook.js --live      # 실제로 답글 게시
 *   node scripts/auto-reply-facebook.js --max 3 --live
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { graphGet, graphPost } = require('../lib/publishing/meta_client');
const { draftThreadReply } = require('../lib/ai/comment_draft');
const { canPublishNow, recordPublishResult } = require('../lib/scheduler/api_safety');
const { isHalted, checkAndHalt } = require('../lib/scheduler/engagement_halt');

const LOG_PATH = path.join(__dirname, '..', 'data', 'facebook_reply_log.json');
const MAX_SEEN = 1000;
// 매시간 실행되는 발견용 작업이라 한 페이지(최근 글/댓글 각 25~50개)만 보면 충분하다
// — 이미 답글 단 댓글은 repliedCommentIds 로그로 걸러지므로 다음 실행에서 놓치지 않는다.
const POSTS_LIMIT = 25;
const COMMENTS_LIMIT = 50;

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

const listOwnPosts = async (pageId, accessToken) => {
  const data = await graphGet(`/${pageId}/posts`, { fields: 'id,message,permalink_url', limit: POSTS_LIMIT }, accessToken);
  return data?.data || [];
};

const listComments = async (postId, accessToken) => {
  const data = await graphGet(`/${postId}/comments`, {
    fields: 'id,message,from,created_time',
    filter: 'toplevel',
    limit: COMMENTS_LIMIT
  }, accessToken);
  return data?.data || [];
};

const main = async () => {
  const opts = parseArgs();
  log.section(`Facebook 댓글 자동 답글 — ${opts.live ? '실제 게시' : 'DRY RUN (미리보기만)'}`);

  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;
  if (!accessToken || !pageId) {
    log.err('FB_PAGE_ACCESS_TOKEN 또는 FB_PAGE_ID가 없습니다.');
    process.exit(1);
  }

  if (isHalted('facebook')) {
    log.warn('Facebook 비상정지 상태(data/engagement_halt.json) — 봇 탐지 신호가 있었습니다. 건너뜁니다.');
    return;
  }

  const logState = loadLog();
  const repliedSet = new Set(logState.repliedCommentIds);

  const posts = await listOwnPosts(pageId, accessToken);
  log.ok(`최근 게시물 ${posts.length}건 조회`);

  const candidates = [];
  for (const post of posts) {
    let comments;
    try {
      comments = await listComments(post.id, accessToken);
    } catch (err) {
      log.warn(`댓글 조회 실패 (${post.id}): ${err.response?.data?.error?.message || err.message}`);
      continue;
    }
    for (const comment of comments) {
      if (repliedSet.has(comment.id)) continue;
      if (comment.from && comment.from.id === pageId) continue;
      candidates.push({ post, comment });
    }
  }
  log.ok(`답글 안 단 새 댓글 ${candidates.length}건 발견`);

  const picked = candidates.slice(0, opts.max);
  for (const { post, comment } of picked) {
    const draft = await draftThreadReply({ originalPostText: post.message || '', commentText: comment.message || '' });
    if (!draft) {
      log.warn(`답글 초안 생성 실패: ${comment.id}`);
      continue;
    }

    log.step(`게시물 "${(post.message || '').slice(0, 60)}" / "${comment.message}"`);
    log.step(`-> [${draft.language}] ${draft.reply}`);

    if (!opts.live) {
      log.info('[DRY RUN] 게시하지 않음 — 위 답글은 미리보기입니다.');
      continue;
    }

    const gate = canPublishNow('facebook_reply');
    if (!gate.allowed) {
      log.warn(`Facebook 답글 한도/간격 미충족 — 이번 실행 종료 (${gate.reason})`);
      break;
    }

    let success = false;
    try {
      const res = await graphPost(`/${comment.id}/comments`, { message: draft.reply }, accessToken);
      log.ok(`Facebook 답글 발행 완료 (Comment ID: ${res.id})`);
      success = true;
    } catch (err) {
      const apiError = err.response?.data?.error;
      const detail = apiError ? `${apiError.message} (code=${apiError.code})` : err.message;
      log.err(`Facebook 답글 발행 실패: ${detail}`);
      if (checkAndHalt('facebook', detail)) break;
    }
    recordPublishResult('facebook_reply', success);
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
