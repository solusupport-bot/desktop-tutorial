# Land in Korea — Facebook·Threads 재실행 패키지

이 폴더는 **Facebook 페이지와 Threads 자동화만** 다시 설정하는 실행 패키지다. Instagram 전문 계정 연결은 Meta의 계정 보호 제한이 해제될 때까지 의도적으로 제외한다.

## 한 번에 적용하기

먼저 GitHub CLI에 로그인한다. 아래 명령은 GitHub 저장소에 비밀값을 등록하지만 게시물·계정 연결·워크플로우 수동 실행은 하지 않는다.

| 운영체제 | 실행 명령 |
|---|---|
| Windows PowerShell | `powershell -ExecutionPolicy Bypass -File .\ops\facebook_threads\setup-facebook-threads.ps1` |
| macOS / Linux | `chmod +x ops/facebook_threads/setup-facebook-threads.sh && ./ops/facebook_threads/setup-facebook-threads.sh` |

스크립트는 아래 네 값만 한 번씩 입력받는다. 토큰 입력은 화면에 표시되지 않으며, GitHub Secrets로만 전송된다.

| GitHub Secret | 값 |
|---|---|
| `FB_PAGE_ACCESS_TOKEN` | Land in Korea Facebook 페이지 액세스 토큰 |
| `FB_PAGE_ID` | `1288453561012463` |
| `THREADS_ACCESS_TOKEN` | landinkorea Threads 장기 액세스 토큰 |
| `THREADS_USER_ID` | landinkorea Threads 사용자 ID |

기본값은 로컬 토큰 파일을 만들지 않는다. 로컬 테스트가 꼭 필요할 때만 macOS/Linux에서는 `SAVE_LOCAL_ENV=1`, Windows에서는 `-SaveLocalEnv`를 추가한다. 생성되는 `local.env`는 Git에서 제외되어 있으며, 절대 공개 저장소에 올리지 않는다.

## 실행 후 확인

GitHub 저장소의 `Settings → Secrets and variables → Actions`에서 네 Secrets의 이름만 확인한다. 값은 표시되지 않는 것이 정상이다. 기존 스케줄 워크플로우는 이미 Instagram 관련 비밀값이 비어 있어도 Facebook·Threads만 사용할 수 있도록 운영한다.

## Instagram 재개 절차

Meta가 "계정이 제한되었습니다"라고 표시되는 동안에는 연결 버튼을 반복해서 누르지 않는다. 제한이 해제된 뒤 한 번만 아래 순서로 이어간다.

1. `Land in Korea` Facebook 페이지의 **Settings → Linked accounts → Instagram**을 연다.
2. `landinkorea` 전문 Instagram 계정을 연결한다.
3. **Instagram 메시지 접근 권한은 끈 상태**로 진행한다.
4. 연결이 완료되면 Graph API Explorer에서 페이지의 `instagram_business_account`를 조회해 `IG_USER_ID`를 확인한다.
5. `instagram_basic`, `instagram_content_publish`만 요청해 `IG_ACCESS_TOKEN`을 발급한다.
6. Instagram 게시 자동화를 별도로 검증한 뒤에만 `IG_USER_ID`, `IG_ACCESS_TOKEN`을 GitHub Secrets에 추가한다.

> 연결 해제, 계정 비활성화, 게시 상태 변경은 이 패키지의 범위가 아니다.

## 보안 원칙

토큰·비밀번호·앱 시크릿은 Markdown 문서, Git 커밋, Drive 업로드 파일에 적지 않는다. 토큰을 갱신해야 할 경우에는 이 스크립트를 다시 실행해 GitHub Secrets 값만 교체한다.
