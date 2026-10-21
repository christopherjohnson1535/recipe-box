# FINAL test: household members (#8)

Built app at http://127.0.0.1:3000, real API. Script: /tmp/claude-0/e2e.py, /tmp/claude-0/shots.py. smoke's password never changed. testmember and testadmin removed at the end (users left: smoke).

## E2E
| Step | Result | Evidence |
|---|---|---|
| Admin /settings shows My account, Household, AI import | PASS | h2s listed |
| Add testmember (member) and testadmin (admin) | PASS | both listed |
| Duplicate username, different case, via UI ("TestMember") | PASS* | client says "Use 3-40 characters: lowercase..." (uppercase rejected before the server); server-side duplicate checked with lowercase via UI: "That username is taken. Pick another." under Username; API with "TESTMEMBER" -> 409 conflict |
| Reset testmember password | PASS | notice "password was changed and they were signed out" |
| Member /settings: no Household | PASS | h2: My account, AI import |
| Member GET /api/users | PASS | 403 |
| Member PUT /api/users/<smoke>/password | PASS | 403 |
| Own password, wrong current | PASS | field error "That isn't your current password." |
| Own password, correct | PASS | "Password changed" |
| Changing context still signed in; earlier third context signed out | PASS | 200 vs 401 on /api/auth/me |
| Self-remove | PASS | Remove disabled, note "You can't remove yourself." |
| Remove testmember with confirmation naming them | PASS | "Remove testmember from the household? ..."; row gone |
| Removed member's context signed out | PASS | 401 |
| Recipe created by member before removal still exists | PASS | GET 200 |
| Stale session (testadmin removed) own-password form | PASS | "You've been signed out" + Sign in link |
| Remove testadmin | PASS | 204 |
| No password in any URL | PASS | 231 requests checked |

## WARN lines
- No scrollY-on-load and no horizontal overflow at any size/scheme (admin and member /settings).
- WARN touch targets < 44 px at 390 px: inline link "AI Photo Import" 113x16 (inline text link); radio inputs 20x20 (visual control only; label row not measured). Buttons (Reset password, Remove, Change password, Add member) all >= 44 px.

## Screenshots (shots/settings/)
`{light,dark}-{admin,member,remove-confirm,field-error}-{phone,ipad,ipadland,desktop}.png`. Viewed: light iPad and phone (admin, member, confirm, error), dark desktop admin. Editorial style matches docs/UI.md: kicker, Caslon headline, italic deck, ruled section headings, uppercase labels, one red accent, dark theme consistent.

## Problems
- P0: none.
- P1: none.
- P2-1: radio inputs 20x20 and the inline "AI Photo Import" link 16 px tall are below the 44 px target (verify the radio label is the hit area). Screenshot light-admin-phone.png. Likely `frontend/src/components/ui/ChoiceGroup*`, `ExternalLink`.
- P2-2: duplicate-username test with an uppercase letter gives the format message, not "taken" (acceptable; client validates first).
- P2-3: "Add member" turns red after an error (probably hover/focus state under the pointer) in light-field-error-ipad.png; looks like a danger state. Likely the Button primary hover token in `frontend/src/styles/components.css`.
- P2-4: the "Remove" ghost button on the self row is low contrast grey (disabled, with the reason beneath), light-admin-phone.png. Intentional.
