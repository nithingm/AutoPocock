# Agentic Repo Template

This context defines the operating language for a repository template that helps a single engineer run an AI-assisted engineering workflow, with room to add autonomous execution later.

## Language

**Solo Operator**:
The primary human user who configures and runs the workflow inside a project.
_Avoid_: User, developer, engineer

**Agent Runtime**:
A later-stage execution layer that performs bounded work inside the workflow without owning product intent.
_Avoid_: User, engineer, autonomous system

**Workflow Artifact**:
A durable file that captures intent, decomposition, review, or follow-up work for the workflow.
_Avoid_: Output, doc, note

**Guided Flow**:
An opinionated command-driven path that walks the **Solo Operator** through the workflow with minimal repo knowledge.
_Avoid_: Wizard, automation

**Manual Mode**:
Direct use of the underlying **Workflow Artifacts** without going through a guided command path.
_Avoid_: Advanced mode, raw mode

**Umbrella CLI**:
The primary command surface that exposes the **Guided Flow** through a single entrypoint with staged subcommands.
_Avoid_: Script bundle, command set

**Initialization Boundary**:
The line between provisioning the workflow system and allowing any agentic execution to begin.
_Avoid_: Bootstrap, startup

**Worker Handoff**:
The point where bounded work is packaged clearly enough for an **Agent Runtime** to execute without owning product intent.
_Avoid_: Delegation, autonomy

**Tracer Bullet**:
A deliberately small vertical slice used to validate that the workflow, tracker, and handoff model all work end-to-end before scaling up.
_Avoid_: Prototype, spike

**Feature Track**:
A PRD-scoped stream of tracer bullets and implementation slices.
_Avoid_: Epic, project

**HITL Task**:
Work that remains intentionally owned by the **Solo Operator** because it is not safe or clear enough for AFK execution.
_Avoid_: Manual task, human step

**Credential Boundary**:
The line that keeps secrets, privileged accounts, and external authorization under **Solo Operator** control.
_Avoid_: Secret handling, access setup

**Prepared Human Step**:
A minimal, explicit instruction set that tells the **Solo Operator** exactly what to do when a task crosses a human-only boundary.
_Avoid_: Manual note, TODO

**Operational Tracker**:
The system of record for live issue state, ownership, prioritization, and workflow movement.
_Avoid_: Backlog, board

**Tracker Bootstrap**:
An idempotent setup check that verifies or creates the **Operational Tracker** objects needed by the workflow.
_Avoid_: Migration, sync

**Tracker Drift**:
A mismatch between expected workflow configuration and existing **Operational Tracker** objects.
_Avoid_: Error, invalid state

**Artifact Layer**:
The in-repo markdown layer that stores durable workflow context that does not belong only in the **Operational Tracker**.
_Avoid_: Docs, notes

**Durable Memory**:
Approved project language, decisions, and workflow rules that influence future agent behavior.
_Avoid_: Notes, cache

**Triage Role**:
A canonical Matt Pocock skill label that describes issue category or readiness, independent of execution stage.
_Avoid_: Column, status

**Execution Stage**:
A project-board field value that describes where work is in the delivery loop after triage semantics are applied.
_Avoid_: Label, triage state

**Execution Lane**:
A logical grouping of multiple **Execution Stages** used to optimize board scanning, parallel pickup, and ownership decisions.
_Avoid_: Status, label

**Concurrency Scheduler**:
The policy layer that decides how many AFK tasks may run at once based on risk, capacity, and review constraints.
_Avoid_: Queue, runner

**Scheduler Plan**:
A dry-run dispatch and stage-movement proposal produced before mutating the **Operational Tracker** or calling subagents.
_Avoid_: Dispatch, execution

**Dispatch Artifact**:
A scheduler-approved work package that a future runner or **Agent Runtime** can consume to start isolated execution.
_Avoid_: Agent invocation, job

**Dispatch Claim**:
A runner's reservation of a **Dispatch Artifact** with identity, timestamp, and **Isolation Mode**.
_Avoid_: Assignment, lock

**Manual Dispatch**:
A **Solo Operator** override that creates a **Dispatch Artifact** outside the normal scheduler-created path.
_Avoid_: Bypass, direct run

**Review Capacity**:
The Solo Operator's available budget for reviewing AFK completions during a scheduler run.
_Avoid_: Agent capacity, throughput

