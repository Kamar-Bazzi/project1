import { PatientExportFormat } from './dto/privacy.dto';

export type PatientExportValue = string | number | boolean | null;
export type PatientExportRow = Record<string, PatientExportValue>;

export interface PatientExportDocument {
  schemaVersion: 1;
  generatedAt: string;
  dataset: string;
  dateRange: { from: string | null; to: string | null };
  records: PatientExportRow[];
}

export interface RenderedPatientExport {
  content: Buffer;
  contentType:
    | 'text/csv; charset=utf-8'
    | 'application/json; charset=utf-8'
    | 'application/pdf';
  extension: 'csv' | 'json' | 'pdf';
}

export function renderPatientExport(
  document: PatientExportDocument,
  format: PatientExportFormat,
): RenderedPatientExport {
  if (format === PatientExportFormat.JSON) {
    return {
      content: Buffer.from(JSON.stringify(document, null, 2), 'utf8'),
      contentType: 'application/json; charset=utf-8',
      extension: 'json',
    };
  }

  if (format === PatientExportFormat.CSV) {
    return {
      content: Buffer.from(`\uFEFF${toCsv(document.records)}`, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv',
    };
  }

  return {
    content: toPdf(document),
    contentType: 'application/pdf',
    extension: 'pdf',
  };
}

function toCsv(rows: PatientExportRow[]): string {
  const headers = [
    ...new Set([
      'dataset',
      'recordType',
      ...rows.flatMap((row) => Object.keys(row)),
    ]),
  ];
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header] ?? null)).join(','),
    ),
  ].join('\r\n');
}

function csvCell(value: PatientExportValue): string {
  let text = value === null ? '' : String(value);
  // Spreadsheet programs can evaluate cells beginning with these characters.
  // Prefixing an apostrophe retains the text while preventing formula execution.
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function toPdf(document: PatientExportDocument): Buffer {
  const title = `CareTrack patient data export - ${document.dataset}`;
  const lines = [
    title,
    `Generated: ${document.generatedAt}`,
    `Date range: ${document.dateRange.from ?? 'all'} to ${document.dateRange.to ?? 'all'}`,
    '',
    ...(document.records.length === 0
      ? ['No records in this export.']
      : document.records.flatMap((row, index) =>
          wrapPdfLine(
            `${index + 1}. ${Object.entries(row)
              .map(([key, value]) => `${key}: ${String(value ?? '')}`)
              .join(' | ')}`,
          ),
        )),
    '',
    ...wrapPdfLine(
      'This file contains private health information. Store and share it securely.',
    ),
  ];
  const pages: string[][] = [];
  for (let offset = 0; offset < lines.length; offset += 55) {
    pages.push(lines.slice(offset, offset + 55));
  }

  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const pageObjectNumbers = pages.map((_page, index) => 4 + index * 2);
  objects[2] =
    `<< /Type /Pages /Count ${pages.length} /Kids [` +
    `${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  pages.forEach((page, index) => {
    const pageNumber = pageObjectNumbers[index];
    const contentNumber = pageNumber + 1;
    const stream = [
      'BT',
      '/F1 9 Tf',
      '36 806 Td',
      '13 TL',
      ...page.flatMap((line) => [`(${escapePdfText(line)}) Tj`, 'T*']),
      'ET',
    ].join('\n');
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`;
    objects[contentNumber] =
      `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

function wrapPdfLine(value: string): string[] {
  const ascii = value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '?')
    .trim();
  if (!ascii) return [''];
  const result: string[] = [];
  let remaining = ascii;
  while (remaining.length > 100) {
    const candidate = remaining.slice(0, 100);
    const lastSpace = candidate.lastIndexOf(' ');
    const splitAt = lastSpace >= 50 ? lastSpace : 100;
    result.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  result.push(remaining);
  return result;
}

function escapePdfText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}
