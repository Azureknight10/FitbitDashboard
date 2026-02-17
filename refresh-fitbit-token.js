// refresh-fitbit-token.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const TOKENS_PATH = path.join(__dirname, "fitbit-tokens.json");

function loadTokens() {
  const raw = fs.readFileSync(TOKENS_PATH, "utf8");
  return JSON.parse(raw);
}

function saveTokens(tokens) {
  fs.writeFileSync(
    TOKENS_PATH,
    JSON.stringify(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token
      },
      null,
      2
    )
  );
}

async function refresh() {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing FITBIT_CLIENT_ID or FITBIT_CLIENT_SECRET");
    process.exit(1);
  }

  const { refresh_token } = loadTokens();

  try {
    const res = await axios.post(
      "https://api.fitbit.com/oauth2/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
        }
      }
    );

    saveTokens({
      access_token: res.data.access_token,
      refresh_token: res.data.refresh_token
    });

    console.log("Refreshed Fitbit tokens and updated fitbit-tokens.json");
  } catch (err) {
    console.error("Error refreshing token:", err.response?.data || err.message);
  }
}

refresh();
