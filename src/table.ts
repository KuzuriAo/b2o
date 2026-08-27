/**
 * Formats rows of strings into a left-justified, space-aligned table --
 * plain tab characters (`\t`) don't align reliably across rows since
 * terminal tab stops are fixed-width and don't adapt to the longest
 * value in a column. The last column is left unpadded (padding it only
 * adds invisible trailing whitespace, no visual benefit).
 */
export function formatTable(rows: string[][], columnGap = 2): string {
  if (rows.length === 0) return "";
  const columnCount = rows[0].length;
  const widths = Array.from({ length: columnCount }, (_, col) => Math.max(...rows.map((row) => row[col].length)));
  const gap = " ".repeat(columnGap);

  return rows
    .map((row) => row.map((cell, col) => (col === columnCount - 1 ? cell : cell.padEnd(widths[col]))).join(gap))
    .join("\n");
}
