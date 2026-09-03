const axios = require('axios');
const log = require('../logger');

const REDDIT_API_BASE = 'https://oauth.reddit.com';
const REDDIT_AUTH_BASE = 'https://www.reddit.com/api/v1';

let accessToken = null;
let tokenExpireTime = null;

const getAuthToken = async () => {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error(
      'Reddit 자동화에 필요한 환경변수가 없습니다:\n' +
      'REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD\n' +
      'REDDIT_API_SETUP.md를 참고해 설정해주세요.'
    );
  }

  if (accessToken && tokenExpireTime && Date.now() < tokenExpireTime) {
    return accessToken;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const data = new URLSearchParams({
    grant_type: 'password',
    username: username,
    password: password
  });

  try {
    const response = await axios.post(`${REDDIT_AUTH_BASE}/access_token`, data, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'Land-in-Korea-SNS-Automation/1.0 (by solusupport-bot)',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000
    });

    accessToken = response.data.access_token;
    tokenExpireTime = Date.now() + (response.data.expires_in * 1000) - 60000;

    log.info(`✅ Reddit OAuth 인증 성공 (${Math.round((response.data.expires_in - 60) / 60)}분 유효)`);
    return accessToken;
  } catch (error) {
    const errorMsg = error.response?.data?.error_description || error.message;
    throw new Error(`Reddit 토큰 발급 실패: ${errorMsg}`);
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const publishToReddit = async ({ subreddit, title, text }) => {
  if (!subreddit || !title || !text) {
    throw new Error('필수 파라미터 누락: subreddit, title, text');
  }

  const token = await getAuthToken();

  const data = {
    sr: subreddit,
    title: title,
    text: text,
    kind: 'self'
  };

  try {
    const response = await axios.post(
      `${REDDIT_API_BASE}/api/submit`,
      data,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Land-in-Korea-SNS-Automation/1.0 (by solusupport-bot)',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      }
    );

    if (response.data?.json?.data?.url) {
      const postUrl = response.data.json.data.url;
      log.info(`✅ Reddit 발행 성공: ${postUrl}`);
      return {
        success: true,
        url: postUrl,
        subreddit: subreddit,
        title: title
      };
    } else {
      const error = response.data?.json?.errors?.[0]?.[1];
      throw new Error(error || '미알 오류');
    }
  } catch (error) {
    const errorMsg = error.response?.data?.json?.errors?.[0]?.[1] || error.message;
    log.error(`❌ Reddit 발행 실패 (${subreddit}): ${errorMsg}`);
    throw new Error(`Reddit 발행 실패: ${errorMsg}`);
  }
};

module.exports = {
  publishToReddit,
  getAuthToken
};
