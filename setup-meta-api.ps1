# ============================================================================
# 🔐 Meta API 자동 설정 가이드 (PowerShell 버전)
# Facebook Developers에서 토큰 발급받고 자동으로 .env에 저장
# ============================================================================

# 색상 정의
$GREEN = "`e[0;32m"
$BLUE = "`e[0;34m"
$YELLOW = "`e[1;33m"
$RED = "`e[0;31m"
$NC = "`e[0m"

Write-Host "`n$BLUE════════════════════════════════════════════════════════$NC"
Write-Host "$BLUE  🔐 Meta API 토큰 발급 및 자동 설정$NC"
Write-Host "$BLUE════════════════════════════════════════════════════════$NC"

# Step 1: 브라우저에서 Meta for Developers 열기
Write-Host "`n$YELLOW[1/5] Meta for Developers 페이지 열기$NC"
Write-Host "$BLUE아래 URL을 브라우저에서 열어주세요:$NC"
Write-Host "$GREEN https://developers.facebook.com$NC"
Write-Host ""
Write-Host "$BLUE로그인 후 우측 상단 'My Apps' → 'Create App' 클릭하세요.$NC"

# 브라우저 자동 열기 (Windows)
Start-Process "https://developers.facebook.com"

Read-Host "완료했으면 Enter 키를 누르세요"

# Step 2: 토큰 정보 입력
Write-Host "`n$YELLOW[2/5] 발급받은 토큰 정보 입력$NC"
Write-Host ""

# Facebook 페이지 액세스 토큰
$FB_PAGE_ACCESS_TOKEN = Read-Host "FB_PAGE_ACCESS_TOKEN 입력"
if ([string]::IsNullOrEmpty($FB_PAGE_ACCESS_TOKEN)) {
    Write-Host "$RED❌ 토큰이 비어있습니다.$NC"
    exit 1
}

# Facebook 페이지 ID
$FB_PAGE_ID = Read-Host "FB_PAGE_ID 입력"
if ([string]::IsNullOrEmpty($FB_PAGE_ID)) {
    Write-Host "$RED❌ 페이지 ID가 비어있습니다.$NC"
    exit 1
}

# Instagram 비즈니스 계정 ID (선택사항)
$IG_USER_ID = Read-Host "IG_USER_ID 입력 (선택, 없으면 Enter)"

# Instagram 액세스 토큰 (선택사항)
$IG_ACCESS_TOKEN = Read-Host "IG_ACCESS_TOKEN 입력 (선택, 없으면 Enter)"

# Threads 액세스 토큰 (선택사항)
$THREADS_ACCESS_TOKEN = Read-Host "THREADS_ACCESS_TOKEN 입력 (선택, 없으면 Enter)"

# Threads 사용자 ID (선택사항)
$THREADS_USER_ID = Read-Host "THREADS_USER_ID 입력 (선택, 없으면 Enter)"

# Step 3: 토큰 검증
Write-Host "`n$YELLOW[3/5] 토큰 유효성 검사 중...$NC"

$validate_choice = Read-Host "토큰 검증을 수행할까요? (y/n)"

if ($validate_choice -eq "y") {
    Write-Host "$YELLOW검증 진행 중...$NC"

    if (-not [string]::IsNullOrEmpty($FB_PAGE_ACCESS_TOKEN)) {
        try {
            $response = Invoke-RestMethod -Uri "https://graph.instagram.com/me?access_token=$FB_PAGE_ACCESS_TOKEN" -ErrorAction Stop
            Write-Host "$GREEN✅ FB_PAGE_ACCESS_TOKEN: 유효함$NC"
        } catch {
            Write-Host "$RED❌ FB_PAGE_ACCESS_TOKEN: 유효하지 않음$NC"
        }
    }
}

# Step 4: .env 파일에 저장
Write-Host "`n$YELLOW[4/5] 토큰을 .env 파일에 저장 중...$NC"

$ENV_FILE = ".env"

# 백업 생성
if (Test-Path $ENV_FILE) {
    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    Copy-Item $ENV_FILE -Destination ".env.backup.$timestamp"
    Write-Host "$BLUE기존 .env 백업: .env.backup.$timestamp$NC"
}

# .env 파일 업데이트
$envContent = @()

# 기존 파일 내용 읽기 (FB_PAGE_ACCESS_TOKEN 등은 제외)
if (Test-Path $ENV_FILE) {
    $existing = Get-Content $ENV_FILE
    $existing | ForEach-Object {
        if (-not $_ -match '^(FB_PAGE_ACCESS_TOKEN|FB_PAGE_ID|IG_USER_ID|IG_ACCESS_TOKEN|THREADS_ACCESS_TOKEN|THREADS_USER_ID)=') {
            $envContent += $_
        }
    }
}

