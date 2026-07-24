import cron from "node-cron";
import { assertGeniusConfig, assertXConfig } from "./config.js";
import { getCatalog } from "./catalog.js";
import { runPost } from "./bot.js";

export async function runDaemon(config, logger = console) {
  assertGeniusConfig(config);
  if (config.publishEnabled) assertXConfig(config);
  if (!cron.validate(config.schedule)) {
    throw new Error(`POST_SCHEDULE is not a valid cron expression: ${config.schedule}`);
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: config.timezone }).format();
  } catch {
    throw new Error(`TIMEZONE is not a valid IANA timezone: ${config.timezone}`);
  }

  await getCatalog(config, { logger });

  let running = false;
  const execute = async () => {
    if (running) {
      logger.warn("A posting run is already active; skipping this schedule tick");
      return;
    }
    running = true;
    try {
      await runPost(config, { publish: config.publishEnabled, logger });
    } catch (error) {
      logger.error(`Scheduled posting failed: ${error.stack || error.message}`);
    } finally {
      running = false;
    }
  };

  const task = cron.schedule(config.schedule, execute, {
    name: "lyric-post",
    noOverlap: true,
    timezone: config.timezone,
  });
  logger.info(
    `Bot scheduled with ${JSON.stringify(config.schedule)} in ${config.timezone}; publishing is ${
      config.publishEnabled ? "enabled" : "disabled (dry-run)"
    }`,
  );

  if (config.postOnStart) await execute();

  return new Promise((resolve) => {
    const shutDown = () => {
      logger.info("Stopping lyric bot");
      task.stop();
      process.off("SIGINT", shutDown);
      process.off("SIGTERM", shutDown);
      resolve();
    };
    process.on("SIGINT", shutDown);
    process.on("SIGTERM", shutDown);
  });
}
