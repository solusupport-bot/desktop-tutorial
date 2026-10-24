# 2026-09-27: landinkorea.com 배포처가 Netlify -> Cloudflare로 바뀜(크레딧 소진 +
# GitHub Actions 계정 정지 둘 다 GitHub/Netlify 경로를 막아서). 이 스크립트가
# "새 블로그 글 작성 -> 이미지 로컬화 -> Cloudflare 배포" 전 과정을 대신한다.
# 자세한 배경은 memory reference_cloudflare_deploy 참고.
# 'Stop'이면 native 명령이 stderr에 아무거나(예: git의 CRLF 경고, exit 0) 쓰기만 해도
# NativeCommandError로 죽는다(2026-09-30 실측) — 'Continue'로 두고 각 호출 뒤
# $LASTEXITCODE를 직접 확인해 진짜 실패만 throw한다.
$ErrorActionPreference = 'Continue'
$desktop = "C:\Users\추성준\OneDrive\문서\GitHub\desktop-tutorial"
$blog = "C:\Users\추성준\OneDrive\문서\GitHub\land-in-korea-blog"
$site = "C:\Users\추성준\OneDrive\바탕 화면\landinkorea_site"
$accountId = "1fc45e0d4565a48335045c78ec9d6f27"
$logFile = Join-Path $PSScriptRoot "deploy-blog-cloudflare.log"

function Log($msg) { Add-Content -Path $logFile -Value "$(Get-Date -Format o) $msg" -Encoding utf8 }
function Run($cmd, $cmdArgs, $cwd) {
    # 매개변수 이름을 $args로 쓰면 PowerShell의 자동변수 $args와 충돌해 @args가
    # 빈 배열로 스플랫된다(2026-09-30에 실제로 git이 인자 없이 호출돼 usage만 출력됨).
    $out = & $cmd @cmdArgs 2>&1 | Out-String
    Add-Content -Path $logFile -Value $out -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "$cmd $cmdArgs failed (exit $LASTEXITCODE) in $cwd`n$out" }
}
function PullFirst($repo) {
    Push-Location $repo
    try {
        git pull -q --rebase --autostash origin main 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            $pullExit = $LASTEXITCODE
            git rebase --abort 2>&1 | Out-Null
            throw "git pull failed (exit $pullExit) in $repo — check 'git status' there"
        }
    } finally { Pop-Location }
}
# 2026-10-02: 예전엔 커밋한 다음에 --autostash로 pull했다 — 그 사이 저장소에 오래
# 방치된 미커밋 파일(예: media_host.js)이 있으면 autostash가 그걸 주워서 stash pop
# 충돌을 냈고, 깨진 채 커밋된 파일이 require() 단계에서 터져 발행 체인 전체가
# 마비됐다. 대시보드의 syncAndCommit과 같은 순서로 바꾼다: 각 저장소를 건드리기
# 전에 PullFirst로 먼저 당겨두고(호출부 책임), 여기서는 add/commit/push만 한다 —
# 커밋 뒤에 다시 pull할 필요가 없으므로 autostash도 필요 없다.
function CommitAndPush($repo, $paths, $message) {
    Push-Location $repo
    try {
        # $ErrorActionPreference='Stop'라서 git이 stderr에 아무거나(CRLF 경고 등, exit 0)만
        # 써도 NativeCommandError로 죽는다 — 2>&1 | Out-Null로 stderr를 흡수해 $LASTEXITCODE만 본다.
        git diff --quiet -- @paths 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Log "no changes to commit in $repo"; return }
        git add -- @paths 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "git add failed (exit $LASTEXITCODE) in $repo" }
        git commit -q -m $message 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "git commit failed (exit $LASTEXITCODE) in $repo" }
        git push -q origin main 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "git push failed (exit $LASTEXITCODE) in $repo — remote may have new commits; this run stops here instead of force-merging, next run's PullFirst will pick them up" }
        Log "committed+pushed: $message ($repo)"
    } finally { Pop-Location }
}

