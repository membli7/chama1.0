"use strict";

const { randomBytes } = require("node:crypto");

for (const key of ["SESSION_SECRET", "ONE_TIME_CODE_HMAC_SECRET", "METRICS_BEARER_TOKEN"]) {
  process.env[key] = randomBytes(48).toString("hex");
}
