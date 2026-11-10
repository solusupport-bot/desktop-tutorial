#!/usr/bin/env node
/**
 * 일회성 스크립트: lib/curation/curate.js의 PROMISE_OPENERS에서 제거한
 * "The guidebooks skip this part entirely." 문구로 이미 나간 글을 정리한다
 * (2026-11-11 사용자 지시 — "잘못나간 글은 수정이 안된다면 삭제하던지 해줘라").
 *
 * - status가 published/partial인 항목: 실제 플랫폼 게시물을 API로 삭제 시도.
 *   Threads는 이 앱 토큰으로 삭제 권한이 없는 걸로 이전에 확인된 바 있어(참고:
 *   scripts/delete-duplicate-posts.js) 실패하면 수동 삭제가 필요하다고 보고만 한다.
 * - status가 pending인 항목: 아직 안 나갔으므로 API 호출 없이 큐에서 rejected로
 *   돌려 발행을 막는다.
 * - 각 항목 처리 결과를 data/queue.json에 반영한다(파일 저장은 호출부/워크플로가 커밋).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const log = require('../lib/logger');
const { GRAPH_API_BASE, INSTAGRAM_GRAPH_API_BASE } = require('../lib/publishing/meta_client');
const { deleteBlueskyPost } = require('../lib/publishing/bluesky');

const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.json');
const BAD_TEXT = 'guidebooks skip this part entirely';

const deleteThreadsPost = async (id) => {
  try {
    await axios.delete(`https://graph.threads.com/v1.0/${id}`, {
      params: { access_token: process.env.THREADS_ACCESS_TOKEN },
      timeout: 15000
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err.response?.data?.error?.message || err.message };
  }
};

const deleteFacebookPost = async (id) => {
  try {
    await axios.delete(`${GRAPH_API_BASE}/${id}`, {
      params: { access_token: process.env.FB_PAGE_ACCESS_TOKEN },
      timeout: 15000
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err.response?.data?.error?.message || err.message };
  }
};

const deleteInstagramPost = async (id) => {
  try {
    await axios.delete(`${INSTAGRAM_GRAPH_API_BASE}/${id}`, {
      params: { access_token: process.env.IG_ACCESS_TOKEN },
      timeout: 15000
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err.response?.data?.error?.message || err.message };
  }
};

const deleteMastodonPost = async (id) => {
  const instance = (process.env.MASTODON_INSTANCE || '').replace(/\/+$/, '');
  try {
    await axios.delete(`${instance}/api/v1/statuses/${id}`, {
      headers: { Authorization: `Bearer ${process.env.MASTODON_ACCESS_TOKEN}` },
      timeout: 15000
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err.response?.data?.error || err.message };
  }
};

const deleteOnPlatform = async (platform, item) => {
  const result = item.results?.[platform];
  if (!result || !result.id) return { ok: false, detail: '이 플랫폼에 실제 게시물 id가 없음(발행 실패였던 것으로 보임)' };
  if (platform === 'threads') return deleteThreadsPost(result.id);
  if (platform === 'facebook') return deleteFacebookPost(result.id);
  if (platform === 'instagram') return deleteInstagramPost(result.id);
  if (platform === 'bluesky') return deleteBlueskyPost({ rkey: result.id.split('/').pop() });
  if (platform === 'mastodon') return deleteMastodonPost(result.id);
  return { ok: false, detail: `알 수 없는 플랫폼: ${platform}` };
};

const main = async () => {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  const hits = queue.filter((item) => (item.text || '').includes(BAD_TEXT));
  log.section(`"${BAD_TEXT}" 포함 항목 ${hits.length}건 처리`);

  let cancelled = 0;
  let deleted = 0;
  let failed = 0;

  for (const item of hits) {
    if (item.status === 'pending') {
      item.status = 'rejected';
      item.rejectReason = 'guidebooks-opener-cleanup';
      cancelled += 1;
      log.ok(`[${item.id}] 아직 미발행 — rejected로 전환`);
      continue;
    }
    if (item.status !== 'published' && item.status !== 'partial') continue;

    const platformResults = {};
    for (const platform of item.platforms || []) {
      const res = await deleteOnPlatform(platform, item);
      platformResults[platform] = res;
      if (res.ok) {
        log.ok(`[${item.id}] ${platform} 삭제 성공`);
        deleted += 1;
      } else {
        log.err(`[${item.id}] ${platform} 삭제 실패: ${res.detail}`);
        failed += 1;
      }
    }
    item.cleanupResults = platformResults;
    const allOk = Object.values(platformResults).every((r) => r.ok);
    item.status = allOk ? 'deleted' : 'delete_failed';
  }

  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
  log.section(`완료 — 발행취소 ${cancelled}건, 삭제성공 ${deleted}건, 삭제실패 ${failed}건`);
};

main().catch((err) => {
  log.err(`실패: ${err.message}`);
  process.exitCode = 1;
});
