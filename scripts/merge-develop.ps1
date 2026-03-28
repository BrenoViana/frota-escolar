param(
  [string]$SourceBranch = ''
)

$ErrorActionPreference = 'Stop'

function Assert-Clean {
  $status = git status --porcelain
  if ($status) {
    throw "Working tree not clean. Commit or stash changes before merging."
  }
}

if (-not $SourceBranch) {
  $SourceBranch = (git rev-parse --abbrev-ref HEAD).Trim()
}

if ($SourceBranch -eq 'develop') {
  throw "Source branch is 'develop'. Please run from a feature branch or pass -SourceBranch."
}

Assert-Clean

Write-Host "Fetching origin..."
& git fetch origin

Write-Host "Switching to develop..."
& git switch develop

Write-Host "Pulling latest develop..."
& git pull --ff-only

Write-Host "Merging $SourceBranch into develop..."
& git merge --no-ff $SourceBranch -m "merge: $SourceBranch into develop"

Write-Host "Pushing develop..."
& git push origin develop

Write-Host "Switching back to $SourceBranch..."
& git switch $SourceBranch

Write-Host "Done."
