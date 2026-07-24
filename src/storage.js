import fs from "node:fs/promises";
import path from "node:path";

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    if (error instanceof SyntaxError) {
      throw new Error(`Could not parse JSON state file ${file}: ${error.message}`);
    }
    throw error;
  }
}

export async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporaryFile, file);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true });
    throw error;
  }
}
