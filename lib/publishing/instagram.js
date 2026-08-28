const log = require('../logger');
const { instagramGraphPost, instagramGraphGet } = require('./meta_client');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForContainer = async (creationId, accessToken, maxAttempts = 12) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await instagramGraphGet(`/${creationId}`, { fields: 'status_code' }, accessToken);
    if (status.status_code === 'FINISHED') return;
    if (['ERROR', 'EXPIRED'].includes(status.status_code)) {
      throw new Error(`미디어 컨테이너 처리 실패 (${status.status_code})`);
    }
    if (attempt < maxAttempts) await wait(5000);
  }
  throw new Error('미디어 컨테이너 처리 시간 초과');
};

const createCarouselItem = async (igUserId, accessToken, imageUrl) => {
  const container = await instagramGraphPost(`/${igUserId}/media`, {
    image_url: imageUrl,
    is_carousel_item: true
  }, accessToken);
  if (!container.id) throw new Error('캐로셀 아이템 컨테이너 생성 실패');
  await waitForContainer(container.id, accessToken, 12);
  return container.id;
};

/**
 * Instagram 비즈니스 계정에 이미지/캐로셀/영상(Reels) 게시글을 발행합니다.
 * Instagram Graph API는 텍스트 단독 피드 게시글을 지원하지 않으므로 imageUrl, imageUrls, videoUrl 중
 * 하나는 필수입니다. 우선순위: videoUrl(Reels) > imageUrls(2장 이상 = 캐로셀) > imageUrl(단일 이미지).
 * videoUrl이 있으면 영상 처리 시간이 더 걸리므로 이미지보다 더 오래(최대 24회 x 5초 = 2분) 상태를 기다립니다.
 * IG_ACCESS_TOKEN/IG_USER_ID가 없으면 모의 발행으로 대체합니다.
 */
const publishToInstagram = async ({ text, imageUrl, imageUrls, videoUrl }) => {
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : []);

  if (!images.length && !videoUrl) {
    log.err('Instagram은 이미지나 영상 없이 피드 게시글을 발행할 수 없습니다 (imageUrl/imageUrls 또는 videoUrl 필수).');
    return null;
  }

  const accessToken = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;

  if (!accessToken || !igUserId) {
    log.warn('IG_ACCESS_TOKEN 또는 IG_USER_ID가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Instagram 모의 발행${videoUrl ? ' / Reels' : images.length > 1 ? ` / 캐로셀 ${images.length}장` : ''}]\n${text.slice(0, 150)}...\n미디어: ${videoUrl || images.join(', ')}`);
    return { id: 'mock_ig_media_id' };
  }

  try {
    let creationId;

    if (videoUrl) {
      const container = await instagramGraphPost(`/${igUserId}/media`, {
        media_type: 'REELS', video_url: videoUrl, caption: text
      }, accessToken);
      creationId = container.id;
      if (!creationId) throw new Error('미디어 컨테이너 생성 실패');
      await waitForContainer(creationId, accessToken, 24);
    } else if (images.length > 1) {
      const childIds = [];
      for (const url of images) {
        childIds.push(await createCarouselItem(igUserId, accessToken, url));
      }
      const container = await instagramGraphPost(`/${igUserId}/media`, {
        media_type: 'CAROUSEL', children: childIds.join(','), caption: text
      }, accessToken);
      creationId = container.id;
      if (!creationId) throw new Error('캐로셀 컨테이너 생성 실패');
      await waitForContainer(creationId, accessToken, 12);
    } else {
      const container = await instagramGraphPost(`/${igUserId}/media`, {
        image_url: images[0], caption: text
      }, accessToken);
      creationId = container.id;
      if (!creationId) throw new Error('미디어 컨테이너 생성 실패');
      await waitForContainer(creationId, accessToken, 12);
    }

    const published = await instagramGraphPost(`/${igUserId}/media_publish`, {
      creation_id: creationId
    }, accessToken);

    log.ok(`Instagram 발행 완료 (Media ID: ${published.id}${videoUrl ? ', Reels' : images.length > 1 ? `, 캐로셀 ${images.length}장` : ''})`);
    return published;
  } catch (err) {
    log.err(`Instagram 발행 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

module.exports = { publishToInstagram };
