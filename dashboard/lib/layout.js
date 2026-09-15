// 공용 HTML 셸 — 빌드 스텝 없이 템플릿 문자열만 사용(React/EJS 등 불필요, 단일
// 사용자 로컬 도구이므로 인증/반응형 최적화도 하지 않는다). 폰트/색상/자간은
// 2026-09-16 사용자 요청으로 다시 다듬었다 — IBM Plex Sans KR(본문)+IBM Plex
// Mono(라벨/데이터/코드) 조합, 흔한 SaaS 파란색 대신 차분한 petrol(청록) 액센트.
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// 여기 한 줄만 추가하면 새 스테이지/사이트 페이지가 내비게이션에 나타난다 —
// "앞으로 여러 개의 블로그/SNS가 들어갈" 확장을 코드 구조 변경 없이 받기 위한 지점.
const NAV = [
  { href: '/', label: '개요' },
  { href: '/planning', label: '기획' },
  { href: '/benchmark', label: '벤치마킹' },
  { href: '/factcheck', label: '정보확인' },
  { href: '/review', label: '검수' },
  { href: '/publish', label: '발행' },
  { href: '/verify', label: '검증' },
  { href: '/comments', label: '댓글' },
  { href: '/performance', label: '성과확인' }
];

const withAccount = (href, accountId) => `${href}?account=${encodeURIComponent(accountId)}`;

