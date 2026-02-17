# LifeVault Fitbit Daily Dashboard – Local Dev README

This README explains how to get back to the current working Fitbit dashboard state after a fresh clone or reset.

## Prerequisites

- Node.js (v18+ recommended)
- npm
- A Fitbit app with:
  - `client_id`
  - `client_secret`
  - A valid `access_token` and `refresh_token` you’ve already obtained

## 1. Checkout the correct Git state

From the repo root:

```bash
# Make sure you're at the clean-slate base
git checkout clean-slate

# Create or switch to your dashboard branch
git checkout -b feature/fitbit-dashboard || git checkout feature/fitbit-dashboard
```

## 2. Folder structure

From the repo root:

```bash
mkdir -p dev/fitbit-dashboard
cd dev/fitbit-dashboard
```

You should have these files in this folder:

- `index.html`
- `fitbit-proxy.js`
- `fitbit-tokens.json`
- `refresh-fitbit-token.js`

(If any are missing, recreate them and paste in the latest working versions.)

## 3. Install dependencies

In `dev/fitbit-dashboard`:

```bash
npm install node-fetch@2
```

## 4. Configure tokens

Create or update `fitbit-tokens.json` in this folder:

```json
{
  "access_token": "PASTE_CURRENT_ACCESS_TOKEN_HERE",
  "refresh_token": "PASTE_CURRENT_REFRESH_TOKEN_HERE"
}
```

- `access_token` is the short-lived token used by the proxy for every API call.
- `refresh_token` is the long-lived token used to get new access tokens.

## 5. Verify `fitbit-proxy.js`

`fitbit-proxy.js` must:

- `require("fs")` and `path`.
- Load tokens from `fitbit-tokens.json` on each request:

```js
const fs = require("fs");
const path = require("path");
const TOKENS_PATH = path.join(__dirname, "fitbit-tokens.json");

function loadTokens() {
  const raw = fs.readFileSync(TOKENS_PATH, "utf8");
  return JSON.parse(raw);
}

app.get("/fitbit-summary", async (req, res) => {
  try {
    const today = "2026-02-16"; // or new Date().toISOString().slice(0, 10)
    const { access_token } = loadTokens();
    const headers = {
      "Authorization": "Bearer " + access_token,
      "Accept": "application/json"
    };
    // ... existing Fitbit fetches and response shaping ...
  } catch (err) {
    // ... error handling ...
  }
});
```

This ensures every request uses the latest access token from the JSON file.

## 6. Configure token refresh script

Create `refresh-fitbit-token.js` that:

- Reads `refresh_token` from `fitbit-tokens.json`.
- Calls Fitbit’s token endpoint with `grant_type=refresh_token`.
- Writes the new `access_token` and `refresh_token` back into `fitbit-tokens.json`.

Typical flow (pseudo-structure):

```js
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // v2

const CLIENT_ID = "YOUR_CLIENT_ID";
const CLIENT_SECRET = "YOUR_CLIENT_SECRET";
const TOKENS_PATH = path.join(__dirname, "fitbit-tokens.json");

async function main() {
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
  const refreshToken = tokens.refresh_token;

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const resp = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });

  const body = await resp.json();
  const newTokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token
  };

  fs.writeFileSync(TOKENS_PATH, JSON.stringify(newTokens, null, 2), "utf8");
  console.log("Tokens refreshed and saved.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

## 7. Run the proxy

From `dev/fitbit-dashboard`:

```bash
node fitbit-proxy.js
```

You should see:

```text
Fitbit proxy listening on http://localhost:3000
```

## 8. Open the dashboard

Use a simple static server or the VS Code Live Server extension to serve `index.html`, for example:

- With Live Server: right-click `index.html` → “Open with Live Server”
- Or with `npx`:

```bash
npx http-server .
```

Then open the served URL (e.g., `http://127.0.0.1:5500/index.html`) and click **Refresh day**.

You should see:

- Activity, Sleep, Nutrition cards filled.
- 7‑day charts (steps, minutes asleep, calories).
- Macros donut.
- Goal rings.
- Today’s/last workouts list.

## 9. When the token expires

If the dashboard stops working due to token expiry:

```bash
cd dev/fitbit-dashboard
node refresh-fitbit-token.js
# then restart the proxy
node fitbit-proxy.js
```

No edits to `fitbit-proxy.js` are needed; it always reads the current tokens from `fitbit-tokens.json`.
