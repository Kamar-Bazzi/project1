import DailyCheckInPanel from "../../components/check-ins/DailyCheckInPanel";

export default function CheckInsPage() {
  return (
    <main className="page-shell page-shell-narrow checkins-page">
      <header className="page-heading">
        <p className="eyebrow">Personal health log</p>
        <h1>Daily check-ins</h1>
        <p>
          Record how your day feels and review earlier entries. These answers are
          descriptive and are not a diagnosis or medical score.
        </p>
      </header>
      <DailyCheckInPanel showHistory />
    </main>
  );
}
