const axios = require('axios');
const log = require('../logger');
const { isPlatformPaused } = require('../scheduler/paused_platforms');

const REDDIT_API_BASE = 'https://oauth.reddit.com';
const REDDIT_AUTH_BASE = 'https://www.reddit.com/api/v1';

let accessToken = null;
let tokenExpireTime = null;

/**
 * 자격증명이 없으면 null을 반환한다(throw하지 않음) — publishToReddit이 이걸 보고
 * 다른 플랫폼(facebook.js 등)과 동일하게 모의 발행으로 대체한다. 여기서 throw하면
 * lib/scheduler/run.js의 publishClaimedPosts가 그 예외를 catch하지 않아 같은 큐
 * 항목의 나머지 플랫폼(Threads/Facebook/Instagram)까지 발행이 통째로 중단되는
 * 사고로 이어진다(2026-09-04 발견 — Reddit 시크릿을 아직 등록하기 전 상태에서
 * 실제로 이 경로를 탈 뻔했다).
 */
const getAuthToken = async () => {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    return null;
  }

  if (accessToken && tokenExpireTime && Date.now() < tokenExpireTime) {
    return accessToken;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const data = new URLSearchParams({
    grant_type: 'password',
    username,
    password
  });

  const response = await axios.post(`${REDDIT_AUTH_BASE}/access_token`, data, {
    headers: {
      Authorization: `Basic ${auth}`,
      'User-Agent': 'Land-in-Korea-SNS-Automation/1.0 (by solusupport-bot)',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 15000
  });

  accessToken = response.data.access_token;
  tokenExpireTime = Date.now() + (response.data.expires_in * 1000) - 60000;

  log.info(`Reddit OAuth 인증 성공 (${Math.round((response.data.expires_in - 60) / 60)}분 유효)`);
  return accessToken;
};

const publishToReddit = async (item) => {
  if (isPlatformPaused('reddit')) {
    log.warn('Reddit 발행 일시 중지 중');
    return null;
  }
  const { subreddit, text } = item;

  if (!subreddit || !text) {
    log.err('Reddit 필수 파라미터 누락: subreddit, text (item.subreddit은 queue 항목에서 추가됨)');
    return null;
  }

  let token;
  try {
    token = await getAuthToken();
  } catch (err) {
    log.err(`Reddit 토큰 발급 실패: ${err.response?.data?.error_description || err.message}`);
    return null;
  }

  if (!token) {
    log.warn('Reddit 자격증명이 없습니다(REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD). 모의 발행을 수행합니다.');
    log.ok(`[Reddit 모의 발행 / r/${subreddit}]\n${text.slice(0, 150)}...`);
    return { id: 'mock_reddit_post_id', subreddit };
  }

  // text의 첫 줄을 title로, 나머지를 본문으로 사용
  const lines = text.split('\n').filter((line) => line.trim());
  const redditTitle = lines[0].length > 300 ? `${lines[0].slice(0, 297)}...` : lines[0];
  const redditBody = lines.slice(1).join('\n').trim();

  const data = {
    sr: subreddit,
    title: redditTitle,
    text: redditBody,
    kind: 'self'
  };

  try {
    const response = await axios.post(`${REDDIT_API_BASE}/api/submit`, data, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Land-in-Korea-SNS-Automation/1.0 (by solusupport-bot)',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000
    });

    const postUrl = response.data?.json?.data?.url;
    if (postUrl) {
      log.ok(`Reddit 발행 완료 (r/${subreddit}): ${postUrl}`);
      return { id: response.data.json.data.id, url: postUrl, subreddit, title: redditTitle };
    }

    const error = response.data?.json?.errors?.[0]?.[1] || '알 수 없는 오류';
    log.err(`Reddit 발행 실패 (r/${subreddit}): ${error}`);
    return null;
  } catch (err) {
    const errorMsg = err.response?.data?.json?.errors?.[0]?.[1] || err.message;
    log.err(`Reddit 발행 실패 (r/${subreddit}): ${errorMsg}`);
    return null;
  }
};

/**
 * 지정한 subreddit들에서 키워드로 글을 검색한다 — "다른 계정 게시물 자동 댓글"의
 * discovery 단계. restrict_sr=on으로 해당 subreddit 안에서만 찾는다.
 */
const searchReddit = async ({ subreddits, query, limit = 10, sort = 'new' }) => {
  const token = await getAuthToken();
  if (!token) {
    log.warn('Reddit 자격증명이 없어 검색을 건너뜁니다.');
    return [];
  }

  const results = [];
  for (const subreddit of subreddits) {
    try {
      const res = await axios.get(`${REDDIT_API_BASE}/r/${subreddit}/search`, {
        params: { q: query, restrict_sr: 'on', sort, limit, t: 'week' },
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Land-in-Korea-SNS-Automation/1.0 (by solusupport-bot)'
        },
        timeout: 15000
      });
      const posts = (res.data?.data?.children || []).map((c) => c.data);
      results.push(...posts.map((p) => ({
        id: p.name, // t3_xxxxx — 댓글 달 때 thing_id로 그대로 씀
        subreddit: p.subreddit,
        title: p.title,
        selftext: p.selftext || '',
        author: p.author,
        permalink: `https://www.reddit.com${p.permalink}`,
        createdUtc: p.created_utc
      })));
    } catch (err) {
      log.warn(`Reddit 검색 실패 (r/${subreddit}): ${err.response?.data?.message || err.message}`);
    }
  }
  return results;
};

/** 다른 사람 게시물(또는 댓글)에 댓글을 단다. thingId는 t3_(글)/t1_(댓글) 접두사 포함 fullname. */
const postRedditComment = async ({ thingId, text }) => {
  if (isPlatformPaused('reddit')) {
    log.warn('Reddit 발행 일시 중지 중 — 댓글도 건너뜁니다.');
    return null;
  }
  const token = await getAuthToken();
  if (!token) {
    log.warn('Reddit 자격증명이 없습니다. 모의 댓글을 수행합니다.');
    log.ok(`[Reddit 모의 댓글 -> ${thingId}]\n${text.slice(0, 150)}`);
    return { id: 'mock_reddit_comment_id' };
  }

  try {
    const res = await axios.post(
      `${REDDIT_API_BASE}/api/comment`,
      new URLSearchParams({ api_type: 'json', thing_id: thingId, text }).toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Land-in-Korea-SNS-Automation/1.0 (by solusupport-bot)',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      }
    );
    const errors = res.data?.json?.errors;
    if (errors && errors.length) {
      log.err(`Reddit 댓글 실패 (${thingId}): ${errors[0][1]}`);
      return null;
    }
    const comment = res.data?.json?.data?.things?.[0]?.data;
    log.ok(`Reddit 댓글 발행 완료: https://reddit.com${comment?.permalink || ''}`);
    return { id: comment?.name, url: comment?.permalink ? `https://reddit.com${comment.permalink}` : null };
  } catch (err) {
    const errorMsg = err.response?.data?.json?.errors?.[0]?.[1] || err.message;
    log.err(`Reddit 댓글 실패 (${thingId}): ${errorMsg}`);
    return null;
  }
};

module.exports = {
  publishToReddit,
  getAuthToken,
  searchReddit,
  postRedditComment
};
