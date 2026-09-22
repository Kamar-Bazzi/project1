import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getApiErrorMessage } from "../../services/api-error";
import { appointmentService } from "../../services/appointment.service";
import { careService } from "../../services/care.service";
import { measurementService } from "../../services/measurement.service";
import { medicationService } from "../../services/medication.service";
import type {
  HealthTrend,
  MedicalHistoryItem,
  PatientHealthReport,
} from "../../types/care";
import type { Appointment } from "../../types/appointment";
import type { Measurement } from "../../types/measurement";
import type { Medication } from "../../types/medication";

type CalendarEventType = "appointment" | "reminder" | "follow_up";
type SearchResultType = "Medication" | "Measurement" | "Appointment" | "Timeline";

interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  detail: string;
  status: string;
  date: Date;
}

interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  detail: string;
  when: string;
  to: string;
}

const calendarFilters: Array<{ type: CalendarEventType; label: string }> = [
  { type: "appointment", label: "Appointments" },
  { type: "reminder", label: "Medication reminders" },
  { type: "follow_up", label: "Follow-ups" },
];
const searchFilters: SearchResultType[] = [
  "Medication",
  "Measurement",
  "Appointment",
  "Timeline",
];

function formatEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(first: Date, second: Date): boolean {
  return localDateKey(first) === localDateKey(second);
}

function trendLabel(type: string): string {
  return formatEnum(type);
}

function comparisonCopy(trend: HealthTrend): string {
  if (trend.previousAverage === null || trend.changePercent === null) {
    return "No prior period baseline";
  }
  const direction =
    trend.changePercent > 0 ? "higher" : trend.changePercent < 0 ? "lower" : "unchanged";
  return `${Math.abs(trend.changePercent).toFixed(1)}% ${direction} than prior period`;
}

function latestSeriesPoints(trend: HealthTrend): Array<{ label: string; value: number }> {
  return trend.series
    .slice(-7)
    .filter((point) => Number.isFinite(point.average))
    .map((point) => ({
      label: new Date(point.date).toLocaleDateString([], {
        month: "short",
        day: "numeric",
      }),
      value: point.average,
    }));
}

function percentageWidth(value: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return "0%";
  return `${Math.max(4, Math.min(100, (value / max) * 100))}%`;
}

function trendChangeLabel(trend: HealthTrend): string {
  if (trend.changePercent === null) return "No baseline";
  if (trend.changePercent === 0) return "No change";
  const sign = trend.changePercent > 0 ? "+" : "";
  return `${sign}${trend.changePercent.toFixed(1)}%`;
}

