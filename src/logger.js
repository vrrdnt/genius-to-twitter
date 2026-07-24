function write(level, message) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}`;
  const output = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  output(line);
}

export const logger = {
  info(message) {
    write("info", message);
  },
  warn(message) {
    write("warn", message);
  },
  error(message) {
    write("error", message);
  },
};
