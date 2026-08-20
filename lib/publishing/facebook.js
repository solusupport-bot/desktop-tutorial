const log = require('../logger');
const { graphPost } = require('./meta_client');

/**
 * Facebook 페이지에 텍스트 또는 이미지 게시글을 발행합니다.
 * FB_PAGE_ACCESS_TOKEN/FB_PAGE_ID가 없으면 모의 발행으로 대체합니다.
 */
const publishToFacebook = async ({ text, imageUrl }) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;

  if (!accessToken || !pageId) {
    log.warn('FB_PAGE_ACCESS_TOKEN 또는 FB_PAGE_ID가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Facebook 모의 발행]\n${text.slice(0, 150)}...`);
    return { id: 'mock_fb_post_id' };
  }

  try {
    const path = imageUrl ? `/${pageId}/photos` : `/${pageId}/feed`;
    const params = imageUrl ? { url: imageUrl, caption: text } : { message: text };

    const data = await graphPost(path, params, accessToken);
    log.ok(`Facebook 발행 완료 (Post ID: ${data.id || data.post_id})`);
    return data;
  } catch (err) {
    log.err(`Facebook 발행 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

module.exports = { publishToFacebook };
