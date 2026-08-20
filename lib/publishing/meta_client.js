const axios = require('axios');

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Meta Graph API에 POST 요청을 보내는 공통 헬퍼입니다.
 * Facebook Page / Instagram Business 발행 모듈이 공유해서 사용합니다.
 */
const graphPost = async (path, params, accessToken) => {
  const res = await axios.post(`${GRAPH_API_BASE}${path}`, null, {
    params: { ...params, access_token: accessToken },
    timeout: 15000
  });
  return res.data;
};

module.exports = { GRAPH_API_BASE, graphPost };