# 새로운 토큰 추가
if (-not [string]::IsNullOrEmpty($FB_PAGE_ACCESS_TOKEN)) {
    $envContent += "FB_PAGE_ACCESS_TOKEN=$FB_PAGE_ACCESS_TOKEN"
}
if (-not [string]::IsNullOrEmpty($FB_PAGE_ID)) {
    $envContent += "FB_PAGE_ID=$FB_PAGE_ID"
}
if (-not [string]::IsNullOrEmpty($IG_USER_ID)) {
    $envContent += "IG_USER_ID=$IG_USER_ID"
}
if (-not [string]::IsNullOrEmpty($IG_ACCESS_TOKEN)) {
    $envContent += "IG_ACCESS_TOKEN=$IG_ACCESS_TOKEN"
}
if (-not [string]::IsNullOrEmpty($THREADS_ACCESS_TOKEN)) {
    $envContent += "THREADS_ACCESS_TOKEN=$THREADS_ACCESS_TOKEN"
}
if (-not [string]::IsNullOrEmpty($THREADS_USER_ID)) {
    $envContent += "THREADS_USER_ID=$THREADS_USER_ID"
}

# 파일 쓰기
$envContent | Set-Content $ENV_FILE -Encoding UTF8
Write-Host "$GREEN✅ .env 파일 업데이트 완료$NC"

# Step 5: 설정 확인
Write-Host "`n$YELLOW[5/5] 설정 확인 중...$NC"

Write-Host "`n$BLUE════════════════════════════════════════════════════════$NC"
Write-Host "$GREEN🎉 Meta API 설정 완료!$NC"
Write-Host "$BLUE════════════════════════════════════════════════════════$NC"

Write-Host "`n📝 설정된 토큰:"
Write-Host "$BLUE════════════════════════════════════════════════════════$NC"

if (-not [string]::IsNullOrEmpty($FB_PAGE_ACCESS_TOKEN)) {
    $masked = $FB_PAGE_ACCESS_TOKEN.Substring(0, [Math]::Min(10, $FB_PAGE_ACCESS_TOKEN.Length)) + "..." + $FB_PAGE_ACCESS_TOKEN.Substring([Math]::Max(0, $FB_PAGE_ACCESS_TOKEN.Length - 5))
    Write-Host "$GREEN✅ FB_PAGE_ACCESS_TOKEN: $masked$NC"
}
if (-not [string]::IsNullOrEmpty($FB_PAGE_ID)) {
    Write-Host "$GREEN✅ FB_PAGE_ID: $FB_PAGE_ID$NC"
}
if (-not [string]::IsNullOrEmpty($IG_USER_ID)) {
    Write-Host "$GREEN✅ IG_USER_ID: $IG_USER_ID$NC"
}
if (-not [string]::IsNullOrEmpty($IG_ACCESS_TOKEN)) {
    $masked = $IG_ACCESS_TOKEN.Substring(0, [Math]::Min(10, $IG_ACCESS_TOKEN.Length)) + "..." + $IG_ACCESS_TOKEN.Substring([Math]::Max(0, $IG_ACCESS_TOKEN.Length - 5))
    Write-Host "$GREEN✅ IG_ACCESS_TOKEN: $masked$NC"
}
if (-not [string]::IsNullOrEmpty($THREADS_ACCESS_TOKEN)) {
    $masked = $THREADS_ACCESS_TOKEN.Substring(0, [Math]::Min(10, $THREADS_ACCESS_TOKEN.Length)) + "..." + $THREADS_ACCESS_TOKEN.Substring([Math]::Max(0, $THREADS_ACCESS_TOKEN.Length - 5))
    Write-Host "$GREEN✅ THREADS_ACCESS_TOKEN: $masked$NC"
}
if (-not [string]::IsNullOrEmpty($THREADS_USER_ID)) {
    Write-Host "$GREEN✅ THREADS_USER_ID: $THREADS_USER_ID$NC"
}

Write-Host "$BLUE════════════════════════════════════════════════════════$NC"

Write-Host "`n$BLUE📋 다음 단계:$NC"
Write-Host ""
Write-Host "1️⃣  로컬 테스트:"
Write-Host "   npm run curate-and-schedule"
Write-Host ""
Write-Host "2️⃣  GitHub Actions에 토큰 등록 (실서비스용):"
Write-Host "   Settings → Secrets and variables → Actions"
Write-Host ""
Write-Host "3️⃣  GitHub에서 워크플로우 활성화:"
Write-Host "   Settings → Actions → General → Workflow permissions"
Write-Host "   'Read and write' 권한 설정"
Write-Host ""

Write-Host "$YELLOW⚠️  보안 주의:$NC"
Write-Host "   - .env 파일은 .gitignore에 포함되어 있습니다"
Write-Host "   - 절대 토큰을 public repository에 commit하지 마세요"
Write-Host "   - 정기적으로 토큰을 갱신하세요"
Write-Host ""

Write-Host "$GREEN✅ 설정 완료! 이제 SNS 자동화를 시작할 수 있습니다.$NC"
