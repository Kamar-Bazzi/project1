interface RoleDashboardProps {
  label: string;
  title: string;
  description: string;
}

export default function RoleDashboard({
  label,
  title,
  description,
}: RoleDashboardProps) {
  return (
    <main className="role-landing-page">
      <section className="role-landing-card">
        <p className="dashboard-label">{label}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
    </main>
  );
}
