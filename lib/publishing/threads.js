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
 * 첫 문단(훅)만 남기고 나머지(디테일+질문 CTA)는 답글용으로 분리합니다.
 * curate.js의 Threads 포맷은 보통 "훅 -> 관찰 1~2개 -> 주의사항 -> 질문"을 빈 줄로
 * 구분하지만, Claude가 항상 그렇게 쓴다는 보장이 없다 — 실제로 빈 줄 없이 한 줄바꿈만
 * 쓴 게시물이 나와 답글이 조용히 스킵된 적이 있음(2026-08-29). 빈 줄(\n\n)을 먼저
 * 찾고, 없으면 첫 줄바꿈(\n) 하나만으로도 나눈다. 그마저 없으면(한 줄짜리 게시물)
 * 나눌 수 없으니 훅=전체, reply=null.
 */
const splitHookAndReply = (text) => {
  const paragraphBreak = text.indexOf('\n\n');
  if (paragraphBreak !== -1) {
    return { hook: text.slice(0, paragraphBreak).trim(), reply: text.slice(paragraphBreak + 2).trim() };
  }
  const lineBreak = text.indexOf('\n');
  if (lineBreak !== -1) {
    return { hook: text.slice(0, lineBreak).trim(), reply: text.slice(lineBreak + 1).trim() };
  }
  return { hook: text, reply: null };
};

const publishTextReply = async ({ userId, accessToken, text, replyToId }) => {
  const form = new URLSearchParams({
    media_type: 'TEXT',
    text,
    reply_to_id: replyToId,
    access_token: accessToken
  });
  const res = await axios.post(`${THREADS_API_BASE}/${userId}/threads`, form.toString(), { headers: THREADS_HEADERS, timeout: 15000 });
  const creationId = res.data?.id;
  if (!creationId) throw new Error('답글 컨테이너 생성 실패');

  const publishForm = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
  const publishRes = await axios.post(`${THREADS_API_BASE}/${userId}/threads_publish`, publishForm.toString(), { headers: THREADS_HEADERS, timeout: 15000 });
  return publishRes.data?.id;
};

/**
 * Threads 공식 API로 텍스트/단일 이미지/캐로셀(2장 이상) 게시글을 발행합니다.
 * API는 form-urlencoded 본문과 access_token 매개변수를 요구합니다.
 *
 * imageUrls(2장 이상)가 있으면 캐로셀로 발행합니다 — 벤치마킹한 고성과
 * Threads 게시물들의 공통 구조(1장에 정보를 다 안 담고 2장째로 스와이프하게
 * 만드는 것)를 반영한 것으로, 스와이프 자체가 체류시간/상호작용 신호가 됩니다.
 * imageUrls가 1장뿐이면 단일 이미지로, 없으면 텍스트 전용으로 자동 대체합니다.
 *
 * 텍스트(영상 캡션 제외 — videoUrl일 땐 분리하지 않음)에 문단이 2개 이상이면
 * 첫 문단(훅)만 원 게시물로 올리고, 나머지(디테일+질문)는 그 게시물에 대한
 * 답글로 따로 발행합니다 — 1페이지(훅)/2페이지(디테일)로 나눠 스레드 형태로
 * 올려달라는 요청(2026-08-29)에 따른 것으로, 답글까지 눌러보게 만들어 체류시간과
 * 상호작용 기회를 한 번 더 만듭니다.
 */
const publishToThreads = async ({ text, imageUrl, imageUrls, videoUrl }) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : []);
  // 영상 캡션은 나누지 않는다(영상 자체가 이미 체류시간을 만들어주고, 캡션에 굳이
  // 답글 구조를 강제할 필요가 없다) — 이미지/캐로셀/텍스트 전용일 때만 분리한다.
  const { hook, reply } = videoUrl ? { hook: text, reply: null } : splitHookAndReply(text);

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
      // 실제 테스트에서 Instagram Reels는 같은 영상 처리에 ~80초가 걸렸다 —
      // Threads도 이미지(20회x3초=60초)보다 훨씬 오래 걸릴 수 있어 60회x3초=180초로 늘림.
      await waitForThreadsContainer(creationId, accessToken, 60);
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
      if (hook) carouselForm.set('text', hook);

      const carouselRes = await axios.post(
        `${THREADS_API_BASE}/${userId}/threads`,
        carouselForm.toString(),
        { headers: THREADS_HEADERS, timeout: 15000 }
      );
      creationId = carouselRes.data?.id;
      if (!creationId) throw new Error('캐로셀 컨테이너 생성 실패');
      await waitForThreadsContainer(creationId, accessToken);
    } else if (images.length === 1) {
      creationId = await createItemContainer({ userId, accessToken, imageUrl: images[0], text: hook, isCarouselItem: false });
      await waitForThreadsContainer(creationId, accessToken);
    } else {
      const containerForm = new URLSearchParams({ media_type: 'TEXT', access_token: accessToken });
      if (hook) containerForm.set('text', hook);
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

    // 답글은 별도 게시물이라 실패해도 원 게시물 발행 자체는 이미 성공한 것 —
    // 답글 실패로 전체를 실패 처리하지 않고 경고만 남긴다.
    // 발행 직후 곧바로 reply_to_id로 답글을 달면 "리소스를 찾을 수 없음"(code=24,
    // subcode=4279009)이 나는 걸 실측 확인함 — 방금 만든 게시물이 Threads 서버에
    // 답글 가능한 상태로 완전히 반영되기 전이라 그런 것으로 보여, 대기 후 1회
    // 재시도한다.
    if (reply) {
      let lastErr;
      for (const delayMs of [3000, 5000]) {
        await wait(delayMs);
        try {
          const replyId = await publishTextReply({ userId, accessToken, text: reply, replyToId: publishRes.data.id });
          log.ok(`Threads 답글(2페이지) 발행 완료 (Media ID: ${replyId})`);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) {
        const apiError = lastErr.response?.data?.error;
        const message = apiError ? `${apiError.message} (code=${apiError.code}, subcode=${apiError.error_subcode})` : lastErr.message;
        log.warn(`Threads 답글(2페이지) 발행 실패(원 게시물은 정상, 재시도 포함): ${message}`);
      }
    }

    return publishRes.data;
  } catch (err) {
    const apiError = err.response?.data?.error;
    const message = apiError ? `${apiError.message} (type=${apiError.type}, code=${apiError.code}, subcode=${apiError.error_subcode}, trace=${apiError.fbtrace_id})` : err.message;
    log.err(`Threads 발행 실패: ${message}`);
    return null;
  }
};

module.exports = { publishToThreads };
