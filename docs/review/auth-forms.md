# Review R1 (auth): issue #29, auth forms POST natively

Verdict: fix is correct and minimal. Credentials no longer reach a URL on a pre-hydration submit. 0 Must, 2 Should, 3 Nice.
vitest: 213 passed. Browser check (JS off) done by the orchestrator.

## Checked, no finding
- Credential leakage: password only travels in the JSON body of `api.login` / `api.setup` or in the native POST body. The `next` param only ever carries a path+search set by `src/proxy.ts`, never credentials. No GET fallback remains; no prefetch of a form submit exists.
- Native POST to a Next page route: `/login` and `/setup` are in `PUBLIC_PATHS`, the page only reads `searchParams` and `setupStatus()`, so the POST has no side effect (body ignored, nothing signed in or created), so no CSRF surface; POST responses are not cached. Next does not log request bodies.
- Design-system guard: no className/style added outside `ui`; test file adds no classes. OK.
- Other password forms: only these two exist in `src` today (#8, #26 not built yet).

## Findings

### A-01 Should: `action="/login"` drops the `?next=` query
`frontend/src/app/(auth)/login/LoginForm.tsx:38`. Failing case: signed-out user opens `/recipes/12`, proxy sends them to `/login?next=%2Frecipes%2F12`, they submit before hydration, the POST goes to bare `/login`, the page reloads without `next`, and after the retry they land on `/` instead of the recipe.
Smallest fix: omit `action` (a form with no action posts to the current URL, query included) in both forms, and change the test to assert `getAttribute("action")` is null / the form has `method=post`. Nice alternative: keep it and accept the loss.

### A-02 Should: guard regex false positives and false negatives
`frontend/src/app/(auth)/auth-forms.test.tsx:23-26`.
- False positive: `<form onSubmit={(e) => go(e)} method="post">` is reported as a violation, because `[^>]*` stops at the `=>`. A future compliant form fails the test for the wrong reason. Same for `method={"post"}`.
- False positive: a file with one post password form plus a second unrelated form (search) is flagged.
- False negative: `type={show ? "text" : "password"}`, `type={"password"}`, and a password input in a child component (`<PasswordField/>`) in a different file than its `<form>`; the file-level check cannot see across files.
Smallest fix: (a) match `type=\{?\s*["']password["']` and `\bpassword\b` inside a `type={…}` expression; (b) match method with `/method=\{?\s*["']post["']/i` and capture the tag with a regex that tolerates `=>` (e.g. `/<form\b(?:[^>]|=>)*>/`); (c) also flag any non-`ui` file that renders a `<form` while a `ui` password component exists, or simply document that password inputs must be written inline in the form file. Do (a) and (b); (c) is a comment.

### A-03 Nice: silent reload on a no-JS or pre-hydration submit
`LoginForm.tsx:38`, `SetupForm.tsx:40`. The page reloads with empty fields and no message. A reload is fine because the user just retypes once the page has loaded; the app is unusable without JS anyway. A `<noscript>` note would need an `Alert` in the page and adds markup for a rare case. Skip unless the owner reports confusion.

### A-04 Nice: setup form's native POST is a no-op that clears the owner's input
`SetupForm.tsx:40`. Same as A-03, but on first-run setup the user loses four fields. Acceptable; no fix needed.

### A-05 Nice: test over-built
`auth-forms.test.tsx:21` `export function passwordFormViolation` exports from a test file, and the scanner has its own test. Drop `export`; keep the scanner test (it is the only protection against the regex rotting).