**Conflict Surface**:
A manually declared estimate of how likely a task is to overlap with other active work.
_Avoid_: Conflict prediction, touched files

**Subagent**:
An isolated worker agent given one bounded task and the context needed to complete it.
_Avoid_: Agent, worker

**Isolation Mode**:
The execution boundary used to keep subagent changes separate from the main working tree.
_Avoid_: Sandbox, environment

**Context Handoff**:
A compact, explicit brief that transfers enough product, code, issue, and verification context for a **Subagent** to work without guessing.
_Avoid_: Prompt, summary

**Slice Size Gate**:
The rule that one issue must fit in one **Context Handoff** and one **Review Capacity** unit unless explicitly classified as higher risk.
_Avoid_: Story points, estimate

**Handoff Artifact**:
A persisted **Context Handoff** stored in the **Artifact Layer** and mirrored to the **Operational Tracker**.
_Avoid_: Agent prompt, task note

**Completion Report**:
A short structured report from a **Subagent** that records result, changes, verification, risks, follow-ups, artifacts, and suggested next stage.
_Avoid_: Summary, final message

**Review Entry Gate**:
The checklist a **Subagent** must satisfy before work can move to `Human Review`.
_Avoid_: Done checklist, review notes

**Review Prep**:
A non-authoritative artifact that summarizes an AFK change for faster **Solo Operator** review.
_Avoid_: Approval, review decision

**QA Gate**:
The verification step after **Human Review** that confirms the work behaves correctly before it reaches `Done`.
_Avoid_: Review, final check

**Targeted QA**:
A QA checklist generated from issue, PR, handoff, completion, review, and acceptance context.
_Avoid_: Generic QA, smoke test

**Merge Authority**:
The permission to merge completed work into the main branch after review and QA.
_Avoid_: Commit permission, PR ownership

**Fix Attempt**:
A bounded automated pass to repair a failed AFK PR after verification or CI failure.
_Avoid_: Retry, rerun

**Same-PR Fix**:
A small pre-merge correction that does not change acceptance criteria, architecture, or product intent.
_Avoid_: Bug issue, follow-up

**Local Refactor**:
A small code improvement directly required to complete or verify the current slice.
_Avoid_: Cleanup, architecture work

**Dependency Change**:
Adding, removing, or upgrading a package, service dependency, or runtime dependency.
_Avoid_: Install, update

## Relationships

