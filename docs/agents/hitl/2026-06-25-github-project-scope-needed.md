# Prepared Human Step: Refresh GitHub Project Scope

Date: 2026-06-25
Owner: Solo Operator
Reason: GitHub Project reconciliation requires a `gh` token with the `project` scope.
Status: Resolved on 2026-06-25.

## Context

The local repo was ready to reconcile the GitHub Project board, but the authenticated GitHub CLI token at the time could not mutate Project items. `read:project` was enough for export/read checks; reconciliation needed the `project` scope.

Resolution update: the Solo Operator refreshed Project access, added issues `#45` through `#55` to Project 1, and reran `pnpm verify:project -- --strict-external`. The strict verifier passed for local readiness, GitHub Project read path, Project write scope, and issue `#45` Project visibility.

Observed error:

```text
error: your authentication token is missing required scopes [project]
To request it, run:  gh auth refresh -s project
```

## Human Step

Run:

```bash
gh auth refresh -s project
```

Then verify:

```bash
gh auth status
```

The authenticated account should still be `nithingm`, and the token should include `project` scope.

## Reconciliation Commands

After the scope is refreshed, run this from `D:\Projects\AutoPocock`:

```powershell
$ErrorActionPreference = 'Stop'
$projectNumber = 1
$owner = 'nithingm'
$projectId = 'PVT_kwHOAJHjAc4BXs8i'
$executionStageField = 'PVTSSF_lAHOAJHjAc4BXs8izhS4IKY'
$executionLaneField = 'PVTSSF_lAHOAJHjAc4BXs8izhS4IYA'
$doneStageOption = 'd2a3a7c3'
$closedLaneOption = '3297825e'

$items = (gh project item-list $projectNumber --owner $owner --format json --limit 100 | ConvertFrom-Json).items
$closedItems = $items | Where-Object { $_.content.number -ge 1 -and $_.content.number -le 32 }

foreach ($item in $closedItems) {
  gh project item-edit --id $item.id --project-id $projectId --field-id $executionStageField --single-select-option-id $doneStageOption | Out-Null
  gh project item-edit --id $item.id --project-id $projectId --field-id $executionLaneField --single-select-option-id $closedLaneOption | Out-Null
}

$existingNumbers = @{}
foreach ($item in $items) {
  if ($item.content.number) {
    $existingNumbers[[int]$item.content.number] = $true
  }
}

$openIssues = gh issue list --state open --limit 100 --json number,url | ConvertFrom-Json
foreach ($issue in $openIssues) {
  $number = [int]$issue.number
  if ($number -ge 45 -and $number -le 55 -and -not $existingNumbers.ContainsKey($number)) {
    gh project item-add $projectNumber --owner $owner --url $issue.url | Out-Null
  }
}
```

## Validation

Run:

```bash
pnpm ops github:export -- --issue 45
```

Expected after reconciliation:

- issue `#45` is present in the configured Project export
- the export no longer treats closed issues `#1` through `#32` as workflow-active solely because `Execution Stage` is empty

## Boundary

Do not close `#45` through `#55` from this step. Adding them to the Project only restores tracker visibility. Closing those issues still requires review of the local source/test/docs evidence and an intentional PR or merge decision.
