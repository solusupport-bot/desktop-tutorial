const axios = require('axios');
const log = require('../logger');

// Meta 공식 Threads Posts 문서의 현재 Graph API 호스트를 사용합니다.
const THREADS_API_BASE = 'https://graph.threads.com/v1.0';
const THREADS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded'
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createItemContainer = async ({ userId, accessToken, imageUrl, text, isCarouselItem }) => {
  const form = new URLSearchParams({
    media_type: 'IMAGE',
    image_url: imageUrl,
    access_token: accessToken
  });
  if (isCarouselItem) form.set('is_carousel_item', 'true');
  if (text && !isCarouselItem) form.set('text', text);

  const res = await axios.post(
    `${THREADS_API_BASE}/${userId}/threads`,
    form.toString(),
    { headers: THREADS_HEADERS, timeout: 15000 }
  );
  const id = res.data?.id;
  if (!id) throw new Error('미디어 컨테이너 생성 실패');
  return id;
};

/**
 * 캐로셀 아이템 컨테이너를 만들자마자 바로 CAROUSEL 래퍼에 참조하면
 * "Invalid parameter" 오류가 난다 — Instagram과 마찬가지로 Threads도
 * 이미지 처리가 끝나 status가 FINISHED가 될 때까지 기다려야 한다.
 */
const waitForThreadsContainer = async (creationId, accessToken, maxAttempts = 10) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await axios.get(`${THREADS_API_BASE}/${creationId}`, {
      params: { fields: 'status,error_message', access_token: accessToken },
      timeout: 15000
    });
    const status = res.data?.status;
    if (status === 'FINISHED') return;
    if (['ERROR', 'EXPIRED'].includes(status)) {
      throw new Error(`미디어 컨테이너 처리 실패 (${status}): ${res.data?.error_message || ''}`);
    }
    if (attempt < maxAttempts) await wait(3000);
  }
  throw new Error('미디어 컨테이너 처리 시간 초과');
};

/**
 * Threads 공식 API로 텍스트/단일 이미지/캐로셀(2장 이상) 게시글을 발행합니다.
 * API는 form-urlencoded 본문과 access_token 매개변수를 요구합니다.
 *
 * imageUrls(2장 이상)가 있으면 캐로셀로 발행합니다 — 벤치마킹한 고성과
 * Threads 게시물들의 공통 구조(1장에 정보를 다 안 담고 2장째로 스와이프하게
 * 만드는 것)를 반영한 것으로, 스와이프 자체가 체류시간/상호작용 신호가 됩니다.
 * imageUrls가 1장뿐이면 단일 이미지로, 없으면 텍스트 전용으로 자동 대체합니다.
 */
const publishToThreads = async ({ text, imageUrl, imageUrls, videoUrl }) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : []);

  if (!accessToken || !userId) {
    log.warn('THREADS_ACCESS_TOKEN 또는 THREADS_USER_ID가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Threads 모의 발행${videoUrl ? ' / 영상' : images.length > 1 ? ` / 캐로셀 ${images.length}장` : ''}]\n${text.slice(0, 150)}...`);
    return { id: 'mock_threads_media_id' };
  }

  try {
    let creationId;

    if (videoUrl) {
      const videoForm = new URLSearchParams({
        media_type: 'VIDEO',
        video_url: videoUrl,
        access_token: accessToken
      });
      if (text) videoForm.set('text', text);
      const videoRes = await axios.post(
        `${THREADS_API_BASE}/${userId}/threads`,
        videoForm.toString(),
        { headers: THREADS_HEADERS, timeout: 15000 }
      );
      creationId = videoRes.data?.id;
      if (!creationId) throw new Error('영상 컨테이너 생성 실패');
      await waitForThreadsContainer(creationId, accessToken, 20);
    } else if (images.length > 1) {
      const itemIds = [];
      for (const url of images) {
        const itemId = await createItemContainer({ userId, accessToken, imageUrl: url, isCarouselItem: true });
        await waitForThreadsContainer(itemId, accessToken);
        itemIds.push(itemId);
      }

      const carouselForm = new URLSearchParams({
        media_type: 'CAROUSEL',
        children: itemIds.join(','),
        access_token: accessToken
      });
      if (text) carouselForm.set('text', text);

      const carouselRes = await axios.post(
        `${THREADS_API_BASE}/${userId}/threads`,
        carouselForm.toString(),
        { headers: THREADS_HEADERS, timeout: 15000 }
      );
      creationId = carouselRes.data?.id;
      if (!creationId) throw new Error('캐로셀 컨테이너 생성 실패');
      await waitForThreadsContainer(creationId, accessToken);
    } else if (images.length === 1) {
      creationId = await createItemContainer({ userId, accessToken, imageUrl: images[0], text, isCarouselItem: false });
      await waitForThreadsContainer(creationId, accessToken);
    } else {
      const containerForm = new URLSearchParams({ media_type: 'TEXT', access_token: accessToken });
      if (text) containerForm.set('text', text);
      const containerRes = await axios.post(
        `${THREADS_API_BASE}/${userId}/threads`,
        containerForm.toString(),
        { headers: THREADS_HEADERS, timeout: 15000 }
      );
      creationId = containerRes.data?.id;
      if (!creationId) throw new Error('미디어 컨테이너 생성 실패');
    }

    const publishForm = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken
    });
    const publishRes = await axios.post(
      `${THREADS_API_BASE}/${userId}/threads_publish`,
      publishForm.toString(),
      { headers: THREADS_HEADERS, timeout: 15000 }
    );

    log.ok(`Threads 발행 완료 (Media ID: ${publishRes.data?.id}${videoUrl ? ', 영상' : images.length > 1 ? `, 캐로셀 ${images.length}장` : ''})`);
    return publishRes.data;
  } catch (err) {
    const apiError = err.response?.data?.error;
    const message = apiError ? `${apiError.message} (type=${apiError.type}, code=${apiError.code}, subcode=${apiError.error_subcode}, trace=${apiError.fbtrace_id})` : err.message;
    log.err(`Threads 발행 실패: ${message}`);
    return null;
  }
};

module.exports = { publishToThreads };
