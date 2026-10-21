# Plan 8 frontend: /settings
1. api.ts: setPassword(userId, password, currentPassword?).
2. New ui: Panel (paper-deep block), ConfirmInline (names the person, focuses Cancel), MemberList/MemberItem (hairline rows). Existing tokens only.
3. components/settings: PasswordForm (own: current+new+confirm; admin reset: new+confirm), AccountSection, AddMemberForm,
   HouseholdSection (list, reset panel, remove confirm, last-admin/self reasons), AiImportSection.
4. settings/page.tsx server-loads me, users (admin only), capabilities (null on failure).
5. Focus: add -> back to first add field; remove -> Household heading; reset done -> Reset button. Status via Alert.
6. Tests: HouseholdSection (add, 409, remove confirm, self, last admin, member hidden), PasswordForm (mismatch, short, wrong current).
7. Docs: UI.md, wiki Household-Members.md + sidebar. Checks: lint, tsc, vitest, build.
