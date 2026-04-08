param(
  [string]$RepoOwner = 'JONATHAN7D',
  [string]$RepoName = 'login-OpenCloud',
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

function Get-CommandPathOrNull {
  param([string]$Name)

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    return $null
  }

  return $cmd.Source
}

if (-not (Get-CommandPathOrNull 'node')) {
  throw 'Node.js 20 or newer is required. Install it from https://nodejs.org/ and run this installer again.'
}

$installRoot = Join-Path $HOME '.login-opencloud'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('login-opencloud-' + [guid]::NewGuid().ToString('N'))
$archivePath = Join-Path $tempRoot 'repo.zip'
$extractRoot = Join-Path $tempRoot 'extract'
$archiveUrl = "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$Branch.zip"

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$bunPath = Get-CommandPathOrNull 'bun'
if (-not $bunPath) {
  Write-Host 'Bun not found. Installing Bun...'
  powershell -ExecutionPolicy Bypass -c "irm bun.sh/install.ps1 | iex"
  $bunPath = Join-Path $HOME '.bun\bin\bun.exe'
}

if (-not (Test-Path $bunPath)) {
  throw 'Bun installation was not found after setup. Open a new terminal and try again.'
}

Write-Host "Downloading $archiveUrl"
Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath

New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
Expand-Archive -Path $archivePath -DestinationPath $extractRoot -Force

$repoDir = Get-ChildItem -Path $extractRoot -Directory | Select-Object -First 1
if ($null -eq $repoDir) {
  throw 'The GitHub archive could not be extracted.'
}

if (Test-Path $installRoot) {
  Remove-Item -Recurse -Force $installRoot
}

Move-Item -Path $repoDir.FullName -Destination $installRoot

Write-Host 'Installing dependencies...'
& $bunPath install --cwd $installRoot
if (-not $?) {
  throw 'bun install failed.'
}

Write-Host 'Building OpenClaude...'
& $bunPath run --cwd $installRoot build
if (-not $?) {
  throw 'bun run build failed.'
}

$bunBinDir = Split-Path -Parent $bunPath
New-Item -ItemType Directory -Force -Path $bunBinDir | Out-Null

$wrapperPath = Join-Path $bunBinDir 'login-opencloud.cmd'
$wrapperContent = @"
@echo off
node "$installRoot\dist\cli.mjs" %*
"@
Set-Content -Path $wrapperPath -Value $wrapperContent -Encoding ASCII

$psWrapperPath = Join-Path $bunBinDir 'login-opencloud.ps1'
$psWrapperContent = @"
node "$installRoot\dist\cli.mjs" @args
"@
Set-Content -Path $psWrapperPath -Value $psWrapperContent -Encoding ASCII

Remove-Item -Recurse -Force $tempRoot

Write-Host ''
Write-Host 'OpenClaude installed successfully.'
Write-Host "Install directory: $installRoot"
Write-Host "Launchers: $wrapperPath, $psWrapperPath"
Write-Host ''
Write-Host 'If the `login-opencloud` command is not recognized yet, close PowerShell, open it again, and run:'
Write-Host '  login-opencloud'