- A **Solo Operator** creates and reviews **Workflow Artifacts**
- A **Guided Flow** creates or updates **Workflow Artifacts** on behalf of a **Solo Operator**
- The **Umbrella CLI** is the preferred entrypoint to the **Guided Flow**
- A **Solo Operator** can bypass the **Guided Flow** by using **Manual Mode**
- The **Initialization Boundary** ends with the system fully configured but not executing
- The **Operational Tracker** holds live issue state and ownership
- A **Tracker Bootstrap** defaults to dry-run and mutates the **Operational Tracker** only when explicitly applied
- A **Tracker Bootstrap** reports **Tracker Drift** instead of renaming, deleting, or reshaping existing tracker objects
- Initial **Tracker Bootstrap** creates missing labels and verifies templates, but reports project fields/views instead of creating GitHub Projects
- Initial GitHub integration uses the `gh` CLI and does not handle tokens inside the repo
- GitHub project references live in config and may be overridden per CLI run
- The **Artifact Layer** holds rich context and durable workflow history
- **Durable Memory** changes require **Solo Operator** approval
- **Triage Roles** are represented as labels
- **Execution Stages** are represented through project status or fields
- **Execution Lanes** group multiple **Execution Stages** for operational views without replacing the canonical stage values
- The **Concurrency Scheduler** controls AFK pickup from handoff-ready work
- The **Concurrency Scheduler** produces a **Scheduler Plan** by default
- A **Scheduler Plan** is stored in the **Artifact Layer** by default
- Scheduler tracker mutations require `--apply`
- Initial `--dispatch` behavior creates **Dispatch Artifacts** instead of spawning subagents directly
- **Dispatch Artifacts** are stored as canonical JSON plus a readable markdown mirror
- A runner must create a **Dispatch Claim** before executing a **Dispatch Artifact**
- Stale **Dispatch Claims** return to `queued` only with **Solo Operator** approval or a future timeout policy
- **Manual Dispatch** is allowed only when audited with source, override reason, risk, conflict surface, queue class, and feature track
- **Manual Dispatch** cannot bypass handoff, credential, merge, memory, or QA gates
- Provider-specific subagent execution belongs in the runner layer
- **Review Capacity** is stored as a default in config and can be overridden per scheduler run
- **Conflict Surface** is manually declared first, with optional CLI estimation later
- `Bug Loop` work consumes **Review Capacity** before new AFK dispatch
- The **Concurrency Scheduler** may call **Subagents** when capacity, risk, dependencies, and conflict surface allow it
- Branch-only **Isolation Mode** is acceptable for the current stub
- Worktree-first **Isolation Mode** becomes the default once the **Concurrency Scheduler** exists
- Docker isolation is required before high-concurrency AFK execution
- A **Subagent** receives a **Context Handoff** before starting work
- The **Slice Size Gate** prevents oversized work from entering AFK execution
- A **Subagent** that discovers oversized work reports `blocked: needs slicing` instead of continuing
- The **Review Entry Gate** must pass before AFK work moves to `Human Review`
- A **Context Handoff** is stored as a **Handoff Artifact** and mirrored into the **Operational Tracker**
- A **Subagent** returns a **Completion Report** before the workflow advances
- A **Completion Report** is stored in the **Artifact Layer** and mirrored into the **Operational Tracker**
- **Human Review** starts with **Review Prep**, but approval remains with the **Solo Operator**
- **Review Prep** is generated when the **Review Entry Gate** passes and work moves to `Human Review`
- Approved **Human Review** moves work to the **QA Gate**, not directly to `Done`
- `Done` means merged or intentionally closed after the **QA Gate**
- GitHub-backed AFK work uses **Targeted QA** as the primary QA path
- **Targeted QA** is strict for AFK workflow and permissive only in **Manual Mode**
- QA defects may be handled as a **Same-PR Fix** only before merge and only when acceptance criteria, architecture, and product intent do not change
- The **Solo Operator** approves or rejects **Same-PR Fix** classification
- AFK work may include a **Local Refactor** only when it is necessary for the current slice
- Broad cleanup, architecture work, dependency upgrades, and unrelated formatting become separate issues
- A **Dependency Change** requires explicit issue scope or HITL approval
- **Merge Authority** belongs to the **Solo Operator** by default
- A **Subagent** may create commits, push a branch, open or update a PR, and request review, but may not merge by default
- A failed AFK PR enters `Bug Loop` and receives at most one automated **Fix Attempt** by default
- A failed **Fix Attempt** becomes HITL work
- An **Agent Runtime** may generate or update **Workflow Artifacts** under the **Solo Operator**'s direction
- A **Solo Operator** owns product intent; an **Agent Runtime** does not
- A **Worker Handoff** depends on sufficiently clear **Workflow Artifacts**
- **Tracer Bullets** are created after PRDs and issue decomposition, before broader AFK execution is trusted
- A **Tracer Bullet** gates routine AFK work within its **Feature Track**
- A task that fails the strict **Worker Handoff** gate remains a **HITL Task**
- Tasks crossing the **Credential Boundary** are HITL by default
- Subagents should automate everything around a **Credential Boundary** and leave the **Solo Operator** with **Prepared Human Steps**
- A **HITL Task** blocks only work that declares it as a dependency, except when it blocks the **Tracer Bullet** for a **Feature Track**

## Example dialogue

> **Dev:** "Should the **Agent Runtime** decide what feature to build next?"
> **Domain expert:** "No. The **Solo Operator** owns prioritization and intent; the **Agent Runtime** only executes bounded work."

> **Dev:** "Do I have to use the **Guided Flow** every time?"
> **Domain expert:** "No. The **Guided Flow** is for speed and consistency; **Manual Mode** stays available whenever you want direct control."

> **Dev:** "Why keep separate commands if there is an **Umbrella CLI**?"
> **Domain expert:** "Because the **Umbrella CLI** is the recommended path, but **Manual Mode** still needs stable low-level commands."

> **Dev:** "Where does issue status really live?"
> **Domain expert:** "In the **Operational Tracker**. The **Artifact Layer** supports it, but does not replace it."

