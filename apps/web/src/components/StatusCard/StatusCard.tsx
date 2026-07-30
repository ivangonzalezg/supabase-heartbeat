import './StatusCard.css';

export interface StatusCardProps {
  title: string;
  status: string;
}

export function StatusCard({ title, status }: StatusCardProps) {
  return (
    <section className="status-card">
      <h2>{title}</h2>
      <p>{status}</p>
    </section>
  );
}
