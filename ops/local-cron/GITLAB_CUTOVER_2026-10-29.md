# land-in-korea-blog: GitHub -> GitLab origin 전환 기록 (2026-10-29)

## 전환 전 상태 (문제 생기면 이 값으로 되돌리기)

- 전환 전 `origin` 리모트: `https://github.com/solusupport-bot/land-in-korea-blog.git`
- 전환 직전 공통 커밋(main): `c969ceab6b811351ee1c02883b576fce998193dd`
  (GitHub와 GitLab 양쪽 다 이 커밋까지 동일함을 확인함)
- GitHub Actions `.github/workflows/scheduled-publish.yml`: 이 날짜에 **수동으로 Disable**함
  (생성된 후 단 한 번도 자동 실행된 적 없었음 — 계정 레벨 Actions 제한으로 추정, 저장소
  자체의 Actions 권한은 "Allow all"로 열려 있었음). 되돌리려면:
  https://github.com/solusupport-bot/land-in-korea-blog/actions/workflows/scheduled-publish.yml
  에서 "Enable workflow" 클릭.
- GitHub 쪽 git push용 PAT: `workflow` 스코프가 없어서 `.github/workflows/*.yml` 변경은
  이 토큰으로 push 불가(2026-10-29 확인). 이것과 무관하게 코드/콘텐츠 push는 정상 동작.

## 전환 내용

1. `origin` 리모트를 `github`로 이름 변경(URL은 그대로 보존).
2. 새 `origin`을 GitLab(`https://gitlab.com/land-in-korea/land-in-korea-blog.git`)으로 추가.
3. 이제부터 `deploy-blog-cloudflare.ps1`, `publish-queue-local.ps1`이 쓰는
   `git pull/push origin main`은 전부 GitLab 기준으로 동작함(스크립트 코드 수정 없음,
   코드가 리모트 "이름"(origin)만 참조하기 때문).
4. `github_host.py`(미디어 호스팅, media-assets 브랜치)는 origin과 무관하게 계속
   `api.github.com`을 직접 호출함 — 전환 영향 없음, 그대로 둠.

## 롤백 방법 (GitHub 기준으로 즉시 복구)

```bash
cd "C:\Users\추성준\OneDrive\문서\GitHub\land-in-korea-blog"
git remote remove origin
git remote rename github origin
```
그 다음 GitHub Actions의 scheduled-publish.yml을 다시 Enable하고,
`DesktopTutorial-PublishQueue` 작업 스케줄러 작업을 비활성화(`Disable-ScheduledTask`)하면
전환 전 상태로 돌아감.

## 새로 생긴 것

- 작업 스케줄러 작업 `DesktopTutorial-PublishQueue`: 하루 4회(08:37/14:43/18:43/02:37,
  각 최대 50분 지터) `publish-queue-local.ps1` 실행 — GitHub Actions
  scheduled-publish.yml이 하던 일(초안 release -> validate.py -> commit+push)의 로컬 대체.
- `publish-queue-local.ps1`: 위 스크립트 본체. `deploy-blog-cloudflare.ps1`과 같은
  `Global\DesktopTutorialQueue` 뮤텍스를 공유해 동시 쓰기를 막음.
- GitLab 자격증명: Windows 자격 증명 관리자(Git Credential Manager, Generic provider)에
  저장. `.git/config`에 평문 토큰 없음. 전역 설정 `credential.https://gitlab.com.provider
  = generic` 적용(GitLab 전용 provider가 저장은 되는데 조회가 안 되는 버그 회피용).
