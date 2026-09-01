# ADR-016 — Provider health signals, and how adapters are verified without credentials

Status: **Accepted** · 2026-08-28 · Supersedes nothing · Refines [ADR-013](ADR-013-backend-stack-and-no-redis.md)

## Context

Phase 3 set out to verify NexusAI against real model providers. No credentials
exist in this environment, so the real question became: how much of the provider
integration can be *genuinely* verified without one, and what must stay marked
unverified?

Two defects surfaced while answering that, both invisible to the existing tests.

**A rejected credential never reached provider health.** `recordFailure` was
gated on `affectsHealth`, which callers derive from `error.retryable`. An auth
failure is not retryable, so the gate was always closed and `authFailed` could
never be set. The `CONFIGURED_BUT_UNAVAILABLE` state — and the message "The
configured credentials were rejected" — was unreachable code for every provider.
A deployment with a wrong key would have kept advertising the model as
selectable and kept calling the provider on every turn, with nothing reporting
the cause.

The unit test covering this passed `affectsHealth: true`, a combination the
orchestrator never produces. It tested the tracker in isolation and confirmed
behaviour that could not occur.

**Google reports a rejected key as HTTP 400, not 401.** Verified against the
live endpoint: `INVALID_ARGUMENT` with `reason: API_KEY_INVALID`. It classified
as a non-retryable request error, so even after the gate was fixed, Gemini
specifically would still never have been marked as having bad credentials.

## Decision

**1. An auth failure always records, regardless of `affectsHealth`.** The two
questions are different: `affectsHealth` asks whether a failure looks transient;
a rejected credential is the least transient failure there is. It is now handled
before that gate.

**2. A rejected credential is believed for 15 minutes, not forever.** Once a
provider is marked unavailable it is no longer routable, so no call is made, so
no success can clear the flag — the provider would be dead until the process
restarted. Keys get rotated, un-revoked and unsuspended without anyone
restarting NexusAI, and providers do return spurious 401s during incidents. The
circuit breaker already had the right shape for this; auth now uses it too, with
a much longer cooldown because retrying a genuinely wrong key is pure noise.

**3. Credential-rejection detection is by body marker as well as status.** A
narrow pattern, so a prompt that merely mentions API keys is not misread.

**4. Provider credentials travel in headers, never in a URL.** Google's API
accepts `?key=`, which puts the credential into every proxy access log, request
line and error string between here and the service. It accepts `x-goog-api-key`
instead, verified against the live endpoint, and that is what is used.

**5. Adapters are verified in two credential-free ways, and the remaining gap is
named precisely.** Against a local server speaking each provider's dialect
(request shaping, header placement, response and usage parsing, SSE reassembly
across chunk boundaries), and against the live endpoints with a deliberately
invalid key (reachability and auth classification, all six providers). What
stays unverified is exactly one thing: a successful generation.

## Consequences

- The honest availability states the frontend already renders are now reachable.
- A misconfigured deployment surfaces its own cause instead of failing silently.
- `tests/manual/provider-live.test.ts` is inert in CI and becomes a real
  generation test the moment a key is present — closing the last gap is one
  command, not new work.
- Base URLs became injectable, which incidentally supports gateways and proxies.
  That is a side effect, not the motivation, and no configuration surface was
  added for it.

## Alternatives rejected

**Treat auth failures as permanent.** Simpler, and defensible for a wrong key —
but it turns one spurious 401 into an outage lasting until someone notices.

**Add a background health prober.** Would clear stale auth state without waiting
for real traffic, at the cost of spending money on synthetic calls and inventing
availability signals from traffic no user asked for. Real traffic remains the
only probe (ADR-013).

**Mock `fetch` to test the adapters.** Would assert that the code calls the
functions it calls. A real socket and a real wire format catch the things that
actually break: header placement, chunk boundaries, framing.
