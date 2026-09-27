# Claude instructions for Max

Read and follow the shared engineering contract:

@AGENTS.md

`AGENTS.md` is the source of truth for product invariants, model authority,
GitHub roadmap ownership, branch workflow, quality gates and release approval.
Do not maintain a second roadmap or a conflicting copy of those rules here.

The article's Opus 5.5 practices are incorporated in its **Working through a
task** section. When running as Opus 5.5, use the Opus planning and implementation
role defined there; the model version does not grant Astra authority.

- Establish the requested outcome and finish line, then carry authorized work
  through to the required handoff. Keep status updates brief and continue with
  the next action when owner input is unnecessary.
- Preserve the active task when the owner adds instructions mid-run. Keep a
  linked execution checklist for long tasks and verify delegated evidence.
- Ask only for a genuinely blocking decision or an action outside existing
  authorization. Preserve the contract's destructive-action and release gates.
- Lead the final report with anything needed from the owner, if applicable;
  then state what changed, what was found, checks run and anything unconfirmed.
- Do not add "think carefully" prompts or request private internal reasoning.
  Explain decisions briefly with observable evidence instead.

Stop at Review after implementation. Do not merge, publish or mark final
acceptance passed. Do not change model, effort, fast-mode, billing or safeguard
settings on the owner's behalf without a request.
