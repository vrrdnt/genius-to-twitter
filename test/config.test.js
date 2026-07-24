import test from "node:test";
import assert from "node:assert/strict";
import { assertGeniusConfig, assertXConfig, loadConfig } from "../src/config.js";

test("loadConfig parses IDs, aliases, schedule, and snippet settings", () => {
  const config = loadConfig({
    ARTIST_IDS: "12, 34",
    ARTIST_ALIASES: "one, two",
    MIN_LINES: "2",
    MAX_LINES: "3",
    PUBLISH_ENABLED: "yes",
    DATA_DIR: "./temporary-state",
  });
  assert.deepEqual(config.artistIds, [12, 34]);
  assert.deepEqual(config.snippet.artistAliases, ["one", "two"]);
  assert.equal(config.snippet.maxLines, 3);
  assert.equal(config.publishEnabled, true);
  assert.match(config.catalogFile, /temporary-state[/\\]catalog\.json$/u);
});

test("loadConfig rejects invalid ranges and booleans", () => {
  assert.throws(() => loadConfig({ MIN_LINES: "5", MAX_LINES: "2" }), /MIN_LINES/);
  assert.throws(() => loadConfig({ PUBLISH_ENABLED: "sometimes" }), /boolean/);
  assert.throws(() => loadConfig({ ARTIST_IDS: "abc" }), /invalid Genius artist ID/);
});

test("configuration assertions list missing secrets without exposing values", () => {
  const config = loadConfig({ ARTIST_IDS: "12" });
  assert.throws(() => assertGeniusConfig(config), /GENIUS_ACCESS_TOKEN/);
  assert.throws(() => assertXConfig(config), /X_API_KEY/);
});
