const axios = require('axios');

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';
const INSTAGRAM_GRAPH_API_BASE = 'https://graph.instagram.com/v26.0';

/**
 * Meta Graph API에 POST 요청을 보내는 공통 헬퍼입니다.
 * Facebook Page 발행 모듈에서 사용합니다.
 */
const graphPost = async (path, params, accessToken) => {
  const res = await axios.post(`${GRAPH_API_BASE}${path}`, null, {
    params: { ...params, access_token: accessToken },
    timeout: 15000
  });
  return res.data;
};

/**
 * Business Login for Instagram으로 발급된 Instagram User 토큰용 POST 헬퍼입니다.
 * Instagram Login 구성은 graph.instagram.com 호스트를 사용합니다.
 */
const instagramGraphPost = async (path, params, accessToken) => {
  const res = await axios.post(`${INSTAGRAM_GRAPH_API_BASE}${path}`, null, {
    params: { ...params, access_token: accessToken },
    timeout: 15000
  });
  return res.data;
};

/**
 * Instagram 미디어 컨테이너 상태 조회용 GET 헬퍼입니다.
 */
const instagramGraphGet = async (path, params, accessToken) => {
  const res = await axios.get(`${INSTAGRAM_GRAPH_API_BASE}${path}`, {
    params: { ...params, access_token: accessToken },
    timeout: 15000
  });
  return res.data;
};

module.exports = {
  GRAPH_API_BASE,
  INSTAGRAM_GRAPH_API_BASE,
  graphPost,
  instagramGraphPost,
  instagramGraphGet
};
