import { buildResponse } from './rules.js';

const GRAPH_VERSION = 'v26.0';
const MAX_PER_HOUR = 6;
const MAX_PER_DAY = 20;
const USER_COOLDOWN_SECONDS = 6 * 60 * 60;
const FAILURE_BLOCK_SECONDS = 6 * 60 * 60;
const MAX_ATTEMPTS = 2;

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

export async function verifyMetaSignature(rawBody, signature, secret) {
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, rawBody);
  const expected = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return safeEqual(expected, signature.slice(7).toLowerCase());
}

export function extractComments(payload, ownAccountId = '') {
  const comments = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      if (change.field === 'feed' && value.item !== 'comment') continue;
      if (value.verb && value.verb !== 'add') continue;
      const commentId = value.id || value.comment_id;
      const text = value.text || value.message || '';
      const userId = value.from?.id || value.sender?.id || 'unknown';
      if (!commentId || !text || (ownAccountId && userId === ownAccountId)) continue;
      comments.push({ commentId: String(commentId), userId: String(userId), text: String(text).slice(0, 1000) });
    }
  }
  return comments;
}

async function enqueueComment(env, comment, nowSeconds) {
  const response = buildResponse(comment.text);
  if (!response) return 'ignored';
  const dueAt = nowSeconds + 60 + Math.floor(Math.random() * 241);
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO reply_jobs
      (comment_id, user_id, topic, action, public_text, private_text, status, due_at, created_at, attempts)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0)
  `).bind(
    comment.commentId,
    comment.userId,
    response.topic,
    response.action,
    response.publicText,
    response.privateText,
    dueAt,
    nowSeconds
  ).run();
  return result.meta?.changes ? 'queued' : 'duplicate';
}

async function getRuntimeState(env) {
  return env.DB.prepare('SELECT consecutive_failures, blocked_until FROM runtime_state WHERE id = 1').first();
}

async function withinLimits(env, userId, nowSeconds) {
  const state = await getRuntimeState(env);
  if (state?.blocked_until && state.blocked_until > nowSeconds) return { allowed: false, retryAt: state.blocked_until };

  const counts = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN completed_at >= ? THEN 1 ELSE 0 END) AS hour_count,
      SUM(CASE WHEN completed_at >= ? THEN 1 ELSE 0 END) AS day_count
    FROM reply_jobs WHERE status = 'sent'
  `).bind(nowSeconds - 3600, nowSeconds - 86400).first();
  if ((counts?.hour_count || 0) >= MAX_PER_HOUR) return { allowed: false, retryAt: nowSeconds + 3600 };
  if ((counts?.day_count || 0) >= MAX_PER_DAY) return { allowed: false, retryAt: nowSeconds + 6 * 3600 };

  const recentUserReply = await env.DB.prepare(`
    SELECT completed_at FROM reply_jobs
    WHERE user_id = ? AND status = 'sent' AND completed_at >= ?
    ORDER BY completed_at DESC LIMIT 1
  `).bind(userId, nowSeconds - USER_COOLDOWN_SECONDS).first();
  if (recentUserReply) return { allowed: false, retryAt: recentUserReply.completed_at + USER_COOLDOWN_SECONDS };
  return { allowed: true };
}

