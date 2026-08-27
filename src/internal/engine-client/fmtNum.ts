/**
 * Format a float the way Bambu/Orca 3MF transform strings expect: 6
 * decimal places, trailing zeros and a trailing bare "." stripped, with
 * "-0"/empty collapsed to "0".
 *
 * Ported from `fmt_num` in bbs2u1.py (lines 371-373):
 * `f"{val:.6f}".rstrip("0").rstrip(".")`, then the same `-0`/empty
 * fallback. Must match byte-for-byte, since this directly determines the
 * output 3MF's transform attribute text (see the oracle-diff harness in
 * the implementation plan). `toFixed(6)` always emits a literal "."
 * followed by exactly 6 digits for any finite number, so a trailing-zero
 * regex anchored at the string's end can never accidentally reach into
 * the integer part (it always stops at that ".").
 */
export function fmtNum(val: number): string {
  const s = val
    .toFixed(6)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
  return s === "" || s === "-0" ? "0" : s;
}
