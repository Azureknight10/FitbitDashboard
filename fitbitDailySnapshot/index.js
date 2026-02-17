const { TableClient } = require("@azure/data-tables");
const fetch = require("node-fetch"); // v2

const connectionString = process.env.TABLES_CONNECTION_STRING;
const tableName = "DailyFacts";
const USER_ID = "USER_shane-dev-001";

module.exports = async function (context, myTimer) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  context.log(`fitbitDailySnapshot running at ${now.toISOString()} for ${today}`);

  try {
    // For local testing, call your proxy
    const resp = await fetch("http://localhost:8080/fitbit-summary");
    if (!resp.ok) {
      const text = await resp.text();
      context.log.error("Error calling fitbit-summary:", resp.status, text);
      return;
    }

    const data = await resp.json();

    const activity = data.activity || {};
    const summary = activity.summary || {};
    const food = data.food || {};
    const foodSummary = food.summary || {};
    const sleep = data.sleep || {};
    const sleepSummary = sleep.summary || {};

    const distances = summary.distances || [];
    const totalDistanceObj = distances.find(d => d.activity === "total") || {};
    const distanceKm = Number(totalDistanceObj.distance || 0);

    const entity = {
      partitionKey: USER_ID,
      rowKey: today,
      steps: summary.steps || 0,
      caloriesOut: summary.caloriesOut || 0,
      sedentaryMinutes: summary.sedentaryMinutes || 0,
      lightMinutes: summary.lightlyActiveMinutes || 0,
      fairlyMinutes: summary.fairlyActiveMinutes || 0,
      veryMinutes: summary.veryActiveMinutes || 0,
      distanceKm,
      sleepMinutes: sleepSummary.totalMinutesAsleep || 0,
      sleepEfficiency: sleepSummary.efficiency || 0,
      caloriesIn: foodSummary.calories || 0,
      protein: foodSummary.protein || 0,
      carbs: foodSummary.carbs || 0,
      fat: foodSummary.fat || 0,
      rawJson: JSON.stringify(data)
    };

    const client = TableClient.fromConnectionString(connectionString, tableName);
    await client.upsertEntity(entity, "Merge");

    context.log(`Saved DailyFacts for ${today}`);
  } catch (err) {
    context.log.error("fitbitDailySnapshot error:", err.message || err);
  }
};
