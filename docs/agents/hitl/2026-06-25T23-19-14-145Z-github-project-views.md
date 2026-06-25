# Prepared Human Step: GitHub Project Views

Generated: 2026-06-25T23:19:14.145Z
Project: https://github.com/users/nithingm/projects/1

## API Status

- View mutations available: no
- Reason: GitHub CLI/GraphQL expose ProjectV2 project, item, and field mutations, but not ProjectV2 view create/update/rename mutations.

## Summary

- Recommended views: 6
- Inspection available: yes
- Present: 5
- Missing: 0
- Drift: 1

## Manual Actions

- Rename Project view #5:  Validation -> Validation.

## Verification

- Command: `pnpm ops github:init`
- Expected: Project View Inspection reports all recommended views as present and no Project View Drift entries remain.

## Workarounds

- template_project_copy (candidate): For fresh setups, maintain a template Project with the desired views and empirically verify whether GitHub's Project copy flow preserves those views before using it as the bootstrap path.
- browser_ui_automation (last_resort): A one-off browser automation helper can drive the GitHub UI, but it should stay outside core automation because Project view UI selectors and flows are not stable contracts.
