import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { alertRuleService } from "../../services/health-alert.service";
import {
  healthMetricPresentation,
  healthMetricTypes,
  type AlertRule,
  type AlertRuleInput,
  type HealthAlertSeverity,
  type HealthMetricType,
} from "../../types/health";

interface RuleDraft {
  metricType: HealthMetricType;
  minimumValue: string;
  maximumValue: string;
  consecutiveReadingsRequired: string;
  severity: HealthAlertSeverity;
  enabled: boolean;
  notifyEmergencyContacts: boolean;
}

const emptyRuleDraft: RuleDraft = {
  metricType: "HEART_RATE",
  minimumValue: "",
  maximumValue: "",
  consecutiveReadingsRequired: "3",
  severity: "WARNING",
  enabled: true,
  notifyEmergencyContacts: false,
};

function draftFromRule(rule: AlertRule): RuleDraft {
  return {
    metricType: rule.metricType,
    minimumValue: rule.minimumValue?.toString() ?? "",
    maximumValue: rule.maximumValue?.toString() ?? "",
    consecutiveReadingsRequired: rule.consecutiveReadingsRequired.toString(),
    severity: rule.severity,
    enabled: rule.enabled,
    notifyEmergencyContacts: rule.notifyEmergencyContacts,
  };
}

function newRuleDraftForRules(rules: AlertRule[]): RuleDraft {
  const availableMetric = healthMetricTypes.find(
    (metricType) => !rules.some((rule) => rule.metricType === metricType),
  );

  return { ...emptyRuleDraft, metricType: availableMetric ?? "HEART_RATE" };
}