async function callMeta(env, path, body) {
  const base = env.META_GRAPH_BASE || `https://graph.instagram.com/${GRAPH_VERSION}`;
  const response = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.IG_ACCESS_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Meta API ${response.status}`);
    error.status = response.status;
    error.code = data?.error?.code;
    error.transient = response.status === 429 || response.status >= 500 || data?.error?.is_transient === true;
    throw error;
  }
  return data;
}

async function sendJob(env, job) {
  if (job.action === 'private_reply') {
    await callMeta(env, `${env.IG_USER_ID}/messages`, {
      recipient: { comment_id: job.comment_id },
      message: { text: job.private_text }
    });
  }
  await callMeta(env, `${job.comment_id}/replies`, { message: job.public_text });
}

async function recordFailure(env, job, error, nowSeconds) {
  const attempts = job.attempts + 1;
  const retry = error.transient && attempts < MAX_ATTEMPTS;
  await env.DB.prepare(`
    UPDATE reply_jobs SET status = ?, attempts = ?, last_error = ?, due_at = ?, attempted_at = ?
    WHERE comment_id = ?
  `).bind(
    retry ? 'pending' : 'failed',
    attempts,
    String(error.message).slice(0, 500),
    retry ? nowSeconds + 30 * 60 : job.due_at,
    nowSeconds,
    job.comment_id
  ).run();

  const state = await getRuntimeState(env);
  const consecutive = (state?.consecutive_failures || 0) + 1;
  const blockedUntil = consecutive >= 2 ? nowSeconds + FAILURE_BLOCK_SECONDS : 0;
  await env.DB.prepare(`
    UPDATE runtime_state SET consecutive_failures = ?, blocked_until = ?, updated_at = ? WHERE id = 1
  `).bind(consecutive, blockedUntil, nowSeconds).run();
}

async function processQueue(env) {
  if (!env.IG_ACCESS_TOKEN || !env.IG_USER_ID) return;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const { results: jobs = [] } = await env.DB.prepare(`
    SELECT * FROM reply_jobs WHERE status = 'pending' AND due_at <= ?
    ORDER BY due_at ASC LIMIT 2
  `).bind(nowSeconds).all();

  for (const job of jobs) {
    const limit = await withinLimits(env, job.user_id, nowSeconds);
    if (!limit.allowed) {
      await env.DB.prepare('UPDATE reply_jobs SET due_at = ? WHERE comment_id = ?')
        .bind(limit.retryAt, job.comment_id).run();
      continue;
    }

    await env.DB.prepare("UPDATE reply_jobs SET status = 'sending', attempted_at = ? WHERE comment_id = ? AND status = 'pending'")
      .bind(nowSeconds, job.comment_id).run();
    try {
      await sendJob(env, job);
      await env.DB.batch([
        env.DB.prepare("UPDATE reply_jobs SET status = 'sent', attempts = attempts + 1, completed_at = ?, last_error = NULL WHERE comment_id = ?")
          .bind(nowSeconds, job.comment_id),
        env.DB.prepare('UPDATE runtime_state SET consecutive_failures = 0, blocked_until = 0, updated_at = ? WHERE id = 1')
          .bind(nowSeconds)
      ]);
    } catch (error) {
      await recordFailure(env, job, error, nowSeconds);
    }
  }
}

async function adminStatus(request, env) {
  if (!env.ADMIN_TOKEN || request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: 'unauthorized' }, 401);
  }
  const counts = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM reply_jobs GROUP BY status').all();
  const state = await getRuntimeState(env);
  return json({ service: 'land-in-korea-engagement', jobs: counts.results || [], safety: state });
}

async function handleFetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ ok: true, service: 'land-in-korea-engagement' });
  if (url.pathname === '/admin/status') return adminStatus(request, env);
  if (url.pathname !== '/webhook') return json({ error: 'not_found' }, 404);

  if (request.method === 'GET') {
    const valid = url.searchParams.get('hub.mode') === 'subscribe'
      && url.searchParams.get('hub.verify_token') === env.META_VERIFY_TOKEN;
    return valid ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('Forbidden', { status: 403 });
  }
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const rawBody = await request.arrayBuffer();
  const verified = await verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), env.META_APP_SECRET);
  if (!verified) return json({ error: 'invalid_signature' }, 403);

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const comments = extractComments(payload, env.IG_USER_ID);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const outcomes = [];
  for (const comment of comments.slice(0, 20)) outcomes.push(await enqueueComment(env, comment, nowSeconds));
  return json({ received: comments.length, queued: outcomes.filter((value) => value === 'queued').length });
}

export default {
  fetch: handleFetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(processQueue(env));
  }
};

export const __test = { handleFetch, processQueue, safeEqual };