> **Dev:** "Should GitHub setup mutate the repo immediately?"
> **Domain expert:** "No. **Tracker Bootstrap** reports by default and mutates GitHub only with an explicit apply flag."

> **Dev:** "What if GitHub already has a similar label or field?"
> **Domain expert:** "That is **Tracker Drift**. Report it clearly; do not rename or delete existing tracker objects automatically."

> **Dev:** "Should GitHub setup create the Project board?"
> **Domain expert:** "Not initially. **Tracker Bootstrap** should report required project fields and views, while project creation remains a later explicit capability."

> **Dev:** "How should GitHub integration start?"
> **Domain expert:** "Use the `gh` CLI first. It is inspectable, standard for GitHub issue and PR workflows, and avoids custom token handling."

> **Dev:** "Where does the GitHub Project reference live?"
> **Domain expert:** "In config, with CLI overrides for one-off runs."

> **Dev:** "Can a subagent update memory by itself?"
> **Domain expert:** "No. A subagent may propose **Durable Memory** changes, but the **Solo Operator** approves them."

> **Dev:** "What should `init` do?"
> **Domain expert:** "Everything needed to configure the workflow should be ready after `init`, but no worker or automation should run until the **Tracer Bullets** are defined."

> **Dev:** "What if an issue is not AFK-ready?"
> **Domain expert:** "Then it is a **HITL Task**. It should stay visibly owned by the **Solo Operator**, not drift into an AFK queue."

> **Dev:** "What if a task needs credentials?"
> **Domain expert:** "The **Credential Boundary** stays HITL, but subagents should prepare exact **Prepared Human Steps** and automate everything else."

> **Dev:** "Does one HITL task freeze the whole feature?"
> **Domain expert:** "No. A **HITL Task** blocks only dependent work, unless it blocks the **Feature Track** tracer bullet."

> **Dev:** "Does one tracer bullet block the whole repo?"
> **Domain expert:** "No. A **Tracer Bullet** gates routine AFK work only inside its **Feature Track**."

> **Dev:** "Should the board columns match Matt's triage labels?"
> **Domain expert:** "No. **Triage Roles** stay as labels for skill compatibility, while **Execution Stages** model delivery flow on the board."

> **Dev:** "Can we combine stages to maximize parallelization?"
> **Domain expert:** "Yes. Keep the **Execution Stages** canonical, but group them into **Execution Lanes** for pickup and flow management."

> **Dev:** "Should every AFK-ready issue run immediately?"
> **Domain expert:** "No. The **Concurrency Scheduler** should limit AFK execution based on risk, available review capacity, and integration pressure."

> **Dev:** "Should the scheduler change GitHub by default?"
> **Domain expert:** "No. It produces a **Scheduler Plan** by default; `--apply` mutates tracker state and `--dispatch` calls subagents."

> **Dev:** "Should scheduler output be saved?"
> **Domain expert:** "Yes. A **Scheduler Plan** is an operational decision artifact and should be stored for auditability."

> **Dev:** "Should dispatch spawn agents immediately?"
> **Domain expert:** "No. Initial dispatch creates **Dispatch Artifacts** that a future runner or **Agent Runtime** consumes."

> **Dev:** "Should dispatch be JSON or markdown?"
> **Domain expert:** "Both. JSON is canonical for runners; markdown is the readable mirror for the **Solo Operator**."

> **Dev:** "Who can claim dispatch work?"
> **Domain expert:** "Only a runner that records a **Dispatch Claim** with `claimed_by`, `claimed_at`, and **Isolation Mode**."

> **Dev:** "Can the Solo Operator dispatch manually?"
> **Domain expert:** "Yes, as **Manual Dispatch**. It is audited and cannot bypass the normal workflow gates."

> **Dev:** "Whose capacity controls AFK dispatch?"
> **Domain expert:** "The **Solo Operator**'s **Review Capacity**, because unreviewed completions become the bottleneck."

> **Dev:** "Can the scheduler infer conflicts?"
> **Domain expert:** "Not as the first source of truth. **Conflict Surface** is manually declared first; CLI estimates may become advisory later."

> **Dev:** "What does the scheduler give a subagent?"
> **Domain expert:** "A **Context Handoff**: the issue, constraints, relevant artifacts, expected edits, verification path, and reporting requirements."

> **Dev:** "Where should subagents work?"
> **Domain expert:** "Branch-only is acceptable for the current stub; once scheduling exists, default to worktree-first **Isolation Mode**, then add Docker before high concurrency."

