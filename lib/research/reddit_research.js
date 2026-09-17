const axios = require('axios');
const log = require('../logger');

// 2026-09-17 사용자 요청: 주제 자동생성(scripts/generate-topics.js)이 Claude의 일반
// 지식만으로 "뾰족한" 주제를 짜내는 대신, 실제 여행자들이 지금 뭘 궁금해하는지
// Reddit에서 읽어와 재료로 쓴다. lib/publishing/reddit.js(발행용, 실제 계정 로그인
// 필요)와는 완전히 분리한다 — grant_type=client_credentials(앱 전용 OAuth)는
// client_id/secret만으로 읽기 전용 접근이 되고 사용자 계정 로그인이 필요 없어서,
// 리서치 코드에 버그가 있어도 실제 발행 계정(REDDIT_USERNAME)에는 영향이 전혀
// 없다 — 공식 API라 계정 정지 위험도 없다(Agent-Reach류 쿠키 로그인 방식과 다름).
const REDDIT_AUTH_BASE = 'https://www.reddit.com/api/v1';
const REDDIT_API_BASE = 'https://oauth.reddit.com';
const USER_AGENT = 'land-in-korea-research/1.0';

let cachedToken = null;
let tokenExpireTime = null;

const getReadOnlyToken = async () => {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedToken && tokenExpireTime && Date.now() < tokenExpireTime) {
    return cachedToken;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await axios.post(
    `${REDDIT_AUTH_BASE}/access_token`,
    new URLSearchParams({ grant_type: 'client_credentials' }),
    { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT } }
  );
  cachedToken = res.data.access_token;
  tokenExpireTime = Date.now() + (res.data.expires_in - 60) * 1000;
  return cachedToken;
};

/**
 * subreddit의 최근 인기글 제목 목록을 반환한다(리서치용 — 실제 답글/발행은 안 함).
 * 자격증명이 없거나 호출이 실패하면 빈 배열을 반환해 호출부가 조용히 폴백하게 한다.
 */
const getHotPostTitles = async (subreddit, limit = 15) => {
  try {
    const token = await getReadOnlyToken();
    if (!token) {
      log.warn('REDDIT_CLIENT_ID/SECRET이 없어 Reddit 리서치를 건너뜁니다.');
      return [];
    }
    const res = await axios.get(`${REDDIT_API_BASE}/r/${subreddit}/hot`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
      params: { limit }
    });
    return (res.data?.data?.children || [])
      .map((c) => c.data)
      .filter((p) => !p.stickied)
      .map((p) => ({ title: p.title, score: p.score, numComments: p.num_comments, url: `https://reddit.com${p.permalink}` }));
  } catch (err) {
    log.warn(`Reddit 리서치 실패(r/${subreddit}): ${err.response?.data?.message || err.message}`);
    return [];
  }
};

module.exports = { getHotPostTitles };
