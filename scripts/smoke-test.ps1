param(
  [string]$BaseUrl = $env:CARETRACK_BASE_URL,
  [string]$ApiBaseUrl = $env:CARETRACK_API_BASE_URL,
  [string]$Email = $env:CARETRACK_SMOKE_EMAIL,
  [string]$Password = $env:CARETRACK_SMOKE_PASSWORD,
  [int]$TimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'
$script:Failures = 0

function Normalize-BaseUrl {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }
  return $Value.Trim().TrimEnd('/')
}

function Join-Url {
  param([string]$Base, [string]$Path)
  return "$($Base.TrimEnd('/'))/$($Path.TrimStart('/'))"
}

function Pass {
  param([string]$Name, [string]$Detail = '')
  if ($Detail) {
    Write-Host "PASS $Name - $Detail"
  } else {
    Write-Host "PASS $Name"
  }
}

function Fail {
  param([string]$Name, [string]$Detail)
  $script:Failures += 1
  Write-Host "FAIL $Name - $Detail" -ForegroundColor Red
}

function Invoke-SmokeRequest {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null,
    [hashtable]$Headers = @{},
    [int[]]$ExpectedStatus = @(200)
  )

  try {
    $parameters = @{
      Method = $Method
      Uri = $Uri
      TimeoutSec = $TimeoutSeconds
      Headers = $Headers
      UseBasicParsing = $true
    }
    if ($null -ne $Body) {
      $parameters.Body = ($Body | ConvertTo-Json -Depth 10)
      $parameters.ContentType = 'application/json'
    }

    $response = Invoke-WebRequest @parameters
    if ($ExpectedStatus -contains [int]$response.StatusCode) {
      Pass $Name "HTTP $($response.StatusCode)"
      return $response
    }

    Fail $Name "expected $($ExpectedStatus -join '/') but got HTTP $($response.StatusCode)"
    return $response
  } catch {
    $response = $_.Exception.Response
    if ($response -and $response.StatusCode) {
      $statusCode = [int]$response.StatusCode
      if ($ExpectedStatus -contains $statusCode) {
        Pass $Name "HTTP $statusCode"
      } else {
        Fail $Name "expected $($ExpectedStatus -join '/') but got HTTP $statusCode"
      }
      return $response
    }

    Fail $Name $_.Exception.Message
    return $null
  }
}

$BaseUrl = Normalize-BaseUrl $BaseUrl
$ApiBaseUrl = Normalize-BaseUrl $ApiBaseUrl

if (-not $BaseUrl -and -not $ApiBaseUrl) {
  Write-Host 'Set CARETRACK_BASE_URL or pass -BaseUrl, for example https://staging.example.com' -ForegroundColor Red
  exit 2
}

if (-not $ApiBaseUrl) {
  $ApiBaseUrl = Join-Url $BaseUrl '/api/v1'
}

Write-Host "CareTrack smoke test"
Write-Host "Base URL: $BaseUrl"
Write-Host "API URL:  $ApiBaseUrl"

if ($BaseUrl) {
  Invoke-SmokeRequest -Name 'frontend root reachable' -Method GET -Uri $BaseUrl -ExpectedStatus @(200)
}

$health = Invoke-SmokeRequest -Name 'backend health endpoint' -Method GET -Uri (Join-Url $ApiBaseUrl '/health') -ExpectedStatus @(200, 503)
if ($health -and [int]$health.StatusCode -eq 503) {
  Fail 'database health' 'health endpoint returned 503, API is reachable but database readiness failed'
} elseif ($health) {
  Pass 'database health' 'health endpoint did not report database failure'
}

Invoke-SmokeRequest -Name 'API root reachable' -Method GET -Uri $ApiBaseUrl -ExpectedStatus @(200, 404)
Invoke-SmokeRequest -Name 'unauthenticated protected API returns 401' -Method GET -Uri (Join-Url $ApiBaseUrl '/auth/me') -ExpectedStatus @(401)

if ($Email -and $Password) {
  $login = Invoke-SmokeRequest -Name 'optional login' -Method POST -Uri (Join-Url $ApiBaseUrl '/auth/login') -Body @{
    email = $Email
    password = $Password
  } -ExpectedStatus @(200, 201, 401, 403)

  if ($login -and ([int]$login.StatusCode -eq 200 -or [int]$login.StatusCode -eq 201)) {
    try {
      $payload = $login.Content | ConvertFrom-Json
      $token = $payload.accessToken
      if ($token) {
        Invoke-SmokeRequest -Name 'optional authenticated me' -Method GET -Uri (Join-Url $ApiBaseUrl '/auth/me') -Headers @{
          Authorization = "Bearer $token"
        } -ExpectedStatus @(200)
      } else {
        Fail 'optional authenticated me' 'login response did not include accessToken'
      }
    } catch {
      Fail 'optional authenticated me' $_.Exception.Message
    }
  }
} else {
  Write-Host 'SKIP optional authenticated checks - CARETRACK_SMOKE_EMAIL/PASSWORD not set'
}

if ($script:Failures -gt 0) {
  Write-Host "Smoke test completed with $script:Failures failure(s)." -ForegroundColor Red
  exit 1
}

Write-Host 'Smoke test completed successfully.'
exit 0
