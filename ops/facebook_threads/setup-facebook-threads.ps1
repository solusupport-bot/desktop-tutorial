# Land in Korea — Facebook + Threads only setup
# Brand operation rule: Instagram values are intentionally not collected here.
[CmdletBinding()]
param(
  [string]$Repository = "solusupport-bot/desktop-tutorial",
  [switch]$SaveLocalEnv
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "'$Name' is required. Install it, then run this script again."
  }
}

function Read-RequiredSecureValue {
  param([string]$Prompt)
  do {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  } while ([string]::IsNullOrWhiteSpace($value))
  return $value
}

function Read-RequiredValue {
  param([string]$Prompt)
  do { $value = Read-Host $Prompt } while ([string]::IsNullOrWhiteSpace($value))
  return $value
}

Require-Command gh
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw "GitHub CLI login is required. Run: gh auth login" }

Write-Host "`nLand in Korea — Facebook + Threads setup" -ForegroundColor Cyan
Write-Host "Instagram is intentionally excluded until the Meta protection limit is lifted.`n" -ForegroundColor Yellow

$FB_PAGE_ACCESS_TOKEN = Read-RequiredSecureValue "FB_PAGE_ACCESS_TOKEN (hidden input)"
$FB_PAGE_ID = Read-RequiredValue "FB_PAGE_ID"
$THREADS_ACCESS_TOKEN = Read-RequiredSecureValue "THREADS_ACCESS_TOKEN (hidden input)"
$THREADS_USER_ID = Read-RequiredValue "THREADS_USER_ID"

try {
  Write-Host "`nRegistering four GitHub Actions Secrets in $Repository ..." -ForegroundColor Cyan
  $FB_PAGE_ACCESS_TOKEN | & gh secret set FB_PAGE_ACCESS_TOKEN --repo $Repository
  $FB_PAGE_ID | & gh secret set FB_PAGE_ID --repo $Repository
  $THREADS_ACCESS_TOKEN | & gh secret set THREADS_ACCESS_TOKEN --repo $Repository
  $THREADS_USER_ID | & gh secret set THREADS_USER_ID --repo $Repository

  if ($SaveLocalEnv) {
    $envPath = Join-Path $PSScriptRoot "local.env"
    @(
      "FB_PAGE_ACCESS_TOKEN=$FB_PAGE_ACCESS_TOKEN"
      "FB_PAGE_ID=$FB_PAGE_ID"
      "THREADS_ACCESS_TOKEN=$THREADS_ACCESS_TOKEN"
      "THREADS_USER_ID=$THREADS_USER_ID"
    ) | Set-Content -Path $envPath -Encoding utf8NoBOM
    Write-Host "Optional local values saved at $envPath." -ForegroundColor Yellow
  } else {
    Write-Host "Local token file was not created. Add -SaveLocalEnv only if you need local testing." -ForegroundColor Yellow
  }

  Write-Host "`nDone. GitHub Secrets registered: FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID, THREADS_ACCESS_TOKEN, THREADS_USER_ID" -ForegroundColor Green
  Write-Host "No Instagram secret was created or changed." -ForegroundColor Green
}
finally {
  Remove-Variable FB_PAGE_ACCESS_TOKEN, THREADS_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
