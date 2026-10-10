// CSV/TSV state machine: quoted cells, escaped quotes, CRLF, multiline cells, and auto-delimiter detection.
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  if (tabCount > commaCount && tabCount > semiCount) return '\t';
  if (semiCount > commaCount && semiCount > tabCount) return ';';
  return ',';
}

export function parseCsv(text: string, maxCells = 25_000_000, explicitDelimiter?: string): string[][] {
  const delimiter = explicitDelimiter && explicitDelimiter !== 'auto' ? explicitDelimiter : detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false,
    cells = 0;

  function field() {
    if (++cells > maxCells) {
      throw new Error(`Delimited text exceeds ${maxCells.toLocaleString()} cells; export a smaller subset.`);
    }
    row.push(cell.trim());
    cell = '';
    closed = false;
  }

  function record() {
    field();
    if (row.length > 1 || row.some(Boolean)) rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += c;
      }
    } else if (c === delimiter) {
      field();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record();
    } else if (c === '"' && !cell && !closed) {
      quoted = true;
    } else if (c === '"' || (closed && c.trim())) {
      throw new Error('Malformed delimited text: unexpected text or quote after a field.');
    } else if (!closed) {
      cell += c;
    }
  }

  if (quoted) throw new Error('Malformed delimited text: a quoted field was not closed.');
  if (cell || row.length || closed) record();
  if (rows.length < 2) throw new Error('Data needs a header and at least one data row.');
  if (rows[0].some((h) => !h) || new Set(rows[0]).size !== rows[0].length) {
    throw new Error('Headers must be nonempty and unique.');
  }
  if (rows.some((r) => r.length !== rows[0].length)) {
    throw new Error('Rows have inconsistent column counts. Check delimiters and quoted values.');
  }
  return rows;
}

