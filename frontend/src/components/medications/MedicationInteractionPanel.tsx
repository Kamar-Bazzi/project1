import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { medicationService } from "../../services/medication.service";
import type {
  MedicationInteractionReview,
  MedicationInteractionSource,
} from "../../types/medication";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString([], { dateStyle: "medium" });
}

function sourceLabel(source: MedicationInteractionSource): string {
  return source.name || source.title || source.id;
}

export default function MedicationInteractionPanel({
  medicationRevision,
}: {
  medicationRevision: string;
}) {
  const [review, setReview] = useState<MedicationInteractionReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const nextReview = await medicationService.interactions();
      if (requestId.current === currentRequestId) {
        setReview(nextReview);
      }
    } catch (requestError) {
      if (requestId.current === currentRequestId) {
        setError(
          getApiErrorMessage(
            requestError,
            "Possible medication interactions could not be checked right now.",
          ),
        );
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load, medicationRevision]);

  return (
    <section className="card medication-interaction-panel" aria-labelledby="interaction-review-title">
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">Reference-data review</p>
          <h2 id="interaction-review-title">Possible medication interactions</h2>
          <p>
            Reference matches are flags for professional review. They are not a
            diagnosis and do not mean you should change treatment.
          </p>
        </div>
        {!isLoading && (
          <button type="button" className="button button-secondary button-small" onClick={() => void load()}>
            Check again
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="interaction-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Comparing mapped medications with the reference data…</p>
        </div>
      ) : error ? (
        <div className="interaction-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <h3>Interaction review unavailable</h3>
          <p>{error}</p>
          <button type="button" className="button button-secondary button-small" onClick={() => void load()}>Try again</button>
        </div>
      ) : review ? (
        <>
          {review.warnings.length === 0 ? (
            <div className="interaction-clear-state">
              <span className="state-icon" aria-hidden="true">✓</span>
              <div>
                <h3>No reference flags among mapped medications</h3>
                <p>This does not prove that no interaction exists. A pharmacist or doctor can review your complete medication list.</p>
              </div>
            </div>
          ) : (
            <div className="interaction-warning-list">
              {review.warnings.map((warning, index) => {
                const sources = review.reference.sources.filter((source) =>
                  warning.sourceIds.includes(source.id),
                );
                return (
                  <article key={`${warning.medications.map((item) => item.id).join(":")}:${index}`}>
                    <div className="interaction-warning-heading">
                      <span className="interaction-warning-icon" aria-hidden="true">!</span>
                      <div>
                        <span className="badge badge-pending">Possible interaction</span>
                        <h3>{warning.medications.map((item) => item.name).join(" + ")}</h3>
                      </div>
                    </div>
                    <p>{warning.summary}</p>
                    <p className="interaction-review-guidance"><strong>Review guidance:</strong> {warning.reviewRecommendation}</p>
                    {sources.length > 0 && (
                      <div className="interaction-sources">
                        <strong>Reference source{sources.length === 1 ? "" : "s"}:</strong>{" "}
                        {sources.map((source, sourceIndex) => (
                          <span key={source.id}>
                            {source.url ? (
                              <a href={source.url} target="_blank" rel="noreferrer">{sourceLabel(source)}</a>
                            ) : sourceLabel(source)}
                            {sourceIndex < sources.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {review.unmatchedMedications.length > 0 && (
            <div className="interaction-unmatched-note">
              <strong>Reference match unavailable:</strong>{" "}
              {review.unmatchedMedications.map((item) => item.name).join(", ")}.
              These medications were not included in the automated comparison and still need professional review.
            </div>
          )}

          <div className="interaction-reference-note">
            <span>
              Reference: <strong>{review.reference.name}</strong>, version {review.reference.version}
              {review.reference.publishedAt ? ` · published ${formatDate(review.reference.publishedAt)}` : ""}
              {review.checkedAt ? ` · checked ${formatDate(review.checkedAt)}` : ""}
            </span>
            <p><strong>Safety note.</strong> {review.disclaimer}</p>
          </div>
        </>
      ) : null}
    </section>
  );
}
