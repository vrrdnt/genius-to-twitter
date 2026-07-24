#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { runCatalogSync, runPost } from "./bot.js";
import { runDaemon } from "./daemon.js";
import { logger } from "./logger.js";

function printHelp() {
  console.log(`genius-to-twitter

Usage:
  node src/cli.js daemon          Run the scheduled bot (default)
  node src/cli.js post            Prepare and print a dry-run post
  node src/cli.js post --publish  Prepare and publish one post to X
  node src/cli.js sync            Refresh the cached Genius song catalog

The daemon only publishes when PUBLISH_ENABLED=true. See .env.example.`);
}

async function main(arguments_) {
  const command = arguments_[0] || "daemon";
  if (command === "help" || arguments_.includes("--help") || arguments_.includes("-h")) {
    printHelp();
    return;
  }

  const config = loadConfig();
  if (command === "daemon") {
    await runDaemon(config, logger);
  } else if (command === "post") {
    await runPost(config, { publish: arguments_.includes("--publish"), logger });
  } else if (command === "sync") {
    await runCatalogSync(config, logger);
  } else {
    throw new Error(`Unknown command: ${command}. Run with --help for usage.`);
  }
}

main(process.argv.slice(2)).catch((error) => {
  logger.error(error.stack || error.message);
  process.exitCode = 1;
});
