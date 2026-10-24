# Household members

Everyone in the household signs in with their own username and password and shares one recipe box. There is no public sign-up: the first account is created at setup, and an admin adds everyone else.

## What an admin can do
- See all members, add a member (username, display name, password, role `admin` or `member`), and remove a member.
- Reset another member's password without knowing the old one. That member is signed out on all devices.
- Both roles can add, edit and delete recipes; only admins manage people (and export/import).

## Rules
- Usernames are 3-40 characters (letters, digits, `_`, `.`, `-`) and not case-sensitive; a taken name is refused.
- Passwords are at least 10 characters.
- You can't remove yourself, and you can't remove the last admin, so the box always has someone who can manage it.
- Removing a member signs them out everywhere. Their recipes stay in the box; they just no longer show who added them.
- Anyone can change their own password; they must enter the current one. This signs out every other device but keeps the one in use.

## On screen: Settings
- **My account**: your name and username, and *Change your password* (current password, new password twice). Wrong current password is flagged on that field.
- **Household** (admins only): the member list with a "You" marker. *Add a member* at the bottom takes name, username, a temporary password and a role; the new person appears in the list. Give them the username and password in person; they can change it under My account.
- **Reset password** beside a person opens a small form; save and they are signed out everywhere.
- **Remove** asks "Remove Sam from the household?" first. It is switched off for yourself and for the only admin, with the reason shown under the row.
- **AI import**: says whether photo import is on and, if not, what still works and how an admin turns it on.
- **Photo style** (admins only, household setting `plateTreatment`): shows recipe photos with the print style or as
  taken. Everyone in the household sees the same; originals are never changed, so switching is always safe.