# 2026-10-02: run-local.ps1(15분마다 도는 별도 작업 스케줄러 작업)도 이 desktop
# 저장소에 git commit/pull/push를 한다. 이 스크립트에 뮤텍스가 없어서 run-local.ps1과
# 동시에 겹치면 두 프로세스가 같은 작업 트리를 동시에 stash/pull/commit해 충돌이
# 났다(오늘 실측 원인). 같은 이름의 뮤텍스를 공유해 동시 실행 자체를 막는다.
$mutex = New-Object System.Threading.Mutex($false, "Global\DesktopTutorialQueue")
if (-not $mutex.WaitOne([TimeSpan]::FromMinutes(20))) { Log "SKIP: run-local.ps1이 아직 저장소를 쓰고 있어 건너뜁니다."; exit 0 }

try {
    # 0) 수정하기 전에 두 저장소 다 먼저 당겨둔다 — desktop-tutorial은 예전엔 여기서
    # 한 번도 pull 안 하고 바로 커밋+pull+push를 했었다(버그).
    PullFirst $desktop
    PullFirst $blog

    # 1) 검수된 사전 작성 글을 land-in-korea-blog 원격 저장소에 등록
    Push-Location $desktop
    Run node @('scripts/sync-blog-posts.js') $desktop
    Pop-Location
    CommitAndPush $desktop @('data/topic_blog_links.json', 'data/blog_content_queue.json') 'chore: update published post queue'

    # sync-blog-posts.js는 별도 임시 clone에서 원격 main에 글을 올린다.
    # 시작 시 pull만으로는 방금 올라간 글이 로컬 빌드에 포함되지 않는다.
    PullFirst $blog

    # 2026-10-24: 처음엔 "build.py가 homepage.py를 import할 때만" 검사했는데, 이러면
    # build.py가 구버전 discovery_home()으로 되돌아간(import 자체가 없어진) 경우는 전혀
    # 못 잡는다 — 조건부 검사가 아니라 "승인된 홈페이지 연결이 항상 있어야 한다"는 무조건
    # 검사로 바꾼다. 승인본(2026-10-24 확정): 부산 광안대교 히어로 + /home-ui/ 구조 +
    # 지역 지도(district-data) + EN/JA/ZH 전환. 필수 소스 중 하나라도 없거나 build.py가
    # write_homepage 연결을 안 쓰면, 또는 빌드 결과 index.html이 승인된 home-ui 구조를
    # 쓰지 않으면 빌드/배포 전부 중단한다.
    $buildPy = Join-Path $blog "automation\build.py"
    $homepagePy = Join-Path $blog "automation\homepage.py"
    $homepageDir = Join-Path $blog "automation\homepage"
    $requiredHomepageFiles = @(
        'automation\homepage.py',
        'automation\homepage\app.js',
        'automation\homepage\styles.css',
        'automation\homepage\explore.js',
        'automation\homepage\editorial.js',
        'automation\homepage\index.html',
        'automation\homepage\district-data-seed.json',
        'automation\homepage\blog-index-seed.json',
        'automation\homepage\assets\busan.jpg',
        'automation\homepage\assets\fonts\manrope.ttf'
    )
    $missing = $requiredHomepageFiles | Where-Object { -not (Test-Path (Join-Path $blog $_)) }
    if ($missing.Count -gt 0) {
        Log "ABORT: 승인된 홈페이지 필수 소스 누락 — $($missing -join ', ')"
        throw "Approved homepage essential source(s) missing: $($missing -join ', ') — aborting before build/deploy."
    }
    if (-not (Select-String -Path $buildPy -Pattern '^\s*from homepage import write_homepage' -Quiet)) {
        Log "ABORT: build.py가 승인된 write_homepage 연결을 쓰지 않음(구버전 discovery_home으로 되돌아간 것으로 추정) — 배포 중단"
        throw "build.py is not wired to the approved write_homepage() generator — aborting before build/deploy."
    }

    # 2) 새 원문을 검사한 뒤 이미지 채우기 + 사이트 빌드
    Push-Location "$blog\automation"
    try {
        Run python @('validate.py') "$blog\automation"
    } finally { Pop-Location }

    $env:PEXELS_API_KEY = (Get-Content "$desktop\.env" | Select-String '^PEXELS_API_KEY=(.*)$').Matches.Groups[1].Value
    $env:GITHUB_TOKEN = (Get-Content "$desktop\.env" | Select-String '^GITHUB_TOKEN=(.*)$').Matches.Groups[1].Value
    # fetch_images.py가 사진을 실제로 보고 주제·한국·화질을 확인하는 데 쓴다(없으면 사진 없이 발행).
    $env:GROQ_API_KEY = (Get-Content "$desktop\.env" | Select-String '^GROQ_API_KEY=(.*)$').Matches.Groups[1].Value
    Push-Location "$blog\automation"
    Run python @('fetch_images.py') "$blog\automation"
    Run python @('build.py') "$blog\automation"
    Run python @('verify_seo.py') "$blog\automation"
    Pop-Location
    # used_media.json = 블로그에 쓴 사진 고유번호 영구 기록(중복 금지). 커밋 안 하면 재클론 시 사라진다.
    CommitAndPush $blog @('content/posts', 'automation/used_media.json') 'chore: persist fetched/watermarked post images'

    # 2026-10-24: 위 사전 검사를 통과해도 build.py 내부 로직이 바뀌어 실제로는 승인된
    # home-ui를 안 쓰는 index.html을 뽑을 수 있으니, 빌드 결과물 자체도 승인된 구조인지
    # 확인한다 — "글 내용만 다르고 디자인은 동일"해야 하므로 home-ui 참조 자체가
    # 없으면(=구버전 discovery_home 출력) 배포하지 않는다.
    $builtIndex = Join-Path $blog "site\index.html"
    if (-not (Select-String -Path $builtIndex -Pattern 'home-ui/app\.js' -Quiet)) {
        Log "ABORT: 빌드된 site/index.html이 승인된 home-ui 구조를 참조하지 않음 — 배포 중단"
        throw "Built site/index.html does not reference the approved home-ui structure — aborting before deploy."
    }

    # 3) Cloudflare 배포용 폴더 준비(빌드 결과 복사 + 이미지 로컬화 + 경로 치환)
    Push-Location "$blog\automation"
    Run python @('localize_media.py', $site) "$blog\automation"
    Pop-Location

    # 2026-10-24: localize_media.py가 home-ui 폴더(JS/CSS/사진/폰트)를 실제로 배포 폴더에
    # 전부 복사했는지도 확인 — 복사가 누락되면 라이브에서 홈페이지가 깨진 채로 나간다.
    foreach ($f in @('home-ui\app.js', 'home-ui\styles.css', 'home-ui\explore.js', 'home-ui\editorial.js', 'home-ui\district-data.js', 'home-ui\blog-index.js', 'home-ui\assets\busan.jpg', 'home-ui\assets\fonts\manrope.ttf')) {
        if (-not (Test-Path (Join-Path $site $f))) {
            Log "ABORT: 배포 폴더에 $f 가 없음 — 배포 중단"
            throw "Deploy target is missing $f after localize_media.py — aborting before wrangler deploy."
        }
    }

    # 4) Cloudflare에 배포 (land-in-korea는 Pages가 아니라 Worker/정적assets 방식,
    # wrangler.jsonc 참고 — `pages deploy`는 "not a Pages project"로 매번 실패한다)
    Push-Location $site
    $env:CLOUDFLARE_ACCOUNT_ID = $accountId
    Run npx @('-y', 'wrangler@latest', 'deploy') $site
    Pop-Location

    Log "DONE"
} catch {
    Log "FAIL: $_"
    throw
} finally {
    $mutex.ReleaseMutex()
}
