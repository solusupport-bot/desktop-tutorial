const log = require('../logger');
const { graphPost } = require('./meta_client');

/**
 * Instagram 비즈니스 계정에 이미지 게시글을 발행합니다.
 * Instagram Graph API는 텍스트 단독 피드 게시글을 지원하지 않으므로 imageUrl이 필수입니다.
 * IG_ACCESS_TOKEN/IG_USER_ID가 없으면 모의 발행으로 대체합니다.
 */
const publishToInstagram = async ({ text, imageUrl }) => {
  if (!imageUrl) {
    log.err('Instagram은 이미지 없이 피드 게시글을 발행할 수 없습니다 (imageUrl 필수).');
    return null;
  }

  const accessToken = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;

  if (!accessToken || !igUserId) {
    log.warn('IG_ACCESS_TOKEN 또는 IG_USER_ID가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Instagram 모의 발행]\n${text.slice(0, 150)}...\n이미지: ${imageUrl}`);
    return { id: 'mock_ig_media_id' };
  }

  try {
    const container = await graphPost(`/${igUserId}/media`, {
      image_url: imageUrl,
      caption: text
    }, accessToken);

    const creationId = container.id;
    if (!creationId) throw new Error('미디어 컨테이너 생성 실패');

    const published = await graphPost(`/${igUserId}/media_publish`, {
      creation_id: creationId
    }, accessToken);

    log.ok(`Instagram 발행 완료 (Media ID: ${published.id})`);
    return published;
  } catch (err) {
    log.err(`Instagram 발행 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

module.exports = { publishToInstagram };
