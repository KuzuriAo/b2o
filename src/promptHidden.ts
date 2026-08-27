/**
 * Prompts for a line of input without echoing it to the terminal --
 * matches `wrangler secret put`'s UX. A raw API key must never be
 * accepted as a CLI argument (arguments land in shell history and are
 * visible to other processes via `ps` for the call's duration), so this
 * is the only supported way to set it.
 *
 * Uses only documented Node APIs (`process.stdin.setRawMode` + manual
 * character handling) rather than reaching into `readline`'s
 * undocumented internals, which is the more common but less stable way
 * this is normally done.
 */
export function promptHidden(question: string): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const stdin = process.stdin;
    process.stdout.write(question);

    if (!stdin.isTTY) {
      // Not an interactive terminal (e.g. piped input in a script or
      // test) -- raw-mode keystrokes will never arrive, so fall back to
      // a plain, unmasked read instead of hanging forever.
      const chunks: Buffer[] = [];
      stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
      stdin.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf-8").trim()));
      return;
    }

    const ENTER_CHARS = new Set(["\n", "\r"]);
    const CTRL_D = String.fromCharCode(4);
    const CTRL_C = String.fromCharCode(3);
    const BACKSPACE_CHARS = new Set(["\b", String.fromCharCode(127)]);

    let input = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf-8");

    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    }

    function onData(char: string) {
      if (ENTER_CHARS.has(char) || char === CTRL_D) {
        cleanup();
        process.stdout.write("\n");
        resolvePromise(input.trim());
      } else if (char === CTRL_C) {
        cleanup();
        process.stdout.write("\n");
        rejectPromise(new Error("Cancelled."));
      } else if (BACKSPACE_CHARS.has(char)) {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    }

    stdin.on("data", onData);
  });
}
