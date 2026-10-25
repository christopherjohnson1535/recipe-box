# Google Sign-In

Household members can tap **Sign in with Google** on the sign-in page instead of typing a password, which is handy on the iPad. Your username and password keep working either way.

Google only proves who you are. It never creates an account: there is still no public sign-up ([[Household Members]]), and a Google account that is not in your household gets turned away.

If your sign-in page has no Google button, the feature is off. The admin turns it on with the steps below.

## Signing in
1. Open the sign-in page and tap **Sign in with Google**.
2. Pick your Google account. The first time, Google may say the app is unverified; that is expected for a household app, so choose **Continue** (or **Advanced**, then **Go to Recipe Box**).
3. You land back in Recipe Box, signed in. You stay signed in on that device for the same time as a password sign-in (30 days by default).

It only works for people the admin has set up. Either way works:
- **The admin sets your email.** In **Settings → Household** the admin enters the Google email for your member. The first time you sign in with a Google account whose email matches, Recipe Box links the two.
- **You connect it yourself.** Sign in with your password, open **Settings**, and choose **Connect Google**. Disconnect there too whenever you like. Once linked, a connected account keeps working. Changing or clearing the email in Household disconnects that member's connected accounts; they sign in with Google again once an account matches the new email, or connect one from Settings.

## On the iPad Home Screen app
The sign-in page is an ordinary link, not a pop-up, and the Home Screen app ([[Using on iPad]]) needs the HTTPS address you installed from: Google will not send you back to a plain `http://192.168...` address.

iOS may open Google's page in a separate window that does not share the app's cookies. We have not been able to confirm this on every iPad, so if you tap the button in the app and land back on the sign-in page (perhaps with a Google error), just sign in with your password there. To connect Google from **Settings**, open Recipe Box in Safari, sign in with your password there, then choose **Connect Google**. Safari and the Home Screen app keep separate sign-ins; see also [[Grocery List]] for the same note about Google Tasks.

## Setting it up (admin)
This uses the same Google app as the grocery list's Google Tasks export, so there is nothing new to put in `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL` and `TOKEN_ENCRYPTION_KEY`. It is free, needs a Google account, and takes about 10 minutes. Nothing here needs Google's verification.

### If you already set up Google Tasks
Open the same project in the [Google Cloud console](https://console.cloud.google.com/) and make two changes.
1. **Add the scopes.** In **Google Auth Platform → Data access**, choose **Add or remove scopes** and add `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. Save.
2. **Add the redirect address.** In **Google Auth Platform → Clients**, open your Web application client. Under **Authorized redirect URIs** add a second one: your `PUBLIC_URL` followed by `/api/auth/google/callback`, for example `https://recipes.example.ts.net/api/auth/google/callback`. Keep the Tasks one; both stay. Save.

Check **Audience → Test users** lists every household member's Google account. Then restart the API if you changed `.env`, and try it ([Try it out](#try-it-out)).

### If you are starting from scratch
1. **Create a project.** Go to the [Google Cloud console](https://console.cloud.google.com/), open the project picker at the top, and choose **New project**. Name it `Recipe Box` and make sure it is selected.
2. **Open Google Auth Platform.** Search for "Google Auth Platform" (older consoles: **APIs & Services → OAuth consent screen**). Click **Get started** if it asks.
3. **Branding.** App name `Recipe Box`, your email as the support and developer contact. Leave the logo empty (a logo triggers a Google review).
4. **Audience.** Choose **External** and leave the status as **Testing**. Under **Test users** add your own Google email and every household member's. While in Testing only these people can get past Google, which suits a household app (up to 100 people).
5. **Data access.** Add `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
6. **Create the client.** Go to **Clients → Create client**, type **Web application**, name `Recipe Box`.
   - **Authorized redirect URIs:** `<PUBLIC_URL>/api/auth/google/callback`, for example `http://localhost:3000/api/auth/google/callback`.
   - Leave **Authorized JavaScript origins** empty.
   - Create it, then copy the **Client ID** and **Client secret**. The secret is shown once; keep it out of git.
7. **Put them in `.env`.** Set the four variables below (the Google Tasks section of the [deploy guide](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md#google-tasks-optional) explains each). For a trial on your own computer:
   ```env
   PUBLIC_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   TOKEN_ENCRYPTION_KEY=...    # openssl rand -base64 32
   ```
   `PUBLIC_URL` is the address people type in the browser, with no trailing slash.
8. Restart: `docker compose up -d`.

To use the same client for Google Tasks later, add its redirect URI too; see the Google Tasks section of the [deploy guide](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md#google-tasks-optional).

### Which address works
Google accepts `http://localhost` or an **HTTPS** address with a real name. It refuses LAN addresses like `http://192.168.1.20:3000`.
- **On your computer:** `http://localhost:3000`. Use `localhost`, not `127.0.0.1`, because the address must match exactly.
- **iPad or another device:** use the HTTPS address from [[Deploying]]; Tailscale gives you `https://<machine>.<tailnet>.ts.net` ([[Deploy-Tailscale]]). Set `PUBLIC_URL` to it and add its callback as a redirect URI. You can have both the `localhost` one and the HTTPS one on the same client.

### Try it out
1. Sign in with your password.
2. In **Settings → Household** set your own email (or choose **Connect Google** in Settings).
3. Sign out, then tap **Sign in with Google**.

### Going live
Use a separate client (or project) for the real deployment, with only its own redirect URI. Keep the app in **Testing** with your household as test users; no Google review is needed. Publishing to **In production** is only for letting people outside that list sign in.

## Troubleshooting
- **`Error 400: redirect_uri_mismatch`.** The address in the console must match `PUBLIC_URL` + `/api/auth/google/callback` exactly: scheme, host, port, path, and no trailing slash.
- **"Access blocked: … has not completed the Google verification process", or `access_denied`.** That Google account is not on the **Test users** list.
- **Sent back to sign in with "Ask your household admin to add your Google email first."** No member has that email and the account is not linked. The admin adds the email in **Settings → Household**, or you use **Connect Google** while signed in with your password.
- **Sent back to sign in after Google, with a sign-in error.** The sign-in took longer than 10 minutes, the page was opened in a different browser, or cookies are blocked. Try again from the start. On an iPad see the Home Screen note above.
- **No Google button.** One of the four Google settings is missing, so the feature is off. Check the four variables in `.env` and restart the API.
- **A change in the Google console has no effect.** Console changes can take a few minutes to apply.
