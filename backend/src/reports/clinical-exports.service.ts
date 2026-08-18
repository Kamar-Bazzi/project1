import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import {
  ClinicalAccessService,
  ClinicalActor,
} from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClinicalExportDataset,
  ClinicalExportQueryDto,
  ReportExportFormat,
} from './dto/report-query.dto';
import { ReportsService } from './reports.service';

type ExportCell = string | number | boolean | null;
type ExportRow = Record<string, ExportCell>;

export interface ClinicalExportFile {
  content: Buffer;
  contentType: 'text/csv; charset=utf-8' | 'application/pdf';
  filename: string;
}

@Injectable()
export class ClinicalExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
    private readonly reports: ReportsService,
  ) {}

  async exportHealthReport(
    patientUserId: string,
    periodDays: number,
    format: ReportExportFormat,
  ): Promise<ClinicalExportFile> {
    const report = await this.reports.getPatientReport(
      patientUserId,
      periodDays,
    );
    const rows: ExportRow[] = [
      ...report.measurements.map((trend) => ({
        section: 'measurement',
        metric: trend.type,
        unit: trend.unit,
        latest: trend.latest,
        average: trend.average,
        change: trend.changePercent,
        unusualChange: trend.unusualChange,
        details: `${trend.count} readings`,
      })),
      ...report.wearableMetrics.map((trend) => ({
        section: 'wearable',
        metric: trend.type,
        unit: trend.unit,
        latest: trend.latest,
        average: trend.average,
        change: trend.changePercent,
        unusualChange: trend.unusualChange,
        details: `${trend.count} readings`,
      })),
      {
        section: 'adherence',
        metric: 'MEDICATION_ADHERENCE',
        unit: '%',
        latest: report.medicationAdherence.adherenceRate,
        average: report.medicationAdherence.adherenceRate,
        change: report.medicationAdherence.changePercentagePoints,
        unusualChange:
          report.medicationAdherence.changePercentagePoints !== null &&
          report.medicationAdherence.changePercentagePoints <= -20,
        details: `${report.medicationAdherence.taken} taken, ${report.medicationAdherence.missed} missed, ${report.medicationAdherence.skipped} skipped`,
      },
      ...report.unusualChanges.map((change) => ({
        section: 'unusual-change',
        metric: change.metric,
        unit: '',
        latest: '',
        average: '',
        change: change.changePercent,
        unusualChange: true,
        details: change.description,
      })),
    ];
    const patient = await this.access.getPatientForUser(patientUserId);
    await this.audit.record({
      userId: patientUserId,
      action: 'HEALTH_REPORT_EXPORTED',
      entity: 'Patient',
      entityId: patient.id,
      metadata: {
        patientId: patient.id,
        periodDays,
        dataset: 'health-report',
        format,
        count: rows.length,
      },
    });
    return this.render(
      `CareTrack ${periodDays}-day health report`,
      rows,
      `health-report-${periodDays}-days`,
      format,
      report.disclaimer,
    );
  }

  async exportDataset(
    actor: ClinicalActor,
    dataset: ClinicalExportDataset,
    query: ClinicalExportQueryDto,
  ): Promise<ClinicalExportFile> {
    const { patient } = await this.access.resolvePatientForActor(
      actor,
      query.patientId,
    );
    const { from, to } = this.dateRange(query.from, query.to);
    const patientScope: Prisma.PatientWhereInput =
      actor.role === UserRole.DOCTOR
        ? {
            id: patient.id,
            doctorAccessGrants: {
              some: {
                active: true,
                doctor: { userId: actor.id },
              },
            },
          }
        : { id: patient.id };
    const rows = await this.datasetRows(dataset, patientScope, from, to);
    await this.audit.record({
      userId: actor.id,
      action: 'CLINICAL_DATA_EXPORTED',
      entity: 'Patient',
      entityId: patient.id,
      metadata: {
        patientId: patient.id,
        dataset,
        format: query.format,
        from: from.toISOString(),
        to: to.toISOString(),
        count: rows.length,
      },
    });
    return this.render(
      `CareTrack ${dataset.replaceAll('-', ' ')} export`,
      rows,
      `${dataset}-${patient.id}`,
      query.format,
      'This export contains sensitive health information. Store and share it securely.',
    );
  }

  private async datasetRows(
    dataset: ClinicalExportDataset,
    patient: Prisma.PatientWhereInput,
    from: Date,
    to: Date,
  ): Promise<ExportRow[]> {
    const range = { gte: from, lte: to };
    if (dataset === ClinicalExportDataset.MEASUREMENTS) {
      const records = await this.prisma.measurement.findMany({
        where: { patient, measuredAt: range },
        orderBy: { measuredAt: 'desc' },
        take: 10_000,
      });
      return records.map((record) => ({
        measuredAt: record.measuredAt.toISOString(),
        type: record.type,
        value: record.value,
        secondaryValue: record.secondaryValue,
        unit: record.unit,
      }));
    }

    if (dataset === ClinicalExportDataset.APPOINTMENTS) {
      const records = await this.prisma.appointment.findMany({
        where: { patient, appointmentDate: range },
        include: {
          doctor: { select: { user: { select: { name: true } } } },
        },
        orderBy: { appointmentDate: 'desc' },
        take: 10_000,
      });
      return records.map((record) => ({
        appointmentDate: record.appointmentDate.toISOString(),
        doctor: record.doctor.user.name,
        status: record.status,
        notes: record.notes,
      }));
    }

    if (dataset === ClinicalExportDataset.ADHERENCE) {
      const records = await this.prisma.medicationLog.findMany({
        where: { medication: { patient }, scheduledFor: range },
        include: {
          medication: { select: { name: true, dosage: true } },
        },
        orderBy: { scheduledFor: 'desc' },
        take: 10_000,
      });
      return records.map((record) => ({
        scheduledFor: record.scheduledFor.toISOString(),
        medication: record.medication.name,
        dosage: record.medication.dosage,
        status: record.status,
        takenAt: record.takenAt?.toISOString() ?? null,
      }));
    }

    if (dataset === ClinicalExportDataset.WEARABLES) {
      const records = await this.prisma.healthMetric.findMany({
        where: { patient, measuredAt: range },
        include: {
          wearableDevice: {
            select: { provider: true, deviceName: true },
          },
        },
        orderBy: { measuredAt: 'desc' },
        take: 10_000,
      });
      return records.map((record) => ({
        measuredAt: record.measuredAt.toISOString(),
        metricType: record.metricType,
        value: record.value,
        secondaryValue: record.secondaryValue,
        unit: record.unit,
        source: record.source,
        provider: record.wearableDevice?.provider ?? null,
        device: record.wearableDevice?.deviceName ?? null,
      }));
    }

    return this.medicalHistoryRows(patient, from, to);
  }

  private async medicalHistoryRows(
    patient: Prisma.PatientWhereInput,
    from: Date,
    to: Date,
  ): Promise<ExportRow[]> {
    const range = { gte: from, lte: to };
    const [
      medications,
      logs,
      measurements,
      metrics,
      alerts,
      appointments,
      notes,
      followUps,
    ] = await Promise.all([
      this.prisma.medication.findMany({
        where: { patient, createdAt: range },
        orderBy: { createdAt: 'desc' },
        take: 10_000,
      }),
      this.prisma.medicationLog.findMany({
        where: { medication: { patient }, scheduledFor: range },
        include: { medication: { select: { name: true, dosage: true } } },
        orderBy: { scheduledFor: 'desc' },
        take: 10_000,
      }),
      this.prisma.measurement.findMany({
        where: { patient, measuredAt: range },
        orderBy: { measuredAt: 'desc' },
        take: 10_000,
      }),
      this.prisma.healthMetric.findMany({
        where: { patient, measuredAt: range },
        orderBy: { measuredAt: 'desc' },
        take: 10_000,
      }),
      this.prisma.healthAlert.findMany({
        where: { patient, detectedAt: range },
        orderBy: { detectedAt: 'desc' },
        take: 10_000,
      }),
      this.prisma.appointment.findMany({
        where: { patient, appointmentDate: range },
        include: {
          doctor: { select: { user: { select: { name: true } } } },
        },
        orderBy: { appointmentDate: 'desc' },
        take: 10_000,
      }),
      this.prisma.doctorNote.findMany({
        where: { patient, createdAt: range },
        include: {
          doctor: { select: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10_000,
      }),
      this.prisma.patientFollowUp.findMany({
        where: { patient, occurredAt: range },
        include: {
          doctor: { select: { user: { select: { name: true } } } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 10_000,
      }),
    ]);
    const rows: Array<ExportRow & { occurredAt: string }> = [
      ...medications.map((record) => ({
        occurredAt: record.createdAt.toISOString(),
        eventType: 'MEDICATION',
        title: record.name,
        summary: `${record.dosage}${record.instructions ? `; ${record.instructions}` : ''}`,
        status: record.status,
        source: 'patient record',
      })),
      ...logs.map((record) => ({
        occurredAt: (record.takenAt ?? record.scheduledFor).toISOString(),
        eventType: 'MEDICATION_LOG',
        title: record.medication.name,
        summary: `${record.medication.dosage} scheduled ${record.scheduledFor.toISOString()}`,
        status: record.status,
        source: 'medication schedule',
      })),
      ...measurements.map((record) => ({
        occurredAt: record.measuredAt.toISOString(),
        eventType: 'MEASUREMENT',
        title: record.type,
        summary: `${record.value}${record.secondaryValue === null ? '' : `/${record.secondaryValue}`} ${record.unit}`,
        status: '',
        source: 'manual measurement',
      })),
      ...metrics.map((record) => ({
        occurredAt: record.measuredAt.toISOString(),
        eventType: 'WEARABLE_METRIC',
        title: record.metricType,
        summary: `${record.value}${record.secondaryValue === null ? '' : `/${record.secondaryValue}`} ${record.unit}`,
        status: '',
        source: record.source,
      })),
      ...alerts.map((record) => ({
        occurredAt: record.detectedAt.toISOString(),
        eventType: 'HEALTH_ALERT',
        title: `${record.severity} ${record.metricType}`,
        summary: record.message,
        status: record.status,
        source: 'alert rule',
      })),
      ...appointments.map((record) => ({
        occurredAt: record.appointmentDate.toISOString(),
        eventType: 'APPOINTMENT',
        title: `Appointment with ${record.doctor.user.name}`,
        summary: record.notes ?? '',
        status: record.status,
        source: 'appointment',
      })),
      ...notes.map((record) => ({
        occurredAt: record.createdAt.toISOString(),
        eventType: 'DOCTOR_NOTE',
        title: record.title,
        summary: record.content,
        status: record.category,
        source: record.doctor.user.name,
      })),
      ...followUps.map((record) => ({
        occurredAt: record.occurredAt.toISOString(),
        eventType: 'FOLLOW_UP',
        title: 'Patient follow-up',
        summary: `${record.summary}${record.recommendations ? `; ${record.recommendations}` : ''}`,
        status: '',
        source: record.doctor.user.name,
      })),
    ];
    return rows.sort((first, second) =>
      second.occurredAt.localeCompare(first.occurredAt),
    );
  }

  private dateRange(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from
      ? new Date(from)
      : new Date(end.getTime() - 90 * 86_400_000);
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('from must be before or equal to to');
    }
    if (end.getTime() - start.getTime() > 10 * 365 * 86_400_000) {
      throw new BadRequestException('Export range cannot exceed 10 years');
    }
    return { from: start, to: end };
  }

  private render(
    title: string,
    rows: ExportRow[],
    filename: string,
    format: ReportExportFormat,
    footer: string,
  ): ClinicalExportFile {
    if (format === ReportExportFormat.CSV) {
      return {
        content: Buffer.from(this.toCsv(rows), 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `${filename}.csv`,
      };
    }
    return {
      content: this.toPdf(title, rows, footer),
      contentType: 'application/pdf',
      filename: `${filename}.pdf`,
    };
  }

  private toCsv(rows: ExportRow[]): string {
    if (rows.length === 0) return 'No records\r\n';
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return [
      headers.map((header) => this.csvCell(header)).join(','),
      ...rows.map((row) =>
        headers.map((header) => this.csvCell(row[header] ?? null)).join(','),
      ),
    ].join('\r\n');
  }

  private csvCell(value: ExportCell): string {
    let text = value === null ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  private toPdf(title: string, rows: ExportRow[], footer: string): Buffer {
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const lines = [
      title,
      `Generated: ${new Date().toISOString()}`,
      '',
      ...(rows.length === 0
        ? ['No records in the selected range.']
        : rows.flatMap((row, index) =>
            this.wrapPdfLine(
              `${index + 1}. ${headers.map((header) => `${header}: ${String(row[header] ?? '')}`).join(' | ')}`,
            ),
          )),
      '',
      ...this.wrapPdfLine(footer),
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
        ...page.flatMap((line) => [`(${this.escapePdfText(line)}) Tj`, 'T*']),
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

  private wrapPdfLine(value: string): string[] {
    const ascii = value
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '?')
      .trim();
    if (ascii.length === 0) return [''];
    const lines: string[] = [];
    let remaining = ascii;
    while (remaining.length > 100) {
      const candidate = remaining.slice(0, 100);
      const splitAt = Math.max(candidate.lastIndexOf(' '), 50);
      lines.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    lines.push(remaining);
    return lines;
  }

  private escapePdfText(value: string): string {
    return value
      .replaceAll('\\', '\\\\')
      .replaceAll('(', '\\(')
      .replaceAll(')', '\\)');
  }
}
