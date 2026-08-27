export interface TolerantJsonParseResult {
  value: unknown;
  /** Trimmed leftover text after the first parsed JSON value, if any. */
  trailingText: string;
}

/**
 * Parse the leading JSON value out of a string that may have trailing
 * non-JSON content after it (observed in real Bambu Studio
 * `project_settings.config` files: a `cache_hash = <hex>` line after the
 * closing brace). `JSON.parse` throws hard on any trailing content, so
 * this scans for the end of the first top-level value by hand instead.
 *
 * Ported from `load_json_bytes` in bbs2u1.py (lines 766-782), which uses
 * `json.JSONDecoder().raw_decode()` for the same purpose. Like the Python
 * original (calling `raw_decode` directly rather than `decode`), this
 * does NOT skip leading whitespace before the value -- real config files
 * always start with `{` at position 0.
 */
export function tolerantJsonParse(text: string): TolerantJsonParseResult {
  const end = findFirstJsonValueEnd(text);
  const value = JSON.parse(text.slice(0, end));
  const trailingText = text.slice(end).trim();
  return { value, trailingText };
}

/** Scan for the index right after the first complete top-level JSON value, respecting string/escape state. */
function findFirstJsonValueEnd(text: string): number {
  const n = text.length;
  if (n === 0) throw new SyntaxError("Unexpected end of JSON input");

  const first = text[0];
  if (first !== "{" && first !== "[") {
    // Bare scalar (string/number/literal) -- rare for real config files
    // (always objects), handled for completeness.
    const m = /^(true|false|null|-?\d+(\.\d+)?([eE][+-]?\d+)?|"(?:[^"\\]|\\.)*")/.exec(text);
    if (!m) throw new SyntaxError("Expecting value");
    return m[0].length;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  throw new SyntaxError("Unexpected end of JSON input");
}
