const log = require('../logger');
const { graphPost } = require('./meta_client');

/**
 * Facebook 페이지에 텍스트/이미지/영상 게시글을 발행합니다.
 * FB_PAGE_ACCESS_TOKEN/FB_PAGE_ID가 없으면 모의 발행으로 대체합니다.
 * videoUrl이 있으면 영상을, 없고 imageUrl이 있으면 사진을, 둘 다 없으면 텍스트만 올립니다.
 */
const publishToFacebook = async ({ text, imageUrl, videoUrl }) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;

  if (!accessToken || !pageId) {
    log.warn('FB_PAGE_ACCESS_TOKEN 또는 FB_PAGE_ID가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Facebook 모의 발행${videoUrl ? ' / 영상' : ''}]\n${text.slice(0, 150)}...`);
    return { id: 'mock_fb_post_id' };
  }

  try {
    let path;
    let params;
    if (videoUrl) {
      path = `/${pageId}/videos`;
      params = { file_url: videoUrl, description: text };
    } else if (imageUrl) {
      path = `/${pageId}/photos`;
      params = { url: imageUrl, caption: text };
    } else {
      path = `/${pageId}/feed`;
      params = { message: text };
    }

    const data = await graphPost(path, params, accessToken);
    log.ok(`Facebook 발행 완료 (Post ID: ${data.id || data.post_id})`);
    return data;
  } catch (err) {
    log.err(`Facebook 발행 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

module.exports = { publishToFacebook };
