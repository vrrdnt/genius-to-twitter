import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse, TextNode } from "node-html-parser";

const executeFile = promisify(execFile);
const helper = fileURLToPath(new URL("../scripts/fetch-lyrics-page.py", import.meta.url));

function validateLyricsUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["genius.com", "www.genius.com"].includes(url.hostname) ||
    url.username || url.password || url.port
  ) {
    throw new Error("Lyrics must be fetched from an HTTPS Genius page");
  }
  return url.href;
}

async function fetchWithBrowserClient(url) {
  try {
    const { stdout } = await executeFile(
      process.env.LYRICS_PYTHON || "python3",
      [helper, url],
      { timeout: 25_000, maxBuffer: 5 * 1024 * 1024, windowsHide: true },
    );
    return stdout;
  } catch (error) {
    const detail = error.killed
      ? "request timed out"
      : String(error.stderr || error.code || error.message).trim().slice(0, 300);
    throw new Error(`Genius blocked the normal request; browser HTTP fallback failed: ${detail}`);
  }
}

export function extractLyrics(html) {
  const root = parse(html).getElementById("lyrics-root");
  const lyrics = root
    ?.querySelectorAll("[data-lyrics-container='true']")
    .map((container) => {
      container.querySelectorAll("br").forEach((br) => br.replaceWith(new TextNode("\n")));
      return container.text;
    })
    .join("\n")
    .trim();
  if (!lyrics) throw new Error("Genius page did not contain lyrics");
  return lyrics;
}

export async function fetchGeniusLyrics(
  value,
  { fetchImpl = fetch, browserFetch = fetchWithBrowserClient } = {},
) {
  const url = validateLyricsUrl(value);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  let html;
  if (response.status === 403 || response.headers.get("cf-mitigated") === "challenge") {
    await response.body?.cancel();
    html = await browserFetch(url);
  } else {
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Genius lyrics page returned HTTP ${response.status}`);
    }
    html = await response.text();
  }
  return extractLyrics(html);
}
