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

// 한 게시물 안에 담을 최대 조각 수(훅 1개 + 답글 최대 4개) — 벤치마킹한 고성과 계정들의
// 답글 체인 구조(훅 -> 포인트 여러 개 -> 마무리 질문)를 참고해 2단(훅/디테일)보다
// 늘렸다(2026-08-31 사용자 요청: "~5개 정도로 만들어서 답글 식으로 정리해줘").
const MAX_THREAD_PARTS = 5;

/**
 * 본문을 빈 줄(문단) 기준으로 최대 MAX_THREAD_PARTS 조각으로 나눕니다. 첫 조각이
 * 원 게시물(훅)이 되고, 나머지는 순서대로 답글 체인이 됩니다.
 * curate.js의 Threads 포맷은 보통 "훅 -> 관찰 -> 관찰 -> 주의사항 -> 질문"을 빈 줄로
 * 구분하지만, Claude나 사람이 항상 그렇게 쓴다는 보장이 없다 — 실제로 빈 줄 없이 한 줄바꿈만
 * 쓴 게시물이 나와 답글이 조용히 스킵된 적이 있음(2026-08-29). 빈 줄(\n\n)을 먼저
 * 찾고, 없으면 줄바꿈(\n) 기준으로 나눈다. 문단이 MAX_THREAD_PARTS개를 넘으면 마지막
 * 조각에 나머지를 모두 합쳐 개수를 맞춘다. 그마저 나눌 게 없으면(한 줄짜리 게시물)
 * 훅=전체, 답글 없음.
 */
const capParts = (parts, maxParts) => {
  if (parts.length <= maxParts) return parts;
  const head = parts.slice(0, maxParts - 1);
  const tail = parts.slice(maxParts - 1).join('\n\n');
  return [...head, tail];
};

const splitIntoThreadParts = (text, maxParts = MAX_THREAD_PARTS) => {
  const byParagraph = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (byParagraph.length > 1) return capParts(byParagraph, maxParts);

  const byLine = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (byLine.length > 1) return capParts(byLine, maxParts);

  return [text.trim()];
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
 * 첫 문단(훅)만 원 게시물로 올리고, 나머지는 순서대로 답글 체인(최대 4개, 총 5조각)으로
 * 따로 발행합니다 — 답글 하나씩 눌러보게 만들어 체류시간과 상호작용 기회를 늘리는
 * 구조입니다(2026-08-29 최초 요청, 2026-08-31 훅+답글1개 -> 훅+답글 최대4개로 확장).
 */
const publishToThreads = async ({ text, imageUrl, imageUrls, videoUrl }) => {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : []);
  // 영상 캡션은 나누지 않는다(영상 자체가 이미 체류시간을 만들어주고, 캡션에 굳이
  // 답글 구조를 강제할 필요가 없다) — 이미지/캐로셀/텍스트 전용일 때만 분리한다.
  const parts = videoUrl ? [text] : splitIntoThreadParts(text);
  const [hook, ...replyParts] = parts;

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
      // 이미지/영상 컨테이너처럼 여기도 생성 직후 바로 publish하면 "리소스를 찾을 수
      // 없음"(code=24, subcode=4279009)이 날 수 있다 — 이미지가 하나도 없는 실용 팁이
      // 아닌 주제(이미지 소스가 실패한 경우)가 텍스트 전용으로 떨어질 때 실측으로 확인됨
      // (2026-09-01, Gyeongbokgung Palace 테스트 발행). 이미지/영상과 동일하게 대기한다.
      await waitForThreadsContainer(creationId, accessToken);
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
    // 답글 가능한 상태로 완전히 반영되기 전이라 그런 것으로 보여, 대기 후 재시도한다.
    // 답글 체인이 4개로 늘면서(2026-08-31) 체인 중 아무 하나가 이 레이스에 걸릴
    // 확률도 그만큼 늘어 실측으로 4/5번째 답글에서 재현됨(2026-09-01, Bukchon
    // Hanok Village 테스트 발행) — 재시도를 1회에서 2회(총 3번 시도)로 늘렸다.
    // 답글은 이전 답글에 순서대로 이어 달아 체인을 만든다 — 중간에 하나가 끝내
    // 실패하면 그 다음부터 이어 달 대상이 없어지므로 체인을 중단한다.
    let previousId = publishRes.data.id;
    for (let i = 0; i < replyParts.length; i += 1) {
      let lastErr;
      let replyId;
      for (const delayMs of [3000, 5000, 8000]) {
        await wait(delayMs);
        try {
          replyId = await publishTextReply({ userId, accessToken, text: replyParts[i], replyToId: previousId });
          log.ok(`Threads 답글(${i + 2}/${parts.length}) 발행 완료 (Media ID: ${replyId})`);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) {
        const apiError = lastErr.response?.data?.error;
        const message = apiError ? `${apiError.message} (code=${apiError.code}, subcode=${apiError.error_subcode})` : lastErr.message;
        log.warn(`Threads 답글(${i + 2}/${parts.length}) 발행 실패 — 이후 답글 체인 중단(원 게시물 및 이전 답글들은 정상): ${message}`);
        break;
      }
      previousId = replyId;
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
