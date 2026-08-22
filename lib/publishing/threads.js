const axios = require('axios');
const log = require('../logger');

// Meta 공식 Threads Posts 문서의 현재 Graph API 호스트를 사용합니다.
const THREADS_API_BASE = 'https://graph.threads.com/v1.0';
const THREADS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded'
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Threads 공식 API로 텍스트 또는 이미지 게시글을 발행합니다.
 * API는 form-urlencoded 본문과 access_token 매개변수를 요구합니다.
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
    const containerForm = new URLSearchParams({
      media_type: imageUrl ? 'IMAGE' : 'TEXT',
      access_token: accessToken
    });
    if (text) containerForm.set('text', text);
    if (imageUrl) containerForm.set('image_url', imageUrl);

    const containerRes = await axios.post(
      `${THREADS_API_BASE}/${userId}/threads`,
      containerForm.toString(),
      { headers: THREADS_HEADERS, timeout: 15000 }
    );

    const containerId = containerRes.data?.id;
    if (!containerId) throw new Error('미디어 컨테이너 생성 실패');

    // Meta는 이미지 컨테이너가 처리되도록 평균 30초 대기를 권장합니다.
    if (imageUrl) await wait(30000);

    const publishForm = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken
    });
    const publishRes = await axios.post(
      `${THREADS_API_BASE}/${userId}/threads_publish`,
      publishForm.toString(),
      { headers: THREADS_HEADERS, timeout: 15000 }
    );

    log.ok(`Threads 발행 완료 (Media ID: ${publishRes.data?.id})`);
    return publishRes.data;
  } catch (err) {
    const message = err.response?.data?.error?.message || err.message;
    log.err(`Threads 발행 실패: ${message}`);
    return null;
  }
};

module.exports = { publishToThreads };
