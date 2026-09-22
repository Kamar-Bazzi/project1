import { PatientExportFormat } from './dto/privacy.dto';
import {
  PatientExportDocument,
  renderPatientExport,
} from './patient-data-export.renderer';

describe('patient data export renderer', () => {
  const document: PatientExportDocument = {
    schemaVersion: 1,
    generatedAt: '2026-09-07T12:00:00.000Z',
    dataset: 'medications',
    dateRange: { from: null, to: null },
    records: [
      {
        dataset: 'medications',
        recordType: 'medication',
        name: '=HYPERLINK("https://example.test")',
        dosage: '5 mg',
      },
    ],
  };

  it('renders portable JSON with export metadata and records', () => {
    const result = renderPatientExport(document, PatientExportFormat.JSON);

    expect(result.contentType).toBe('application/json; charset=utf-8');
    expect(JSON.parse(result.content.toString('utf8'))).toEqual(document);
  });

  it('renders UTF-8 CSV and neutralizes spreadsheet formulas', () => {
    const result = renderPatientExport(document, PatientExportFormat.CSV);
    const csv = result.content.toString('utf8');

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""https://example.test"")"`);
    expect(result.extension).toBe('csv');
  });

  it('renders a valid PDF attachment', () => {
    const result = renderPatientExport(document, PatientExportFormat.PDF);

    expect(result.content.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');
    expect(result.content.toString('ascii')).toContain('%%EOF');
  });
});
