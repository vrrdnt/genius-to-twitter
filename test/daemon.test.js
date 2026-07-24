import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { runDaemon } from "../src/daemon.js";

const silentLogger = { info() {}, warn() {}, error() {} };

test("daemon rejects an invalid cron expression before doing network work", async () => {
  const config = loadConfig({
    ARTIST_IDS: "7",
    GENIUS_ACCESS_TOKEN: "test-token",
    POST_SCHEDULE: "not a schedule",
  });
  await assert.rejects(runDaemon(config, silentLogger), /valid cron expression/);
});

test("daemon rejects an invalid IANA timezone before doing network work", async () => {
  const config = loadConfig({
    ARTIST_IDS: "7",
    GENIUS_ACCESS_TOKEN: "test-token",
    POST_SCHEDULE: "0 10 * * *",
    TIMEZONE: "Middle/Of_Nowhere",
  });
  await assert.rejects(runDaemon(config, silentLogger), /valid IANA timezone/);
});
