const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../logger');

const BLOG_REPO = 'solusupport-bot/land-in-korea-blog';
const BLOG_BASE_URL = 'https://landinkorea.com';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'pipe' });

/**
 * 생성된 블로그 글(front matter 포함 마크다운 전체 텍스트)을 land-in-korea-blog 저장소의
 * content/posts/에 직접 커밋+푸시합니다. land-in-korea-blog의 blog-build.yml이 main 브랜치
 * 푸시를 감지해 자동으로 fetch_images.py + build.py + 배포까지 이어서 처리합니다.
 *
 * BLOG_REPO_PAT(land-in-korea-blog에 대한 contents:write 권한의 GitHub PAT)가 없으면
 * null을 반환합니다 — desktop-tutorial의 GITHUB_TOKEN은 이 저장소 자신에게만 유효해서
 * 다른 저장소로는 푸시할 수 없기 때문에 별도 PAT이 꼭 필요합니다.
 */
const pushBlogPost = ({ slug, markdown }) => {
  const pat = process.env.BLOG_REPO_PAT;
  if (!pat) {
    log.warn('BLOG_REPO_PAT이 없어 블로그 저장소에 푸시할 수 없습니다 (SNS는 블로그 홈으로 링크됩니다).');
    return null;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lik-blog-push-'));
  try {
    const remote = `https://x-access-token:${pat}@github.com/${BLOG_REPO}.git`;
    run('git', ['clone', '--depth', '1', remote, tmpDir]);

    const postPath = path.join(tmpDir, 'content', 'posts', `${slug}.md`);
    if (fs.existsSync(postPath)) {
      log.warn(`이미 같은 슬러그의 글이 있습니다: ${slug}.md — 덮어쓰지 않고 건너뜁니다.`);
      return null;
    }
    fs.writeFileSync(postPath, markdown, 'utf-8');

    run('git', ['config', 'user.name', 'sns-automation-bot'], tmpDir);
    run('git', ['config', 'user.email', 'actions@github.com'], tmpDir);
    run('git', ['add', `content/posts/${slug}.md`], tmpDir);
    run('git', ['commit', '-m', `Add post: ${slug}`], tmpDir);
    run('git', ['push', 'origin', 'main'], tmpDir);

    const url = `${BLOG_BASE_URL}/posts/${slug}.html`;
    log.ok(`블로그 글 푸시 완료: ${url}`);
    return url;
  } catch (err) {
    log.err(`블로그 저장소 푸시 실패: ${err.message}`);
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

module.exports = { pushBlogPost, BLOG_BASE_URL };
