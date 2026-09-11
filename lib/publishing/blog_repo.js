const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../logger');

const BLOG_REPO = 'solusupport-bot/land-in-korea-blog';
const BLOG_BASE_URL = 'https://landinkorea.com';

const run = (cmd, args, cwd = process.cwd()) => {
  try {
    return execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
  } catch (err) {
    throw new Error(`${cmd} ${args.join(' ')}: ${err.message}`);
  }
};

/**
 * GitHub CLI를 사용해서 GitHub API로 직접 파일을 생성합니다.
 * BLOG_REPO_PAT이 없을 때 사용하는 대체 방법입니다.
 */
const pushViaGitHubAPI = ({ slug, markdown }) => {
  try {
    // base64 인코딩
    const contentBase64 = Buffer.from(markdown).toString('base64');

    // GitHub API를 통해 파일 생성
    const apiCall = `repos/${BLOG_REPO}/contents/content/posts/${slug}.md`;

    const payload = {
      message: `Add post: ${slug}`,
      content: contentBase64,
      branch: 'main'
    };

    run('gh', [
      'api',
      '-X', 'PUT',
      apiCall,
      '--input', '-'
    ], process.cwd());

    // payload를 stdin으로 전달하기 위해 다시 시도
    const ghProcess = require('child_process').spawnSync('gh', [
      'api',
      '-X', 'PUT',
      apiCall,
      '-f', `message=${payload.message}`,
      '-f', `content=${contentBase64}`,
      '-f', `branch=${payload.branch}`
    ], { encoding: 'utf-8' });

    if (ghProcess.error || ghProcess.status !== 0) {
      throw new Error(ghProcess.stderr || 'GitHub API 호출 실패');
    }

    const url = `${BLOG_BASE_URL}/posts/${slug}.html`;
    log.ok(`블로그 글 푸시 완료 (GitHub API): ${url}`);
    return url;
  } catch (err) {
    log.warn(`GitHub API 푸시 실패: ${err.message}`);
    return null;
  }
};

/**
 * 생성된 블로그 글(front matter 포함 마크다운 전체 텍스트)을 land-in-korea-blog 저장소의
 * content/posts/에 직접 커밋+푸시합니다. land-in-korea-blog의 blog-build.yml이 main 브랜치
 * 푸시를 감지해 자동으로 fetch_images.py + build.py + 배포까지 이어서 처리합니다.
 *
 * 우선순위:
 * 1. BLOG_REPO_PAT 사용 (GitHub Actions secrets에서 설정)
 * 2. GitHub CLI 사용 (gh auth login된 로컬 환경 또는 GitHub Actions GITHUB_TOKEN)
 */
const pushBlogPost = ({ slug, markdown }) => {
  const pat = process.env.BLOG_REPO_PAT;

  if (pat) {
    // 방법 1: BLOG_REPO_PAT 사용
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lik-blog-push-'));
    try {
      const remote = `https://x-access-token:${pat}@github.com/${BLOG_REPO}.git`;
      run('git', ['clone', '--depth', '1', remote, tmpDir]);

      const postPath = path.join(tmpDir, 'content', 'posts', `${slug}.md`);
      if (fs.existsSync(postPath)) {
        log.warn(`이미 같은 슬러그의 글이 있습니다: ${slug}.md — 덮어쓰지 않고 건너뜁니다.`);
        const url = `${BLOG_BASE_URL}/posts/${slug}.html`;
        log.ok(`기존 글로 등록: ${url}`);
        return url;
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
  } else {
    // 방법 2: GitHub CLI 사용 (GITHUB_TOKEN이 필요하거나 로컬 인증 필요)
    log.warn('BLOG_REPO_PAT이 없어 GitHub CLI로 대체합니다...');
    return pushViaGitHubAPI({ slug, markdown });
  }
};

module.exports = { pushBlogPost, BLOG_BASE_URL };
