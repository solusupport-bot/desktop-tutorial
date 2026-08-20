const axios = require('axios');
const log = require('../logger');

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

/**
 * Threads 공식 API(Graph API)로 텍스트/이미지 게시글을 발행합니다.
 * THREADS_ACCESS_TOKEN/THREADS_USER_ID가 없으면 모의 발행으로 대체합니다.
 */
const publishToThreads = async ({ text, imageUrl }) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;

  if (!accessToken || !userId) {
    log.warn('THREADS_ACCESS_TOKEN 또는 THREADS_USER_ID가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Threads 모의 발행]\n${text.slice(0, 150)}...`);
    return { id: 'mock_threads_media_id' };
  }

  try {
    const payload = { media_type: imageUrl ? 'IMAGE' : 'TEXT', text };
    if (imageUrl) payload.image_url = imageUrl;

    const containerRes = await axios.post(`${THREADS_API_BASE}/${userId}/threads`, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000
    });
    const containerId = containerRes.data?.id;
    if (!containerId) throw new Error('미디어 컨테이너 생성 실패');

    const publishRes = await axios.post(`${THREADS_API_BASE}/${userId}/threads_publish`, {
      creation_id: containerId
    }, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000
    });

    log.ok(`Threads 발행 완료 (Media ID: ${publishRes.data?.id})`);
    return publishRes.data;
  } catch (err) {
    log.err(`Threads 발행 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

module.exports = { publishToThreads };