export function PatientComparisonCards() {
  const [report, setReport] = useState<PatientHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      setReport(await careService.report(30));
      setError(null);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not load comparison data."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trends = useMemo(
    () => [...(report?.measurements ?? []), ...(report?.wearableMetrics ?? [])].slice(0, 4),
    [report],
  );
  const maxAverage = Math.max(1, ...trends.map((trend) => trend.average));

  return (
    <section
      className="card data-section"
      aria-labelledby="dashboard-comparison-title"
      aria-busy={isLoading}
    >
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">30-day comparison</p>
          <h2 id="dashboard-comparison-title">Health trends</h2>
          <p>Current averages compared with the previous 30 days.</p>
        </div>
        <Link className="button button-secondary button-small" to="/reports">
          Reports
        </Link>
      </div>

      {error ? (
        <div className="inline-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <p>{error}</p>
          <button type="button" className="button button-primary" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="inline-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading comparison charts...</p>
        </div>
      ) : (
        <>
          <div className="analytics-comparison-grid">
            {trends.length === 0 ? (
              <div className="inline-state">
                <span className="state-icon" aria-hidden="true">i</span>
                <h3>No comparison data yet</h3>
                <p>Record measurements or sync a wearable to build trend cards.</p>
              </div>
            ) : (
              trends.map((trend) => {
                const points = latestSeriesPoints(trend);
                const maxPoint = Math.max(1, ...points.map((point) => point.value));

                return (
                <article className="analytics-comparison" key={`${trend.type}-${trend.latestAt}`}>
                  <div className="analytics-comparison-header">
                    <h3>{trendLabel(trend.type)}</h3>
                    <span
                      className={[
                        "trend-badge",
                        trend.unusualChange ? "trend-badge-alert" : "",
                      ].join(" ")}
                    >
                      {trendChangeLabel(trend)}
                    </span>
                  </div>
                  <p>{comparisonCopy(trend)}</p>
                  <div className="comparison-values">
                    <span>
                      <small>Current average</small>
                      <strong>{trend.average.toFixed(1)} {trend.unit}</strong>
                    </span>
                    <span>
                      <small>Previous average</small>
                      <strong>
                        {trend.previousAverage === null
                          ? "No data"
                          : `${trend.previousAverage.toFixed(1)} ${trend.unit}`}
                      </strong>
                    </span>
                  </div>
                  <div
                    className="comparison-bars"
                    role="img"
                    aria-label={`${trendLabel(trend.type)} current average ${trend.average.toFixed(1)} ${trend.unit}`}
                  >
                    <span style={{ width: percentageWidth(trend.average, maxAverage) }} />
                    <span
                      style={{
                        width: percentageWidth(trend.previousAverage ?? 0, maxAverage),
                      }}
                    />
                  </div>
                  {points.length > 0 && (
                    <div
                      className="comparison-sparkline"
                      role="img"
                      aria-label={`${trendLabel(trend.type)} daily averages for the latest ${points.length} days`}
                    >
                      {points.map((point) => (
                        <span
                          key={`${trend.type}-${point.label}`}
                          style={{ height: percentageWidth(point.value, maxPoint) }}
                          title={`${point.label}: ${point.value.toFixed(1)} ${trend.unit}`}
                        />
                      ))}
                    </div>
                  )}
                </article>
                );
              })
            )}
          </div>

          {report && (
            <div className="comparison-period-summary">
              <span>
                Medication adherence:{" "}
                <strong>
                  {report.medicationAdherence.adherenceRate === null
                    ? "No scheduled doses"
                    : `${Math.round(report.medicationAdherence.adherenceRate)}%`}
                </strong>
              </span>
              <span>
                Active alerts: <strong>{report.alerts.active}</strong>
              </span>
              <span>
                Goals tracked: <strong>{report.goals.length}</strong>
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function PatientCalendar() {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [activeFilters, setActiveFilters] = useState<CalendarEventType[]>(
    calendarFilters.map((filter) => filter.type),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const [appointments, medications, history] = await Promise.all([
        appointmentService.list(),
        medicationService.list(),
        careService.medicalHistory({
          period: 90,
          types: ["FOLLOW_UP"],
          pageSize: 50,
        }),
      ]);

      const appointmentEvents = appointments.map((appointment) => ({
        id: `appointment:${appointment.id}`,
        type: "appointment" as const,
        title: `Visit with Dr. ${appointment.doctor.user.name}`,
        detail: appointment.notes || appointment.doctor.specialization || "Appointment",
        status: appointment.status,
        date: new Date(appointment.appointmentDate),
      }));
      const medicationEvents = medications.flatMap((medication) =>
        medication.logs.map((log) => ({
          id: `reminder:${log.id}`,
          type: "reminder" as const,
          title: medication.name,
          detail: medication.dosage,
          status: log.status,
          date: new Date(log.scheduledFor),
        })),
      );
      const followUpEvents = history.items.map((item) => ({
        id: `follow_up:${item.id}`,
        type: "follow_up" as const,
        title: item.title,
        detail: item.summary,
        status: item.status ?? "FOLLOW_UP",
        date: new Date(item.occurredAt),
      }));

      setEvents(
        [...appointmentEvents, ...medicationEvents, ...followUpEvents]
          .filter((event) => !Number.isNaN(event.date.getTime()))
          .sort((first, second) => first.date.getTime() - second.date.getTime()),
      );
      setError(null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not load your calendar."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleEvents = events.filter((event) => activeFilters.includes(event.type));
  const selectedEvents = visibleEvents.filter((event) => sameDay(event.date, selectedDate));
  const firstDay = startOfMonth(visibleMonth);
  const monthDays = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const leadingDays = firstDay.getDay();
  const cells = Array.from({ length: Math.ceil((leadingDays + monthDays) / 7) * 7 }, (_, index) => {
    const day = index - leadingDays + 1;
    return day > 0 && day <= monthDays
      ? new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)
      : null;
  });

  function changeMonth(delta: number): void {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  }

  function toggleFilter(type: CalendarEventType): void {
    setActiveFilters((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  }

  return (
    <section className="card calendar-card" aria-labelledby="patient-calendar-title">
      <div className="calendar-toolbar">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2 id="patient-calendar-title">
            {visibleMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
          </h2>
        </div>
        <div className="row-actions">
          <button type="button" className="button button-secondary button-small" onClick={() => changeMonth(-1)}>
            Previous
          </button>
          <button type="button" className="button button-secondary button-small" onClick={() => changeMonth(1)}>
            Next
          </button>
        </div>
      </div>

      <fieldset className="calendar-filters">
        <legend>Show calendar items</legend>
        {calendarFilters.map((filter) => (
          <label className="calendar-filter" key={filter.type}>
            <input
              type="checkbox"
              checked={activeFilters.includes(filter.type)}
              onChange={() => toggleFilter(filter.type)}
            />
            <span>{filter.label}</span>
          </label>
        ))}
      </fieldset>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="calendar-grid-wrap" aria-busy={isLoading}>
        <table className="calendar-grid" aria-label="Patient calendar">
          <thead>
            <tr>
              {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => (
                <th key={day} scope="col">
                  <span className="calendar-weekday-long">{day}</span>
                  <span className="calendar-weekday-short">{day.slice(0, 3)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: cells.length / 7 }, (_, rowIndex) => (
              <tr key={rowIndex}>
                {cells.slice(rowIndex * 7, rowIndex * 7 + 7).map((date, cellIndex) => {
                  const dayEvents = date
                    ? visibleEvents.filter((event) => sameDay(event.date, date))
                    : [];
                  return (
                    <td key={`${rowIndex}-${cellIndex}`}>
                      {date && (
                        <button
                          type="button"
                          className={[
                            sameDay(date, selectedDate) ? "is-selected" : "",
                            sameDay(date, new Date()) ? "is-today" : "",
                          ].join(" ")}
                          aria-pressed={sameDay(date, selectedDate)}
                          aria-label={`${date.toLocaleDateString([], {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                          onClick={() => setSelectedDate(date)}
                        >
                          <span className="calendar-day-number">{date.getDate()}</span>
                          <span className="calendar-day-events" aria-hidden="true">
                            {dayEvents.slice(0, 3).map((event) => (
                              <span
                                className={`calendar-dot calendar-dot-${event.type}`}
                                key={event.id}
                              />
                            ))}
                          </span>
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="calendar-agenda">
        <h3>
          {selectedDate.toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h3>
        {isLoading ? (
          <div className="inline-state" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p>Loading calendar...</p>
          </div>
        ) : selectedEvents.length === 0 ? (
          <p className="muted-message">No visible calendar items for this day.</p>
        ) : (
          <ol className="calendar-agenda-list">
            {selectedEvents.map((event) => (
              <li className={`calendar-agenda-item calendar-agenda-${event.type}`} key={event.id}>
                <time dateTime={event.date.toISOString()}>{formatDateTime(event.date)}</time>
                <span>
                  <strong>{event.title}</strong>
                  <small>{event.detail}</small>
                </span>
                <span className="calendar-event-status">{formatEnum(event.status)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function PatientGlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTypes, setActiveTypes] = useState<SearchResultType[]>(searchFilters);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const term = query.trim().toLowerCase();
    if (term.length < 2) {
      setResults([]);
      setHasSearched(false);
      setError("Enter at least two characters to search your records.");
      return;
    }

    setIsSearching(true);
    try {
      const [medications, measurements, appointments, history] = await Promise.all([
        medicationService.listPage({ pageSize: 50, search: term }),
        measurementService.listPage({ pageSize: 50 }),
        appointmentService.list(),
        careService.medicalHistory({ period: 90, pageSize: 50 }),
      ]);

      const nextResults: SearchResult[] = [
        ...medications.items.map((medication: Medication) => ({
          id: `medication:${medication.id}`,
          type: "Medication" as const,
          title: medication.name,
          detail: `${medication.dosage} - ${formatEnum(medication.status)}`,
          when: medication.updatedAt ?? medication.startDate,
          to: "/medications",
        })),
        ...measurements.items
          .filter((measurement: Measurement) =>
            `${measurement.type} ${measurement.unit} ${measurement.value} ${measurement.secondaryValue ?? ""}`
              .toLowerCase()
              .includes(term),
          )
          .map((measurement) => ({
            id: `measurement:${measurement.id}`,
            type: "Measurement" as const,
            title: formatEnum(measurement.type),
            detail:
              measurement.secondaryValue === null
                ? `${measurement.value} ${measurement.unit}`
                : `${measurement.value}/${measurement.secondaryValue} ${measurement.unit}`,
            when: measurement.measuredAt,
            to: "/measurements",
          })),
        ...appointments
          .filter((appointment: Appointment) =>
            `${appointment.doctor.user.name} ${appointment.doctor.specialization ?? ""} ${appointment.notes ?? ""}`
              .toLowerCase()
              .includes(term),
          )
          .map((appointment) => ({
            id: `appointment:${appointment.id}`,
            type: "Appointment" as const,
            title: `Dr. ${appointment.doctor.user.name}`,
            detail: appointment.notes || formatEnum(appointment.status),
            when: appointment.appointmentDate,
            to: "/appointments",
          })),
        ...history.items
          .filter((item: MedicalHistoryItem) =>
            `${item.title} ${item.summary} ${item.type} ${item.status ?? ""}`
              .toLowerCase()
              .includes(term),
          )
          .map((item) => ({
            id: `history:${item.type}:${item.id}`,
            type: "Timeline" as const,
            title: item.title,
            detail: item.summary,
            when: item.occurredAt,
            to: "/history",
          })),
      ]
        .sort((first, second) => Date.parse(second.when) - Date.parse(first.when))
        .slice(0, 8);

      setResults(nextResults);
      setHasSearched(true);
      setError(null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not search your records."));
    } finally {
      setIsSearching(false);
    }
  }

  function toggleType(type: SearchResultType): void {
    setActiveTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  }

  const visibleResults = results.filter((result) => activeTypes.includes(result.type));

  return (
    <section className="card data-section" aria-labelledby="patient-search-title">
      <div className="section-heading">
        <p className="eyebrow">Global search</p>
        <h2 id="patient-search-title">Find anything in your record</h2>
        <p>Search medications, readings, visits, and timeline entries.</p>
      </div>
      <form
        className="patient-search-form"
        onSubmit={(event) => void search(event)}
        role="search"
        aria-describedby="patient-search-help"
      >
        <label className="field patient-search-input">
          <span>Search your care record</span>
          <input
            id="patient-global-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Medication, reading, doctor, or note"
            aria-controls="patient-search-results"
          />
        </label>
        <div className="patient-search-actions">
          <button type="submit" className="button button-primary" disabled={isSearching}>
            {isSearching ? "Searching..." : "Search"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setQuery("");
              setResults([]);
              setHasSearched(false);
              setError(null);
            }}
          >
            Clear
          </button>
        </div>
        <small id="patient-search-help" className="field-help">
          Results come from role-scoped backend APIs for your account.
        </small>
      </form>

      <fieldset className="search-type-filter" aria-label="Filter search results by type">
        <legend>Result types</legend>
        {searchFilters.map((type) => (
          <label key={type}>
            <input
              type="checkbox"
              checked={activeTypes.includes(type)}
              onChange={() => toggleType(type)}
            />
            <span>{type}</span>
          </label>
        ))}
      </fieldset>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="sr-only" role="status" aria-live="polite">
        {isSearching
          ? "Searching patient records."
          : hasSearched
            ? `${visibleResults.length} search results available.`
            : ""}
      </div>

      {hasSearched && visibleResults.length === 0 && !error && !isSearching && (
        <p className="muted-message">No matching records found for the current search and filters.</p>
      )}

      {visibleResults.length > 0 && (
        <ol id="patient-search-results" className="search-result-list" aria-label="Search results">
          {visibleResults.map((result) => (
            <li key={result.id}>
              <Link className="search-result-item" to={result.to}>
                <span className="search-result-type">{result.type}</span>
                <span>
                  <strong>{result.title}</strong>
                  <small>{result.detail}</small>
                </span>
                <span className="search-result-meta">{formatDateTime(result.when)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
