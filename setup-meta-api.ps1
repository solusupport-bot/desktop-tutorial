# ============================================================================
# Meta API 자동 설정 가이드 (PowerShell 버전)
# Facebook Developers에서 토큰 발급받고 자동으로 .env에 저장
# ============================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Blue
Write-Host "  Meta API 토큰 발급 및 자동 설정" -ForegroundColor Blue
Write-Host "============================================================" -ForegroundColor Blue

# Step 1: 브라우저에서 Meta for Developers 열기
Write-Host ""
Write-Host "[1/5] Meta for Developers 페이지 열기" -ForegroundColor Yellow
Write-Host "아래 URL을 브라우저에서 열어주세요:" -ForegroundColor Cyan
Write-Host " https://developers.facebook.com" -ForegroundColor Green
Write-Host ""
Write-Host "로그인 후 우측 상단 'My Apps' -> 'Create App' 클릭하세요." -ForegroundColor Cyan

# 브라우저 자동 열기 (Windows)
Start-Process "https://developers.facebook.com"

Read-Host "완료했으면 Enter 키를 누르세요"

# Step 2: 토큰 정보 입력
Write-Host ""
Write-Host "[2/5] 발급받은 토큰 정보 입력" -ForegroundColor Yellow
Write-Host ""

$FB_PAGE_ACCESS_TOKEN = Read-Host "FB_PAGE_ACCESS_TOKEN 입력"
if ([string]::IsNullOrEmpty($FB_PAGE_ACCESS_TOKEN)) {
    Write-Host "오류: 토큰이 비어있습니다." -ForegroundColor Red
    exit 1
}

$FB_PAGE_ID = Read-Host "FB_PAGE_ID 입력"
if ([string]::IsNullOrEmpty($FB_PAGE_ID)) {
    Write-Host "오류: 페이지 ID가 비어있습니다." -ForegroundColor Red
    exit 1
}

$IG_USER_ID = Read-Host "IG_USER_ID 입력 (선택, 없으면 Enter)"
$IG_ACCESS_TOKEN = Read-Host "IG_ACCESS_TOKEN 입력 (선택, 없으면 Enter)"
$THREADS_ACCESS_TOKEN = Read-Host "THREADS_ACCESS_TOKEN 입력 (선택, 없으면 Enter)"
$THREADS_USER_ID = Read-Host "THREADS_USER_ID 입력 (선택, 없으면 Enter)"

# Step 3: 토큰 검증
Write-Host ""
Write-Host "[3/5] 토큰 유효성 검사 중..." -ForegroundColor Yellow

$validate_choice = Read-Host "토큰 검증을 수행할까요? (y/n)"

if ($validate_choice -eq "y") {
    if (-not [string]::IsNullOrEmpty($FB_PAGE_ACCESS_TOKEN)) {
        try {
            $response = Invoke-RestMethod -Uri "https://graph.instagram.com/me?access_token=$FB_PAGE_ACCESS_TOKEN" -ErrorAction Stop
            Write-Host "OK: FB_PAGE_ACCESS_TOKEN 유효함" -ForegroundColor Green
        } catch {
            Write-Host "경고: FB_PAGE_ACCESS_TOKEN 유효성 확인 실패 (그래도 저장은 진행합니다)" -ForegroundColor Red
        }
    }
}

# Step 4: .env 파일에 저장
Write-Host ""
Write-Host "[4/5] 토큰을 .env 파일에 저장 중..." -ForegroundColor Yellow

$ENV_FILE = ".env"

if (Test-Path $ENV_FILE) {
    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    Copy-Item $ENV_FILE -Destination ".env.backup.$timestamp"
    Write-Host "기존 .env 백업: .env.backup.$timestamp" -ForegroundColor Cyan
}

$keysToReplace = @('FB_PAGE_ACCESS_TOKEN', 'FB_PAGE_ID', 'IG_USER_ID', 'IG_ACCESS_TOKEN', 'THREADS_ACCESS_TOKEN', 'THREADS_USER_ID')
$envContent = New-Object System.Collections.Generic.List[string]

