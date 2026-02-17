// fitbit-proxy.js
const express = require("express");
const fetch = require("node-fetch"); // npm install node-fetch@2
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = 8080; // <— match Fitbit dev app redirect

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

// ---- OAuth routes ----

// 1) Start OAuth – hit this in browser to begin login
app.get("/auth", (req, res) => {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const redirectUri = "http://localhost:8080/callback"; // must match Fitbit dev app

  const scope = [
    "activity",
    "heartrate",
    "sleep",
    "nutrition",
    "profile"
  ].join(" ");

  const authorizeUrl =
    "https://www.fitbit.com/oauth2/authorize" +
    "?response_type=code" +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}`;

  res.redirect(authorizeUrl);
});

// 2) Callback – Fitbit redirects here with ?code=...
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Missing code");
  }

  try {
    const redirectUri = "http://localhost:8080/callback";
    const clientId = process.env.FITBIT_CLIENT_ID;
    const clientSecret = process.env.FITBIT_CLIENT_SECRET;

    const tokenRes = await axios.post(
      "https://api.fitbit.com/oauth2/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
        }
      }
    );

    saveTokens({
      access_token: tokenRes.data.access_token,
      refresh_token: tokenRes.data.refresh_token
    });

    res.send("Fitbit auth complete. Close this tab and reload your dashboard.");
  } catch (err) {
    console.error(
      "Error exchanging code for tokens:",
      err.response?.data || err.message
    );
    res.status(500).send("Error exchanging code for tokens.");
  }
});

// ---- Helper: fetch with refresh on expired token ----

async function fitbitFetchWithRefresh(url, options = {}) {
  try {
    const tokens = loadTokens();
    const headers = {
      ...(options.headers || {}),
      Authorization: "Bearer " + tokens.access_token,
      Accept: "application/json"
    };

    let resp = await fetch(url, { ...options, headers });

    if (resp.status === 401) {
      const text = await resp.text();
      if (text.includes("expired_token")) {
        // refresh
        const clientId = process.env.FITBIT_CLIENT_ID;
        const clientSecret = process.env.FITBIT_CLIENT_SECRET;

        const redirectUri = "http://localhost:8080/callback";

        const tokenRes = await axios.post(
          "https://api.fitbit.com/oauth2/token",
          new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: loadTokens().refresh_token
          }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization:
                "Basic " +
                Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
            }
          }
        );

        saveTokens({
          access_token: tokenRes.data.access_token,
          refresh_token: tokenRes.data.refresh_token
        });

        const newHeaders = {
          ...(options.headers || {}),
          Authorization: "Bearer " + tokenRes.data.access_token,
          Accept: "application/json"
        };

        resp = await fetch(url, { ...options, headers: newHeaders });
      } else {
        throw new Error(`Fitbit 401: ${text}`);
      }
    }

    return resp;
  } catch (err) {
    throw err;
  }
}

// ---- Existing summary endpoint (updated to use helper) ----

// Preflight handler for this route
app.options("/fitbit-summary", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.sendStatus(204);
});

app.get("/fitbit-summary", async (req, res) => {
  try {
const today = new Date().toISOString().slice(0, 10);

    const [
      activityResp,
      foodResp,
      sleepResp,
      stepsSeriesResp,
      sleepSeriesResp,
      caloriesSeriesResp,
      workoutsResp
    ] = await Promise.all([
      fitbitFetchWithRefresh(
        `https://api.fitbit.com/1/user/-/activities/date/${today}.json`
      ),
      fitbitFetchWithRefresh(
        `https://api.fitbit.com/1/user/-/foods/log/date/${today}.json`
      ),
      fitbitFetchWithRefresh(
        `https://api.fitbit.com/1.2/user/-/sleep/date/${today}.json`
      ),
      fitbitFetchWithRefresh(
        `https://api.fitbit.com/1/user/-/activities/steps/date/${today}/7d.json`
      ),
      fitbitFetchWithRefresh(
        `https://api.fitbit.com/1.2/user/-/sleep/minutesAsleep/date/${today}/7d.json`
      ),
      fitbitFetchWithRefresh(
        `https://api.fitbit.com/1/user/-/foods/log/caloriesIn/date/${today}/7d.json`
      ),
      fitbitFetchWithRefresh(
        `https://api.fitbit.com/1/user/-/activities/list.json?beforeDate=${today}&sort=desc&limit=7&offset=0`
      )
    ]);

    if (
      !activityResp.ok ||
      !foodResp.ok ||
      !sleepResp.ok ||
      !stepsSeriesResp.ok ||
      !sleepSeriesResp.ok ||
      !caloriesSeriesResp.ok ||
      !workoutsResp.ok
    ) {
      const textA = await activityResp.text();
      const textF = await foodResp.text();
      const textS = await sleepResp.text();
      const textSteps = await stepsSeriesResp.text();
      const textSleepSeries = await sleepSeriesResp.text();
      const textCaloriesSeries = await caloriesSeriesResp.text();
      const textWorkouts = await workoutsResp.text();

      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      return res.status(500).json({
        error: "Fitbit request failed",
        activity: textA,
        food: textF,
        sleep: textS,
        stepsSeries: textSteps,
        sleepSeries: textSleepSeries,
        caloriesSeries: textCaloriesSeries,
        workouts: textWorkouts
      });
    }

    const [
      activityJson,
      foodJson,
      sleepJson,
      stepsSeriesJson,
      sleepSeriesJson,
      caloriesSeriesJson,
      workoutsJson
    ] = await Promise.all([
      activityResp.json(),
      foodResp.json(),
      sleepResp.json(),
      stepsSeriesResp.json(),
      sleepSeriesResp.json(),
      caloriesSeriesResp.json(),
      workoutsResp.json()
    ]);

    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.json({
      activity: activityJson,
      food: foodJson,
      sleep: sleepJson,
      stepsSeries: stepsSeriesJson,
      sleepSeries: sleepSeriesJson,
      caloriesSeries: caloriesSeriesJson,
      workouts: workoutsJson
    });
  } catch (err) {
    console.error(err);
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Fitbit proxy listening on http://localhost:${PORT}`);
});
