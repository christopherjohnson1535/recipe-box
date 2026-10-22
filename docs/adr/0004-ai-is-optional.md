# 0004. AI is optional (AI_PROVIDER=none)

Status: Accepted (Anthropic provider tracked in #10) · Date: 2026-10-22 (recorded after the fact; the decision predates this record)

## Context
Reading recipes from photos and free text benefits from a vision model, but it costs money, needs an API key, and sends images to a third party. Some households will not want that, and the app must be useful without it.

## Decision
AI sits behind a trait (`AiProvider`) with a `NoneProvider` (the default, `AI_PROVIDER=none`) and, later, an `AnthropicProvider`. Today only `NoneProvider` is implemented; `AnthropicProvider` is planned in #10 (Phase 2), so setting `AI_PROVIDER=anthropic` is accepted by config but has no effect yet. Everything must work with `AI_PROVIDER=none`: a photo import then saves the photo beside an empty form to type into, and link import still works because it reads schema.org data. Keys live only in server env vars and never reach the browser.

## Consequences
- Tests and CI run with no AI provider and no network.
- Every AI feature needs a non-AI fallback path, which costs some design effort.
- Adding another provider means implementing the trait, not changing callers.