if (Test-Path $ENV_FILE) {
    $existing = Get-Content $ENV_FILE
    foreach ($line in $existing) {
        $isKeyLine = $false
        foreach ($key in $keysToReplace) {
            if ($line -match "^$key=") {
                $isKeyLine = $true
                break
            }
        }
        if (-not $isKeyLine) {
            $envContent.Add($line)
        }
    }
}

if (-not [string]::IsNullOrEmpty($FB_PAGE_ACCESS_TOKEN)) { $envContent.Add("FB_PAGE_ACCESS_TOKEN=$FB_PAGE_ACCESS_TOKEN") }
if (-not [string]::IsNullOrEmpty($FB_PAGE_ID)) { $envContent.Add("FB_PAGE_ID=$FB_PAGE_ID") }
if (-not [string]::IsNullOrEmpty($IG_USER_ID)) { $envContent.Add("IG_USER_ID=$IG_USER_ID") }
if (-not [string]::IsNullOrEmpty($IG_ACCESS_TOKEN)) { $envContent.Add("IG_ACCESS_TOKEN=$IG_ACCESS_TOKEN") }
if (-not [string]::IsNullOrEmpty($THREADS_ACCESS_TOKEN)) { $envContent.Add("THREADS_ACCESS_TOKEN=$THREADS_ACCESS_TOKEN") }
if (-not [string]::IsNullOrEmpty($THREADS_USER_ID)) { $envContent.Add("THREADS_USER_ID=$THREADS_USER_ID") }

$envContent | Set-Content $ENV_FILE -Encoding UTF8
Write-Host "OK: .env 파일 업데이트 완료" -ForegroundColor Green

# Step 5: 설정 확인
Write-Host ""
Write-Host "[5/5] 설정 확인 중..." -ForegroundColor Yellow

Write-Host ""
Write-Host "============================================================" -ForegroundColor Blue
Write-Host "Meta API 설정 완료!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Blue

Write-Host ""
Write-Host "설정된 토큰:"
Write-Host "============================================================" -ForegroundColor Blue

function Show-MaskedToken($name, $value) {
    if (-not [string]::IsNullOrEmpty($value)) {
        if ($value.Length -gt 15) {
            $masked = $value.Substring(0, 10) + "..." + $value.Substring($value.Length - 5)
        } else {
            $masked = $value
        }
        Write-Host "OK: $name = $masked" -ForegroundColor Green
    }
}

Show-MaskedToken "FB_PAGE_ACCESS_TOKEN" $FB_PAGE_ACCESS_TOKEN
if (-not [string]::IsNullOrEmpty($FB_PAGE_ID)) { Write-Host "OK: FB_PAGE_ID = $FB_PAGE_ID" -ForegroundColor Green }
if (-not [string]::IsNullOrEmpty($IG_USER_ID)) { Write-Host "OK: IG_USER_ID = $IG_USER_ID" -ForegroundColor Green }
Show-MaskedToken "IG_ACCESS_TOKEN" $IG_ACCESS_TOKEN
Show-MaskedToken "THREADS_ACCESS_TOKEN" $THREADS_ACCESS_TOKEN
if (-not [string]::IsNullOrEmpty($THREADS_USER_ID)) { Write-Host "OK: THREADS_USER_ID = $THREADS_USER_ID" -ForegroundColor Green }

Write-Host "============================================================" -ForegroundColor Blue

Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Blue
Write-Host ""
Write-Host "1) 로컬 테스트:"
Write-Host "   npm run curate-and-schedule"
Write-Host ""
Write-Host "2) GitHub Actions에 토큰 등록 (실서비스용):"
Write-Host "   Settings -> Secrets and variables -> Actions"
Write-Host ""
Write-Host "3) GitHub에서 워크플로우 활성화:"
Write-Host "   Settings -> Actions -> General -> Workflow permissions"
Write-Host "   'Read and write' 권한 설정"
Write-Host ""

Write-Host "보안 주의:" -ForegroundColor Yellow
Write-Host "   - .env 파일은 .gitignore에 포함되어 있습니다"
Write-Host "   - 절대 토큰을 public repository에 commit하지 마세요"
Write-Host "   - 정기적으로 토큰을 갱신하세요"
Write-Host ""

Write-Host "설정 완료! 이제 SNS 자동화를 시작할 수 있습니다." -ForegroundColor Green
