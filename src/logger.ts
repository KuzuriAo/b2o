import { appendFileSync } from "node:fs";

export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

function timestampedLine(message: string): string {
  return `${new Date().toISOString()} ${message}\n`;
}

/**
 * Wraps console output so an unattended run (--watch, or a plain convert
 * invoked from cron) has a durable record instead of relying on someone
 * watching a terminal that may not exist. --log-file appends every line to
 * a file (with a timestamp) in addition to stdout/stderr; --quiet
 * suppresses stdout/stderr entirely. cli.ts refuses --quiet without
 * --log-file -- that combination would silently swallow every error with
 * nowhere for it to go, which is the opposite of what this exists for.
 */
export function createLogger(options: { logFile?: string; quiet: boolean }): Logger {
  const writeToFile = (message: string) => {
    if (options.logFile) appendFileSync(options.logFile, timestampedLine(message));
  };
  return {
    log(message: string): void {
      writeToFile(message);
      if (!options.quiet) console.log(message);
    },
    error(message: string): void {
      writeToFile(message);
      if (!options.quiet) console.error(message);
    },
  };
}