> **Dev:** "How large can an AFK issue be?"
> **Domain expert:** "It must pass the **Slice Size Gate**: one **Context Handoff**, one review session, and one independently verifiable outcome."

> **Dev:** "When is AFK work ready for review?"
> **Domain expert:** "Only after the **Review Entry Gate** passes: criteria addressed, checks run or explained, report written, risks declared, and no hidden failures."

> **Dev:** "Can Human Review be automated?"
> **Domain expert:** "**Review Prep** can be automated, but approval, same-PR fix decisions, memory updates, and merge remain **Solo Operator** decisions."

> **Dev:** "When should Review Prep be created?"
> **Domain expert:** "Create **Review Prep** as part of moving work into `Human Review`, after the **Review Entry Gate** passes."

> **Dev:** "Does review approval mean done?"
> **Domain expert:** "No. Approved **Human Review** moves to the **QA Gate**. `Done` comes after QA and merge or intentional closure."

> **Dev:** "Is QA generic or issue-specific?"
> **Domain expert:** "GitHub-backed AFK work uses **Targeted QA** from issue, PR, handoff, completion, review, and acceptance context; generic QA remains available for Manual Mode."

> **Dev:** "Should targeted QA continue if context is missing?"
> **Domain expert:** "Not for AFK work. **Targeted QA** is strict there; missing handoff or completion context is a workflow failure."

> **Dev:** "Where should a handoff live?"
> **Domain expert:** "Both places. The **Handoff Artifact** belongs in the **Artifact Layer**, and the same brief should be mirrored to the **Operational Tracker** for execution visibility."

> **Dev:** "What does a subagent return?"
> **Domain expert:** "A **Completion Report** with result, changed areas, verification, residual risks, follow-ups, updated artifacts, and suggested next stage."

> **Dev:** "Should QA defects always become new issues?"
> **Domain expert:** "No. A **Same-PR Fix** is allowed before merge when it does not change acceptance criteria, architecture, or product intent; everything larger becomes a tracked bug issue."

> **Dev:** "Can a subagent decide a QA defect is a same-PR fix?"
> **Domain expert:** "No. A subagent may recommend a **Same-PR Fix**, but the **Solo Operator** owns that scope decision."

> **Dev:** "Can an AFK task include refactoring?"
> **Domain expert:** "Only a **Local Refactor** needed for the current slice. Broader cleanup becomes separate work."

> **Dev:** "Can an agent add or upgrade dependencies while implementing?"
> **Domain expert:** "Only if the **Dependency Change** is explicitly in scope or approved through HITL."

> **Dev:** "Can AFK work merge itself?"
> **Domain expert:** "No. **Merge Authority** belongs to the **Solo Operator** by default; subagents can prepare PRs, not merge them."

> **Dev:** "How many times can an agent retry a failed PR?"
> **Domain expert:** "One automated **Fix Attempt** by default. After that, the work becomes HITL."

## Flagged ambiguities

