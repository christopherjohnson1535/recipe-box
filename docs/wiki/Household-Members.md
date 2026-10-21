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
