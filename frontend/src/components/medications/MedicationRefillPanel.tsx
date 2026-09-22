import { type FormEvent, useState } from "react";
import {
  isMedicationLowSupply,
  type Medication,
  type MedicationRefillInput,
} from "../../types/medication";

interface RefillDraft {
  remainingQuantity: string;
  quantityUnit: string;
  lowQuantityThreshold: string;
  nextRefillDate: string;
  pharmacyName: string;
}

function draftFromMedication(medication: Medication): RefillDraft {
  return {
    remainingQuantity:
      medication.remainingQuantity === null ||
      medication.remainingQuantity === undefined
        ? ""
        : String(medication.remainingQuantity),
    quantityUnit: medication.quantityUnit ?? "",
    lowQuantityThreshold:
      medication.lowQuantityThreshold === null ||
      medication.lowQuantityThreshold === undefined
        ? ""
        : String(medication.lowQuantityThreshold),
    nextRefillDate: medication.nextRefillDate?.slice(0, 10) ?? "",
    pharmacyName: medication.pharmacyName ?? "",
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function MedicationRefillPanel({
  medication,
  mutationKey,
  onUpdate,
}: {
  medication: Medication;
  mutationKey: string | null;
  onUpdate: (medicationId: string, input: MedicationRefillInput) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFromMedication(medication));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isLow = isMedicationLowSupply(medication);
  const isBusy = mutationKey === `refill:${medication.id}`;
  const hasRefillDetails =
    medication.remainingQuantity !== null && medication.remainingQuantity !== undefined
    || medication.lowQuantityThreshold !== null && medication.lowQuantityThreshold !== undefined
    || Boolean(medication.quantityUnit?.trim())
    || Boolean(medication.nextRefillDate)
    || Boolean(medication.pharmacyName?.trim());

  function beginEditing(): void {
    setDraft(draftFromMedication(medication));
    setError(null);
    setMessage(null);
    setIsEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const remainingQuantity = draft.remainingQuantity === ""
      ? null
      : Number(draft.remainingQuantity);
    const lowQuantityThreshold = draft.lowQuantityThreshold === ""
      ? null
      : Number(draft.lowQuantityThreshold);

    if (remainingQuantity !== null && (!Number.isFinite(remainingQuantity) || remainingQuantity < 0)) {
      setError("Remaining quantity must be zero or greater.");
      return;
    }
    if (lowQuantityThreshold !== null && (!Number.isFinite(lowQuantityThreshold) || lowQuantityThreshold < 0)) {
      setError("Low-supply warning level must be zero or greater.");
      return;
    }
    if (remainingQuantity !== null && !draft.quantityUnit.trim()) {
      setError("Add a unit such as tablets, doses, or mL.");
      return;
    }

    const succeeded = await onUpdate(medication.id, {
      remainingQuantity,
      quantityUnit: draft.quantityUnit.trim() || null,
      lowQuantityThreshold,
      nextRefillDate: draft.nextRefillDate || null,
      pharmacyName: draft.pharmacyName.trim() || null,
    });
    if (succeeded) {
      setIsEditing(false);
      setError(null);
      setMessage("Refill details updated.");
    }
  }

  return (
    <section className={`medication-refill-panel${isLow ? " is-low" : ""}`} aria-labelledby={`refill-${medication.id}`}>
      <div className="medication-refill-heading">
        <div>
          <p className="eyebrow">Supply & refill</p>
          <h3 id={`refill-${medication.id}`}>Medication supply</h3>
        </div>
        <div className="row-actions">
          {isLow && <span className="badge badge-pending">Running low</span>}
          {!isEditing && (
            <button type="button" className="button button-ghost button-small" disabled={mutationKey !== null} onClick={beginEditing}>
              {hasRefillDetails ? "Update" : "Track supply"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <p className="refill-success" role="status">{message}</p>}

      {isEditing ? (
        <form className="refill-form" onSubmit={save}>
          <div className="refill-form-grid">
            <label className="field">
              <span>Remaining quantity <small>(optional)</small></span>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.remainingQuantity} disabled={isBusy} placeholder="e.g. 12" onChange={(event) => setDraft((current) => ({ ...current, remainingQuantity: event.target.value }))} />
            </label>
            <label className="field">
              <span>Quantity unit</span>
              <input value={draft.quantityUnit} maxLength={40} disabled={isBusy} placeholder="e.g. tablets" onChange={(event) => setDraft((current) => ({ ...current, quantityUnit: event.target.value }))} />
            </label>
            <label className="field">
              <span>Warn me at <small>(optional)</small></span>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.lowQuantityThreshold} disabled={isBusy} placeholder="e.g. 5" onChange={(event) => setDraft((current) => ({ ...current, lowQuantityThreshold: event.target.value }))} />
            </label>
            <label className="field">
              <span>Next refill date <small>(optional)</small></span>
              <input type="date" value={draft.nextRefillDate} disabled={isBusy} onChange={(event) => setDraft((current) => ({ ...current, nextRefillDate: event.target.value }))} />
            </label>
            <label className="field field-wide">
              <span>Pharmacy <small>(optional)</small></span>
              <input value={draft.pharmacyName} maxLength={160} disabled={isBusy} placeholder="Pharmacy name" onChange={(event) => setDraft((current) => ({ ...current, pharmacyName: event.target.value }))} />
            </label>
          </div>
          <div className="form-actions">
            <button className="button button-primary button-small" type="submit" disabled={isBusy}>{isBusy ? "Saving…" : "Save refill details"}</button>
            <button className="button button-ghost button-small" type="button" disabled={isBusy} onClick={() => { setIsEditing(false); setError(null); }}>Cancel</button>
          </div>
        </form>
      ) : hasRefillDetails ? (
        <>
          <dl className="refill-detail-grid">
            <div>
              <dt>Remaining</dt>
              <dd>
                {medication.remainingQuantity !== null && medication.remainingQuantity !== undefined
                  ? `${medication.remainingQuantity} ${medication.quantityUnit || "units"}`
                  : "Not set"}
              </dd>
            </div>
            <div><dt>Low-supply warning</dt><dd>{medication.lowQuantityThreshold ?? "Not set"}{medication.lowQuantityThreshold !== null && medication.lowQuantityThreshold !== undefined ? ` ${medication.quantityUnit || "units"}` : ""}</dd></div>
            <div><dt>Next refill</dt><dd>{formatDate(medication.nextRefillDate)}</dd></div>
            <div><dt>Pharmacy</dt><dd>{medication.pharmacyName || "Not set"}</dd></div>
          </dl>
          {isLow && (
            <p className="refill-warning" role="status">
              <span aria-hidden="true">!</span>
              {medication.lowSupplyWarning || "Your recorded supply is at or below your warning level. Consider arranging a refill."}
            </p>
          )}
        </>
      ) : (
        <p className="muted-message">Remaining quantity and refill details are not being tracked yet.</p>
      )}
    </section>
  );
}