- "user" was used to mean both the **Solo Operator** and a possible future **Agent Runtime**; resolved: the **Solo Operator** is the primary user of this template today
- "do it manually" and "use a command" were both treated as implementation details; resolved: these are separate concepts, **Manual Mode** and **Guided Flow**
- "issues" and "docs" were both acting like the source of truth; resolved: the **Operational Tracker** is canonical for live state, while the **Artifact Layer** stores rich supporting context
- "CLI" was ambiguous between the preferred UX and the raw building blocks; resolved: the **Umbrella CLI** is the preferred UX, while low-level commands remain available for **Manual Mode**
- "full setup" risked implying autonomous execution; resolved: the **Initialization Boundary** includes worker and automation setup, but execution starts only after PRDs, issues, and **Tracer Bullets** exist
- "GitHub setup" risked hidden mutation; resolved: **Tracker Bootstrap** is dry-run by default and requires an explicit apply flag for GitHub changes
- "conflicting GitHub setup" risked destructive cleanup; resolved: existing-object mismatches are **Tracker Drift** and require Solo Operator action
- "GitHub Project creation" risked brittle permission-sensitive setup; resolved: initial **Tracker Bootstrap** reports project schema instead of creating the Project
- "GitHub API integration" risked custom token handling too early; resolved: initial integration uses the `gh` CLI
- "memory update" risked uncontrolled self-modifying workflow; resolved: **Durable Memory** changes require **Solo Operator** approval
- "tracer bullet gate" risked blocking unrelated work globally; resolved: **Tracer Bullets** gate routine AFK work per **Feature Track**
- "not AFK-ready yet" risked becoming an invisible limbo state; resolved: such work is explicitly a **HITL Task**
- "secret handling" risked either blocking automation or leaking authority; resolved: the **Credential Boundary** is HITL, while agents create **Prepared Human Steps** and automate the surrounding work
- "HITL blocker" risked freezing unrelated AFK work; resolved: HITL blocking is dependency-scoped unless it blocks a **Feature Track** tracer bullet
- "triage state" and "board stage" risked being conflated; resolved: **Triage Roles** are labels, and **Execution Stages** are project-board fields
- "board grouping" risked overwriting actual workflow state; resolved: **Execution Lanes** are operational groupings layered on top of canonical **Execution Stages**
- "parallelize everything" risked turning the AFK queue into uncontrolled merge pressure; resolved: a **Concurrency Scheduler** limits pickup by risk and capacity
- "scheduler run" risked hidden tracker mutation or subagent dispatch; resolved: it creates a **Scheduler Plan** by default, with `--apply` and `--dispatch` as explicit permissions
- "scheduler output" risked being ephemeral; resolved: each **Scheduler Plan** is stored in the **Artifact Layer**
- "dispatch" risked coupling the CLI to one agent provider; resolved: initial dispatch creates **Dispatch Artifacts**, while provider-specific execution belongs in the runner layer
- "dispatch artifact format" risked choosing between machines and humans; resolved: store canonical JSON plus a readable markdown mirror
- "dispatch pickup" risked untracked execution; resolved: runners must create a **Dispatch Claim** before starting work
- "manual dispatch" risked becoming a bypass; resolved: **Manual Dispatch** is allowed only as an audited **Solo Operator** override
- "capacity" risked being interpreted as agent throughput; resolved: **Review Capacity** belongs to the **Solo Operator**
- "conflict prediction" risked false confidence; resolved: **Conflict Surface** is manually declared first, with optional advisory estimates later
- "calling subagents" risked meaning unbounded autonomy; resolved: **Subagents** receive bounded **Context Handoffs** from the **Concurrency Scheduler**
- "subagent isolation" risked forcing Docker too early; resolved: branch-only is acceptable for the current stub, worktree-first comes with the scheduler, and Docker gates high concurrency
- "issue size" risked being measured by fake precision; resolved: the **Slice Size Gate** is qualitative and based on handoff, review, and verification fit
- "ready for review" risked meaning only that code was written; resolved: AFK work must pass the **Review Entry Gate**
- "automated review" risked implying automated approval; resolved: **Review Prep** accelerates review but does not approve work
- "review prep timing" risked becoming a manual afterthought; resolved: **Review Prep** is generated when work enters `Human Review`
- "approved review" risked skipping verification; resolved: approved **Human Review** moves to the **QA Gate**, not `Done`
- "QA checklist" risked staying generic; resolved: **Targeted QA** is primary for GitHub-backed AFK work
- "targeted QA" risked tolerating missing context; resolved: **Targeted QA** is strict for AFK workflow and permissive only in **Manual Mode**
- "handoff location" was ambiguous between repo memory and issue comments; resolved: a **Handoff Artifact** is stored in both the **Artifact Layer** and the **Operational Tracker**
- "agent done" was ambiguous; resolved: a **Subagent** is done only after producing a **Completion Report**
- "QA defect" risked always creating process overhead; resolved: use a **Same-PR Fix** for small pre-merge corrections, and create bug issues for scope or intent changes
- "same-PR fix authority" risked being delegated to subagents; resolved: the **Solo Operator** approves or rejects that classification
- "refactor while here" risked scope creep; resolved: AFK work may include only necessary **Local Refactors**
- "dependency update" risked incidental risk expansion; resolved: a **Dependency Change** requires explicit scope or HITL approval
- "AFK completion" risked implying auto-merge; resolved: **Merge Authority** stays with the **Solo Operator** by default
- "retry loop" risked hiding failure behind repeated attempts; resolved: a failed AFK PR gets at most one automated **Fix Attempt** by default
