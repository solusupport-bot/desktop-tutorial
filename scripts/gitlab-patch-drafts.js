// 2026-11-26 one-off: unlink any reference to the 6 held drafts from posts/drafts, then rerun the publish schedule.
const axios = require('axios');
const API = 'https://gitlab.com/api/v4/projects/land-in-korea%2Fland-in-korea-blog';
const H = { headers: { 'PRIVATE-TOKEN': process.env.TOKEN } };
const HELD = ['korea-changdeokgung-secret-garden-how-the-timed-huwon-tickets-actually-work',
  'korea-skiing-near-seoul-without-a-car-konjiam-elysian-gangchon-and-shuttle-buses',
  'korea-new-year-s-eve-in-korea-the-bosingak-bell-late-subways-and-first-sunrise-spots',
  'korea-shipping-souvenirs-home-from-a-korean-post-office-ems-small-packets-and-sea-mail',
  'korea-korean-winter-street-food-bungeoppang-hotteok-and-where-the-stalls-went',
  'korea-public-bathhouse-culture-in-korea-beyond-the-jjimjilbang-the-mogyoktang-rules'];
const list = async (dir) => { const out = []; for (let p = 1; p; ) { const r = await axios.get(`${API}/repository/tree`, { ...H, params: { path: dir, per_page: 100, page: p } }); r.data.filter((f) => f.type === 'blob' && f.name.endsWith('.md')).forEach((f) => out.push(f.path)); p = Number(r.headers['x-next-page']) || 0; } return out; };
(async () => {
  const files = [...await list('content/posts'), ...await list('content/drafts')];
  const actions = [];
  for (const path of files) {
    const { data: md } = await axios.get(`${API}/repository/files/${encodeURIComponent(path)}/raw?ref=main`, H);
    if (!HELD.some((s) => md.includes(s))) continue;
    const out = [];
    for (const l of md.split('\n')) {
      const hit = HELD.find((s) => l.includes(s));
      if (!hit) { out.push(l); continue; }
      if (/^\s*[-*]\s*\[[^\]]*\]\([^)]*\)\s*$/.test(l)) { console.log(path, 'removed bullet:', l); continue; }
      let n = l;
      for (const s of HELD) n = n.replace(new RegExp(`\\[([^\\]]+)\\]\\([^)]*${s}[^)]*\\)`, 'g'), '$1');
      console.log(path, 'unlinked:', n.slice(0, 160)); out.push(n);
    }
    actions.push({ action: 'update', file_path: path, content: out.join('\n') });
  }
  if (actions.length) await axios.post(`${API}/repository/commits`, { branch: 'main', commit_message: 'fix: unlink drafts held for correction from live posts', actions }, H);
  console.log('files patched:', actions.length);
  const r = await axios.post(`${API}/pipeline_schedules/4525847/play`, {}, H);
  console.log('schedule play:', r.status);
})().catch((e) => { console.error(e.response ? JSON.stringify(e.response.data) : e.message); process.exit(1); });