const page = ({ title, activePath, body, flash, account, accounts }) => `
<title>${escapeHtml(title)} · 자동화 대시보드</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
  :root {
    --bg: #f4f3ee;
    --surface: #ffffff;
    --surface-2: #faf9f5;
    --ink: #1b201d;
    --ink-soft: #5d655e;
    --ink-faint: #929991;
    --line: #e1ddd0;
    --accent: #1f6f63;
    --accent-ink: #ffffff;
    --accent-soft: #e2efec;
    --nav-bg: #1a1e1c;
    --nav-ink: #c7cdc5;
    --nav-hover: #262b28;
    --success-bg: #dcf5e8; --success-ink: #146c43;
    --warn-bg: #fbedd3; --warn-ink: #8a5a12;
    --danger-bg: #fbe1de; --danger-ink: #9c2f22;
    --info-bg: #e0eaf7; --info-ink: #1d4f8f;
    --shadow: 0 1px 2px rgba(20, 24, 21, 0.04), 0 1px 8px rgba(20, 24, 21, 0.03);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14171a; --surface: #1c2023; --surface-2: #202427;
      --ink: #e7e6de; --ink-soft: #a7ada4; --ink-faint: #767c76;
      --line: #2b302d; --accent: #4fb3a0; --accent-ink: #0c1211; --accent-soft: #1c2f2b;
      --nav-bg: #0f1211; --nav-ink: #b7bdb5; --nav-hover: #1a1e1c;
      --success-bg: #143324; --success-ink: #6cd6a4;
      --warn-bg: #3a2c14; --warn-ink: #e8b565;
      --danger-bg: #3a1e1a; --danger-ink: #ea9c8c;
      --info-bg: #182c40; --info-ink: #8fbaea;
      --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 1px 8px rgba(0,0,0,0.2);
    }
  }
  * { box-sizing: border-box; }
  html { color-scheme: light dark; }
  body {
    margin: 0;
    font-family: "IBM Plex Sans KR", "Noto Sans KR", -apple-system, sans-serif;
    background: var(--bg);
    color: var(--ink);
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .shell { display: flex; min-height: 100vh; }

  nav {
    width: 196px; flex-shrink: 0;
    background: var(--nav-bg); color: var(--nav-ink);
    padding: 22px 0;
    display: flex; flex-direction: column;
  }
  nav .brand {
    color: #fff; font-weight: 700; font-size: 15px;
    padding: 0 20px 16px;
    letter-spacing: 0.01em;
  }
  nav .account-switch { padding: 0 16px 18px; }
  nav select {
    width: 100%; padding: 7px 8px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06); color: #fff;
    font-family: "IBM Plex Mono", monospace; font-size: 11.5px;
  }
  nav a {
    display: block; padding: 9px 20px; margin: 1px 8px; border-radius: 7px;
    color: var(--nav-ink); text-decoration: none; font-size: 13.5px; font-weight: 500;
    transition: background 0.12s ease, color 0.12s ease;
  }
  nav a:hover { background: var(--nav-hover); color: #fff; }
  nav a.active { background: var(--accent); color: var(--accent-ink); font-weight: 600; }

  main { flex: 1; padding: 32px 40px 60px; max-width: 1120px; }

  h1 {
    font-size: 21px; font-weight: 700; margin: 0 0 5px;
    letter-spacing: -0.01em;
  }
  .sub { color: var(--ink-soft); font-size: 13px; margin: 0 0 22px; max-width: 72ch; }

  .card {
    background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
    padding: 18px 20px; margin-bottom: 18px; box-shadow: var(--shadow);
  }
  .card > b { font-size: 14px; font-weight: 600; letter-spacing: 0.01em; }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 22px; }
  .stat {
    background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
    padding: 15px 16px; box-shadow: var(--shadow);
  }
  .stat .n {
    font-family: "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums;
    font-size: 25px; font-weight: 600; color: var(--accent); line-height: 1.1;
  }
  .stat .l { font-size: 11.5px; color: var(--ink-soft); margin-top: 4px; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th {
    color: var(--ink-faint); font-weight: 600; font-size: 11px;
    letter-spacing: 0.04em; text-transform: uppercase;
    background: var(--surface-2);
  }
  tr:last-child td { border-bottom: none; }

  .badge {
    display: inline-block; padding: 3px 9px; border-radius: 999px;
    font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em;
    font-family: "IBM Plex Mono", monospace;
  }
  .badge.pending { background: var(--warn-bg); color: var(--warn-ink); }
  .badge.passed, .badge.published, .badge.true { background: var(--success-bg); color: var(--success-ink); }
  .badge.flagged, .badge.failed, .badge.rejected { background: var(--danger-bg); color: var(--danger-ink); }
  .badge.claimed, .badge.partial { background: var(--info-bg); color: var(--info-ink); }
  .badge.false { background: var(--surface-2); color: var(--ink-faint); }

  form.inline { display: inline; }
  input, select, textarea {
    font-family: inherit; font-size: 13.5px;
    border: 1px solid var(--line); border-radius: 7px;
    background: var(--surface); color: var(--ink);
  }
  input, select { padding: 7px 10px; }
  textarea { padding: 10px; }
  button {
    font: inherit; font-weight: 500; font-size: 13.5px;
    padding: 7px 14px; border-radius: 7px; border: 1px solid var(--line);
    background: var(--surface); color: var(--ink); cursor: pointer;
    transition: filter 0.12s ease;
  }
  button:hover { filter: brightness(0.97); }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
  button.danger { background: var(--danger-ink); border-color: var(--danger-ink); color: #fff; font-weight: 600; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  pre {
    background: var(--nav-bg); color: #d8ddd5;
    padding: 13px 14px; border-radius: 8px; overflow-x: auto;
    font-family: "IBM Plex Mono", monospace; font-size: 12px; line-height: 1.55;
    max-height: 400px;
  }

  .flash {
    padding: 10px 14px; border-radius: 8px; margin-bottom: 18px; font-size: 13px; font-weight: 500;
  }
  .flash.ok { background: var(--success-bg); color: var(--success-ink); }
  .flash.err { background: var(--danger-bg); color: var(--danger-ink); }
  .empty { color: var(--ink-faint); font-style: italic; padding: 10px 0; font-size: 13px; }
</style>
<div class="shell">
  <nav>
    <div class="brand">자동화 대시보드</div>
    <div class="account-switch">
      <select onchange="location.href='/?account='+this.value">
        ${accounts.map((a) => `<option value="${a.id}" ${a.id === account.id ? 'selected' : ''}>${escapeHtml(a.label)}</option>`).join('')}
      </select>
    </div>
    ${NAV.map((n) => `<a href="${withAccount(n.href, account.id)}" class="${n.href === activePath ? 'active' : ''}">${n.label}</a>`).join('')}
  </nav>
  <main>
    ${flash ? `<div class="flash ${flash.ok ? 'ok' : 'err'}">${escapeHtml(flash.message)}</div>` : ''}
    ${body}
  </main>
</div>
`;

module.exports = { page, escapeHtml, withAccount };
