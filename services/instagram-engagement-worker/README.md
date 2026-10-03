# Land in Korea Instagram engagement Worker

Cloudflare Workers와 D1에서 계속 실행되는 Instagram 댓글 반응 서비스입니다. PC 전원과 관계없이 Meta 공식 웹훅을 받습니다.

## 안전 규칙

- Meta의 `X-Hub-Signature-256` 서명이 맞는 요청만 처리합니다.
- 등록된 여행 주제와 일치하지 않는 댓글은 자동 답변하지 않습니다.
- 공개 답글에는 URL을 넣지 않고 Land in Korea 프로필을 안내합니다.
- 사용자가 `guide`, `link`, `가이드`, `링크` 등을 직접 요청한 경우에만 DM으로 관련 글을 보냅니다.
- 댓글별 한 번, 사용자별 6시간 쿨다운, 시간당 6건, 24시간당 20건으로 제한합니다.
- 일시적 오류만 한 번 재시도합니다. 연속 오류 2회면 6시간 동안 자동 중단합니다.
- AI API를 호출하지 않습니다.

## Cloudflare 배포

1. `wrangler.toml.example`을 `wrangler.toml`로 복사합니다.
2. `npx wrangler d1 create land-in-korea-engagement`로 D1을 만들고 출력된 ID를 `wrangler.toml`에 넣습니다.
3. `npx wrangler d1 migrations apply land-in-korea-engagement --remote`를 실행합니다.
4. 다음 값을 `npx wrangler secret put 이름`으로 등록합니다.
   - `META_APP_SECRET`: Meta 앱의 App Secret
   - `META_VERIFY_TOKEN`: 직접 만든 긴 임의 문자열
   - `IG_ACCESS_TOKEN`: `instagram_manage_comments`, `instagram_manage_messages` 권한이 있는 토큰
   - `IG_USER_ID`: Instagram 프로 계정 ID
   - `ADMIN_TOKEN`: 상태 화면을 보호할 긴 임의 문자열
5. `npx wrangler deploy`를 실행합니다.
6. Meta App Dashboard의 Instagram Webhooks에 `https://<worker주소>/webhook`을 등록하고 `comments`를 구독합니다.

공개 상태 확인은 `/health`, 보호된 운영 상태는 `Authorization: Bearer <ADMIN_TOKEN>`을 붙여 `/admin/status`에서 확인합니다.
