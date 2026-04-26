# TeamChat — Final 3 Steps

All credentials are already filled in. Just do these 3 things.

---

## Step 1 — Set up your Google Sheet (2 min)

Your sheet: https://docs.google.com/spreadsheets/d/1KjAof_mQ0mWblQ68o4PjMLDK4TuyYdBFbXm-YJco_9A

1. Open it and rename the first tab to exactly: **Users**
2. Add these headers in Row 1:

   | A      | B        | C           |
   |--------|----------|-------------|
   | UserID | Password | DisplayName |

3. Add your team members from Row 2:

   | A     | B       | C         |
   |-------|---------|-----------|
   | alice | pass123 | Alice     |
   | bob   | bob456  | Bob Patel |

---

## Step 2 — Deploy the Apps Script (5 min)

1. Go to https://script.google.com → click **New project**
2. Delete all default code
3. Open the file **APPS_SCRIPT_CODE.js** (from this download) → copy everything → paste it in
4. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy** → copy the URL that appears (looks like `https://script.google.com/macros/s/ABC.../exec`)
6. Open **js/config.js** → replace `YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with that URL

---

## Step 3 — Enable Firebase Realtime Database (2 min)

1. Go to https://console.firebase.google.com → open project **chatting2-13dfb**
2. Left sidebar → **Build → Realtime Database → Create database**
3. Choose **Start in test mode** → pick any region → **Enable**

---

## Step 4 — Upload to GitHub Pages (5 min)

Upload ALL files keeping this exact structure:
```
your-repo/
├── index.html
├── chat.html
├── firebase-messaging-sw.js   ← must be at root
├── js/
│   ├── config.js              ← paste Apps Script URL here first!
│   ├── auth.js
│   └── chat.js
```

1. Create repo at github.com (e.g. `teamchat`)
2. Upload all files
3. **Settings → Pages → Deploy from branch → main → / (root) → Save**
4. Your app is live at: `https://YOUR_USERNAME.github.io/teamchat/`

---

## Done! Test it:

1. Open the URL in Chrome
2. Log in with a UserID/Password from your Sheet
3. Open another browser window → log in as a different user
4. Chat — messages appear instantly, notifications fire on the other device

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Could not connect" on login | Check Apps Script URL in config.js; re-deploy if needed |
| Messages not appearing | Enable Realtime Database in Firebase Console (Step 3) |
| No push notifications | Allow notifications when browser asks; check VAPID key |
| "Invalid ID" error | Check spelling/case of UserID and Password in Sheet |
