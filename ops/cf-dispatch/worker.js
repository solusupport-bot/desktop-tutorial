// GitHub의 schedule 트리거는 '7 * * * *' 설정에도 실제로 약 6시간에 한 번만 돈다(2026-11 실측).
// 한 실행당 채널별 1건이라 그 주기로는 하루 목표를 못 채우므로, PC와 무관한 Cloudflare Cron이 호출한다.
const WORKFLOW = 'https://api.github.com/repos/solusupport-bot/desktop-tutorial/actions/workflows/scheduler.yml';

export default {
  async scheduled(_event, env) {
    const headers = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'land-in-korea-sns-dispatch'
    };

    // 2026-09 Actions 계정 정지의 핵심 패턴이 "계속 실패하는데 계속 재시도"였다.
    // 연속 실패 중엔 호출을 멈추고, GitHub 자체 스케줄 실행이 성공하면 자동으로 재개된다.
    const res = await fetch(`${WORKFLOW}/runs?status=completed&per_page=3`, { headers });
    if (!res.ok) throw new Error(`runs ${res.status}`);
    const { workflow_runs: runs } = await res.json();
    if (runs.length === 3 && runs.every((run) => run.conclusion === 'failure')) {
      console.log('최근 3회 연속 실패 — 이번 호출을 건너뜁니다.');
      return;
    }

    const dispatch = await fetch(`${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: 'main' })
    });
    if (!dispatch.ok) throw new Error(`dispatch ${dispatch.status}`);
  }
};
