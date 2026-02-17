// getFastStatus/index.js
const { TableClient } = require("@azure/data-tables");

const connectionString = process.env.TABLES_CONNECTION_STRING;
const tableName = "FastingLog";
const USER_ID = "USER_shane-dev-001";

module.exports = async function (context, req) {
  try {
    const client = TableClient.fromConnectionString(connectionString, tableName);

    let active = null;

    const list = client.listEntities({
      queryOptions: {
        filter: `PartitionKey eq '${USER_ID}' and status eq 'active'`
      }
    });

    for await (const e of list) {
      active = e;
      break;
    }

    if (!active) {
      context.res = {
        status: 200,
        body: { hasActiveFast: false }
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        hasActiveFast: true,
        fastId: active.rowKey,
        startUtc: active.startUtc
      }
    };
  } catch (err) {
    context.log.error("getFastStatus error:", err.message || err);
    context.res = {
      status: 500,
      body: { error: "getFastStatus failed", details: err.message || String(err) }
    };
  }
};