export default function AlertRulesPanel() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [draft, setDraft] = useState<RuleDraft>(emptyRuleDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mutationId, setMutationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRules = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const loadedRules = await alertRuleService.list();
      setRules(loadedRules);
      setDraft((current) =>
        loadedRules.some((rule) => rule.metricType === current.metricType)
          ? newRuleDraftForRules(loadedRules)
          : current,
      );
    } catch (loadError) {
      setLoadError(
        getApiErrorMessage(loadError, "We could not load your alert rules."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  function resetForm(): void {
    setDraft(newRuleDraftForRules(rules));
    setEditingId(null);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const minimumValue =
      draft.minimumValue.trim() === "" ? null : Number(draft.minimumValue);
    const maximumValue =
      draft.maximumValue.trim() === "" ? null : Number(draft.maximumValue);
    const consecutiveReadingsRequired = Number(draft.consecutiveReadingsRequired);

    if (minimumValue === null && maximumValue === null) {
      setError("Enter a minimum value, a maximum value, or both.");
      return;
    }
    if (
      (minimumValue !== null && !Number.isFinite(minimumValue)) ||
      (maximumValue !== null && !Number.isFinite(maximumValue))
    ) {
      setError("Alert thresholds must be valid numbers.");
      return;
    }
    if (
      minimumValue !== null &&
      maximumValue !== null &&
      minimumValue >= maximumValue
    ) {
      setError("The minimum threshold must be lower than the maximum threshold.");
      return;
    }
    if (
      !Number.isInteger(consecutiveReadingsRequired) ||
      consecutiveReadingsRequired < 2 ||
      consecutiveReadingsRequired > 100
    ) {
      setError("Required consecutive readings must be a whole number from 2 to 100.");
      return;
    }

    const input: AlertRuleInput = {
      metricType: draft.metricType,
      minimumValue,
      maximumValue,
      consecutiveReadingsRequired,
      severity: draft.severity,
      enabled: draft.enabled,
      notifyEmergencyContacts: draft.notifyEmergencyContacts,
    };

    setIsSaving(true);
    try {
      if (editingId) {
        const updated = await alertRuleService.update(editingId, {
          minimumValue: input.minimumValue,
          maximumValue: input.maximumValue,
          consecutiveReadingsRequired: input.consecutiveReadingsRequired,
          severity: input.severity,
          enabled: input.enabled,
          notifyEmergencyContacts: input.notifyEmergencyContacts,
        });
        const nextRules = rules.map((rule) =>
          rule.id === updated.id ? updated : rule,
        );
        setRules(nextRules);
        setDraft(newRuleDraftForRules(nextRules));
        setSuccess("Alert rule updated.");
      } else {
        const created = await alertRuleService.create(input);
        const nextRules = [...rules, created];
        setRules(nextRules);
        setDraft(newRuleDraftForRules(nextRules));
        setSuccess("Alert rule created.");
      }
      setEditingId(null);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, "We could not save this alert rule."));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleRule(rule: AlertRule): Promise<void> {
    setMutationId(rule.id);
    setError(null);

    try {
      const updated = await alertRuleService.update(rule.id, {
        enabled: !rule.enabled,
      });
      setRules((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (toggleError) {
      setError(getApiErrorMessage(toggleError, "We could not change this alert rule."));
    } finally {
      setMutationId(null);
    }
  }

  async function removeRule(rule: AlertRule): Promise<void> {
    if (!window.confirm(`Delete the ${healthMetricPresentation[rule.metricType].label} alert rule?`)) {
      return;
    }

    setMutationId(rule.id);
    setError(null);
    try {
      await alertRuleService.remove(rule.id);
      const nextRules = rules.filter((item) => item.id !== rule.id);
      setRules(nextRules);
      if (editingId === rule.id) {
        setEditingId(null);
      }
      setDraft(newRuleDraftForRules(nextRules));
    } catch (removeError) {
      setError(getApiErrorMessage(removeError, "We could not delete this alert rule."));
    } finally {
      setMutationId(null);
    }
  }

  const allMetricRulesConfigured =
    editingId === null &&
    healthMetricTypes.every((metricType) =>
      rules.some((rule) => rule.metricType === metricType),
    );

  if (!isLoading && loadError) {
    return (
      <section className="card alert-rules-panel" aria-labelledby="alert-rules-title">
        <div className="section-heading">
          <p className="eyebrow">Personal thresholds</p>
          <h2 id="alert-rules-title">Alert rules</h2>
          <p>
            Alerts describe repeated readings outside ranges you configure. They are not diagnoses.
          </p>
        </div>
        <div className="compact-empty-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <div>
            <h3>Alert rules unavailable</h3>
            <p>{loadError}</p>
            <button
              className="button button-secondary button-small"
              onClick={() => void loadRules()}
            >
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card alert-rules-panel" aria-labelledby="alert-rules-title">
      <div className="section-heading">
        <p className="eyebrow">Personal thresholds</p>
        <h2 id="alert-rules-title">Alert rules</h2>
        <p>
          Alerts describe repeated readings outside ranges you configure. They are not diagnoses.
        </p>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      <form className="alert-rule-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid form-grid-three">
          <label className="field">
            <span>Metric</span>
            <select
              value={draft.metricType}
              disabled={isSaving || editingId !== null}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  metricType: event.target.value as HealthMetricType,
                }))
              }
            >
              {healthMetricTypes.map((metricType) => (
                <option
                  key={metricType}
                  value={metricType}
                  disabled={!editingId && rules.some((rule) => rule.metricType === metricType)}
                >
                  {healthMetricPresentation[metricType].label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Minimum value</span>
            <input
              type="number"
              step="any"
              value={draft.minimumValue}
              disabled={isSaving}
              placeholder="Optional"
              onChange={(event) =>
                setDraft((current) => ({ ...current, minimumValue: event.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Maximum value</span>
            <input
              type="number"
              step="any"
              value={draft.maximumValue}
              disabled={isSaving}
              placeholder="Optional"
              onChange={(event) =>
                setDraft((current) => ({ ...current, maximumValue: event.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Consecutive readings</span>
            <input
              type="number"
              min="2"
              max="100"
              step="1"
              value={draft.consecutiveReadingsRequired}
              disabled={isSaving}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  consecutiveReadingsRequired: event.target.value,
                }))
              }
            />
          </label>

          <label className="field">
            <span>Severity label</span>
            <select
              value={draft.severity}
              disabled={isSaving}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  severity: event.target.value as HealthAlertSeverity,
                }))
              }
            >
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="URGENT">Urgent</option>
            </select>
          </label>

          <div className="rule-checkboxes">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.enabled}
                disabled={isSaving}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              <span>Rule enabled</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.notifyEmergencyContacts}
                disabled={isSaving}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    notifyEmergencyContacts: event.target.checked,
                  }))
                }
              />
              <span>Allow future contact notification</span>
            </label>
          </div>
        </div>

        <p className="form-helper-note">
          At least two consecutive out-of-range readings are required. Contact notification is stored as an opt-in preference, but outbound delivery is not configured in this demo. It never calls emergency services.
        </p>

        <div className="form-actions">
          <button
            className="button button-primary"
            type="submit"
            disabled={isSaving || allMetricRulesConfigured}
          >
            {isSaving
              ? "Saving…"
              : editingId
                ? "Update rule"
                : allMetricRulesConfigured
                  ? "All metrics configured"
                  : "Add rule"}
          </button>
          {editingId && (
            <button className="button button-secondary" type="button" disabled={isSaving} onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="alert-rule-list">
        {isLoading ? (
          <div className="compact-loading" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Loading rules…</span>
          </div>
        ) : rules.length === 0 ? (
          <div className="compact-empty-state">
            <span className="state-icon" aria-hidden="true">±</span>
            <div><h3>No alert rules configured</h3><p>Add a range above when you are ready.</p></div>
          </div>
        ) : (
          rules
            .slice()
            .sort((left, right) => left.metricType.localeCompare(right.metricType))
            .map((rule) => (
              <article className="alert-rule-item" key={rule.id}>
                <div>
                  <div className="badge-row">
                    <h3>{healthMetricPresentation[rule.metricType].label}</h3>
                    <span className={`badge ${rule.enabled ? "badge-completed" : "badge-neutral"}`}>
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span className={`badge badge-severity-${rule.severity.toLowerCase()}`}>
                      {rule.severity}
                    </span>
                  </div>
                  <p>
                    {rule.minimumValue === null ? "No minimum" : `Below ${rule.minimumValue}`}
                    {" · "}
                    {rule.maximumValue === null ? "No maximum" : `Above ${rule.maximumValue}`}
                    {" · "}
                    {rule.consecutiveReadingsRequired} consecutive readings
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    className="button button-ghost button-small"
                    disabled={mutationId === rule.id}
                    onClick={() => void toggleRule(rule)}
                  >
                    {rule.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="button button-secondary button-small"
                    disabled={mutationId === rule.id}
                    onClick={() => {
                      setEditingId(rule.id);
                      setDraft(draftFromRule(rule));
                      setError(null);
                      setSuccess(null);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="button button-danger-ghost button-small"
                    disabled={mutationId === rule.id}
                    onClick={() => void removeRule(rule)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
        )}
      </div>
    </section>
  );
}
