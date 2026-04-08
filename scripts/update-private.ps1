param(
  [string]$Branch
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
  throw 'Node.js 20 or newer is required.'
}

if (-not (Get-CommandPathOrNull 'git')) {
  throw 'Git is required to update the private repository clone.'
}

if (-not (Get-CommandPathOrNull 'gh')) {
  throw 'GitHub CLI is required for private updates. Install it from https://cli.github.com/ and run `gh auth login` first.'
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
  throw 'The installed private repository clone was not found.'
}

$targetBranch = $Branch
if ([string]::IsNullOrWhiteSpace($targetBranch)) {
  $targetBranch = (& git -C $sourceRoot rev-parse --abbrev-ref HEAD).Trim()
}
if ([string]::IsNullOrWhiteSpace($targetBranch) -or $targetBranch -eq 'HEAD') {
  $targetBranch = 'main'
}

Write-Host "Pulling latest changes from origin/$targetBranch..."
& git -C $sourceRoot pull --ff-only origin $targetBranch
if (-not $?) {
  throw 'git pull failed.'
}

$bunPath = Get-CommandPathOrNull 'bun'
if (-not $bunPath) {
  $bunPath = Join-Path $HOME '.bun\bin\bun.exe'
}

if (-not (Test-Path $bunPath)) {
  throw 'Bun was not found. Re-run scripts\install-private.ps1 to reinstall the private launcher.'
}

Write-Host 'Installing updated dependencies...'
& $bunPath install --cwd $sourceRoot
if (-not $?) {
  throw 'bun install failed.'
}

Write-Host 'Rebuilding OpenClaude...'
& $bunPath run --cwd $sourceRoot build
if (-not $?) {
  throw 'bun run build failed.'
}

Write-Host ''
Write-Host 'Private update completed successfully.'
Write-Host 'Run `login-opencloud` to start the updated build.'
