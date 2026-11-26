// 2026-11-26 one-off: Christmas post links to the held New Year's Eve draft -> unlink, then rerun publish schedule.
const axios = require('axios');
const API = 'https://gitlab.com/api/v4/projects/land-in-korea%2Fland-in-korea-blog';
const H = { headers: { 'PRIVATE-TOKEN': process.env.TOKEN } };
const HELD = 'korea-new-year-s-eve-in-korea-the-bosingak-bell-late-subways-and-first-sunrise-spots';
(async () => {
  const { data: tree } = await axios.get(`${API}/repository/tree?path=content/posts&per_page=100&pagination=keyset`, H).catch(() => ({ data: [] }));
  const path = 'content/posts/korea-christmas-in-korea-a-couples-holiday-light-displays-and-what-stays-open-on-december-25.md';
  const { data: md } = await axios.get(`${API}/repository/files/${encodeURIComponent(path)}/raw?ref=main`, H);
  const lines = md.split('\n');
  const out = [];
  for (const l of lines) {
    if (!l.includes(HELD)) { out.push(l); continue; }
    console.log('BEFORE:', l);
    if (/^\s*[-*]\s*\[[^\]]*\]\([^)]*\)\s*$/.test(l)) { console.log('-> removed bullet'); continue; }
    const n = l.replace(/\[([^\]]+)\]\([^)]*${HELD}[^)]*\)/g, '$1');
    console.log('AFTER :', n); out.push(n);
  }
  await axios.post(`${API}/repository/commits`, { branch: 'main', commit_message: 'fix: unlink held New Year draft from Christmas post', actions: [{ action: 'update', file_path: path, content: out.join('\n') }] }, H);
  const r = await axios.post(`${API}/pipeline_schedules/4525847/play`, {}, H);
  console.log('schedule play:', r.status);
})().catch((e) => { console.error(e.response ? JSON.stringify(e.response.data) : e.message); process.exit(1); });
