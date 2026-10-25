# Household members

Everyone in the household signs in with their own username and password (or, if your household has switched it on, [[Google Sign-In]]) and shares one recipe box. There is no public sign-up: the first account is created at setup, and an admin adds everyone else.

## What an admin can do
- See all members, add a member (username, display name, password, role `admin` or `member`), and remove a member.
- Reset another member's password without knowing the old one. That member is signed out on all devices.
- Set a member's Google email (**Household**, beside their name) so they can use **Sign in with Google**. The email is optional, must be unique, and is only a way in: it never creates an account. See [[Google Sign-In]].
- Both roles can add, edit and delete recipes; only admins manage people (and export/import).

## Rules
- Usernames are 3-40 characters (letters, digits, `_`, `.`, `-`) and not case-sensitive; a taken name is refused.
- Passwords are at least 10 characters.
- You can't remove yourself, and you can't remove the last admin, so the box always has someone who can manage it.
- Removing a member signs them out everywhere. Their recipes stay in the box; they just no longer show who added them.
- Too many wrong passwords in a row (5 for one username, 20 from one device or network; when the server cannot tell devices apart, for example behind a proxy, only the username limit applies) pauses sign-in and password changes for a while, 30 seconds at first and up to 15 minutes if guessing continues. The message says how long to wait; the right password is not accepted until then.
- Anyone can change their own password; they must enter the current one. This signs out every other device but keeps the one in use.

## On screen: Settings
- **My account**: your name and username, and *Change your password* (current password, new password twice). Wrong current password is flagged on that field.
- **Household** (admins only): the member list with a "You" marker. *Add a member* at the bottom takes name, username, a temporary password and a role; the new person appears in the list. Give them the username and password in person; they can change it under My account.
- **Email** (admins only) is the Google email used for **Sign in with Google**. Leave it blank for members who only use a password.
- **Reset password** beside a person opens a small form; save and they are signed out everywhere.
- **Remove** asks "Remove Sam from the household?" first. It is switched off for yourself and for the only admin, with the reason shown under the row.
- **Sign in with Google**: shown when Google sign-in is on. **Connect Google** links your own Google account to your member (no email needed), and each linked account has a **Disconnect**. See [[Google Sign-In]].
- **AI import**: says whether photo import is on and, if not, what still works and how an admin turns it on.
- **Photo style** (admins only, household setting `plateTreatment`): shows recipe photos with the print style or as
  taken. Everyone in the household sees the same; originals are never changed, so switching is always safe.
