param()

$ErrorActionPreference = 'Stop'

function Get-CommandPathOrNull {
  param([string]$Name)

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    return $null
  }

  return $cmd.Source
}

function Ensure-UserPathContains {
  param([string]$Dir)

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ([string]::IsNullOrWhiteSpace($userPath)) {
    $newUserPath = $Dir
  } elseif ($userPath -split ';' -notcontains $Dir) {
    $newUserPath = ($userPath.TrimEnd(';') + ';' + $Dir)
  } else {
    $newUserPath = $userPath
  }

  [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')

  if ($env:Path -split ';' -notcontains $Dir) {
    $env:Path = $env:Path + ';' + $Dir
  }
}

if (-not (Get-CommandPathOrNull 'node')) {
  throw 'Node.js 20 or newer is required. Install it from https://nodejs.org/ and run this installer again.'
}

if (-not (Get-CommandPathOrNull 'gh')) {
  throw 'GitHub CLI is required for private installs. Install it from https://cli.github.com/ and run `gh auth login` first.'
}

& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI is not authenticated. Run `gh auth login` first and try again.'
}

& gh auth setup-git *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI could not configure git credentials. Run `gh auth setup-git` manually and try again.'
}

$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
if (-not (Test-Path (Join-Path $sourceRoot '.git'))) {
  throw 'This installer must run from a cloned private repository.'
}

$bunPath = Get-CommandPathOrNull 'bun'
if (-not $bunPath) {
  Write-Host 'Bun not found. Installing Bun...'
  powershell -ExecutionPolicy Bypass -c "irm bun.sh/install.ps1 | iex"
  $bunPath = Join-Path $HOME '.bun\bin\bun.exe'
}

if (-not (Test-Path $bunPath)) {
  throw 'Bun installation was not found after setup. Open a new terminal and try again.'
}

Write-Host 'Installing dependencies from the private repository clone...'
& $bunPath install --cwd $sourceRoot
if (-not $?) {
  throw 'bun install failed.'
}

Write-Host 'Building OpenClaude...'
& $bunPath run --cwd $sourceRoot build
if (-not $?) {
  throw 'bun run build failed.'
}

$bunBinDir = Split-Path -Parent $bunPath
New-Item -ItemType Directory -Force -Path $bunBinDir | Out-Null
Ensure-UserPathContains -Dir $bunBinDir

$launcherPath = Join-Path $bunBinDir 'login-opencloud.cmd'
$launcherContent = @"
@echo off
node "$sourceRoot\dist\cli.mjs" %*
"@
Set-Content -Path $launcherPath -Value $launcherContent -Encoding ASCII

$launcherPs1Path = Join-Path $bunBinDir 'login-opencloud.ps1'
$launcherPs1Content = @"
node "$sourceRoot\dist\cli.mjs" @args
"@
Set-Content -Path $launcherPs1Path -Value $launcherPs1Content -Encoding ASCII

$updateScriptPath = Join-Path $sourceRoot 'scripts\update-private.ps1'
$updateCmdPath = Join-Path $bunBinDir 'login-opencloud-update.cmd'
$updateCmdContent = @"
@echo off
powershell -ExecutionPolicy Bypass -File "$updateScriptPath" %*
"@
Set-Content -Path $updateCmdPath -Value $updateCmdContent -Encoding ASCII

$updatePs1Path = Join-Path $bunBinDir 'login-opencloud-update.ps1'
$updatePs1Content = @"
powershell -ExecutionPolicy Bypass -File "$updateScriptPath" @args
"@
Set-Content -Path $updatePs1Path -Value $updatePs1Content -Encoding ASCII

Write-Host ''
Write-Host 'Private install completed successfully.'
Write-Host "Repository clone: $sourceRoot"
Write-Host "Launchers: $launcherPath, $launcherPs1Path"
Write-Host "Updater: $updateCmdPath, $updatePs1Path"
Write-Host "PATH updated with: $bunBinDir"
Write-Host ''
Write-Host 'Open a new PowerShell window if needed, then run:'
Write-Host '  login-opencloud'
Write-Host ''
Write-Host 'To update later, run:'
Write-Host '  login-opencloud-update'
