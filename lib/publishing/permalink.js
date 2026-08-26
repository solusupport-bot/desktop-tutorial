const axios = require('axios');
const { instagramGraphGet } = require('./meta_client');

/**
 * 발행 응답(id)만으로는 게시글이 실제로 보이는지 확인할 수 없어서,
 * 사람이 눈으로 확인할 수 있는 실제 공개 URL을 플랫폼별로 조회한다.
 */
const getInstagramPermalink = async (mediaId) => {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  return instagramGraphGet(`/${mediaId}`, { fields: 'permalink,timestamp,caption' }, accessToken);
};

const getFacebookPermalink = async (postId) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const res = await axios.get(`https://graph.facebook.com/v21.0/${postId}`, {
    params: { fields: 'permalink_url', access_token: accessToken },
    timeout: 15000
  });
  return res.data;
};

const getThreadsPermalink = async (mediaId) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const res = await axios.get(`https://graph.threads.com/v1.0/${mediaId}`, {
    params: { fields: 'permalink', access_token: accessToken },
    timeout: 15000
  });
  return res.data;
};

const getPermalink = async (platform, id) => {
  if (platform === 'instagram') return getInstagramPermalink(id);
  if (platform === 'facebook') return getFacebookPermalink(id);
  if (platform === 'threads') return getThreadsPermalink(id);
  throw new Error(`알 수 없는 플랫폼: ${platform}`);
};

module.exports = { getInstagramPermalink, getFacebookPermalink, getThreadsPermalink, getPermalink };
