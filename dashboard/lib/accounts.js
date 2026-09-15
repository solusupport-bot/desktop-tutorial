// "공장화" 확장 지점 — 새 계정(블로그+SNS 묶음)을 추가하려면 이 배열에 항목 하나만
// 추가하면 된다. 각 계정은 이 저장소(desktop-tutorial)와 같은 구조(lib/scheduler,
// lib/publishing, data/queue.json 등)를 가진 별도의 저장소 클론이어야 한다 — 대시보드는
// 그 저장소의 lib/scheduler 모듈을 계정마다 동적으로 require해서 재사용한다(코드
// 재구현 없음). repoPath가 여기(desktop-tutorial) 자신을 가리키는 첫 계정이 지금
// 유일하게 존재하는 실제 계정이다.
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const ACCOUNTS = [
  {
    id: 'land-in-korea',
    label: 'Land in Korea',
    repoPath: ROOT,
    blogRepoPath: process.env.BLOG_REPO_PATH || path.join(ROOT, '..', 'land-in-korea-blog')
  }
  // 두 번째 계정 예시:
  // {
  //   id: 'my-second-account',
  //   label: '두 번째 계정',
  //   repoPath: 'C:/.../second-account-repo',
  //   blogRepoPath: 'C:/.../second-account-blog'
  // }
];

const listAccounts = () => ACCOUNTS;
const getAccount = (id) => ACCOUNTS.find((a) => a.id === id) || ACCOUNTS[0];

module.exports = { listAccounts, getAccount };
