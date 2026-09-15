// 공용 HTML 셸 — 빌드 스텝 없이 템플릿 문자열만 사용(React/EJS 등 불필요, 단일
// 사용자 로컬 도구이므로 인증/반응형 최적화도 하지 않는다).
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// 여기 한 줄만 추가하면 새 스테이지/사이트 페이지가 내비게이션에 나타난다 —
// "앞으로 여러 개의 블로그/SNS가 들어갈" 확장을 코드 구조 변경 없이 받기 위한 지점.
const NAV = [
  { href: '/', label: '개요' },
  { href: '/planning', label: '기획' },
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
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", sans-serif; background: #f6f7f9; color: #1a1d23; }
  .shell { display: flex; min-height: 100vh; }
  nav { width: 190px; flex-shrink: 0; background: #1a1d23; color: #cfd3da; padding: 20px 0; }
  nav .brand { color: #fff; font-weight: 700; padding: 0 20px 12px; font-size: 15px; }
  nav .account-switch { padding: 0 16px 16px; }
  nav select { width: 100%; padding: 6px; border-radius: 6px; border: none; font-size: 12px; }
  nav a { display: block; padding: 10px 20px; color: #cfd3da; text-decoration: none; font-size: 14px; }
  nav a:hover { background: #2a2e37; color: #fff; }
  nav a.active { background: #2f6fed; color: #fff; font-weight: 600; }
  main { flex: 1; padding: 28px 32px; max-width: 1100px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 18px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
  .stat .n { font-size: 24px; font-weight: 700; }
  .stat .l { font-size: 12px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eef0f2; vertical-align: top; }
  th { color: #6b7280; font-weight: 600; font-size: 12px; text-transform: uppercase; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge.pending { background: #fef3c7; color: #92400e; }
  .badge.passed, .badge.published, .badge.true { background: #dcfce7; color: #166534; }
  .badge.flagged, .badge.failed, .badge.rejected { background: #fee2e2; color: #991b1b; }
  .badge.claimed, .badge.partial { background: #dbeafe; color: #1e40af; }
  .badge.false { background: #f3f4f6; color: #4b5563; }
  form.inline { display: inline; }
  button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
  button.primary { background: #2f6fed; border-color: #2f6fed; color: #fff; }
  button.danger { background: #dc2626; border-color: #dc2626; color: #fff; }
  pre { background: #0f1115; color: #d4d8de; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; max-height: 400px; }
  .flash { padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
  .flash.ok { background: #dcfce7; color: #166534; }
  .flash.err { background: #fee2e2; color: #991b1b; }
  .empty { color: #9ca3af; font-style: italic; padding: 12px 0; }
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
