import { CompanyStatus, STATUS_LABELS, STATUS_COLORS } from '@/types';

export default function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as CompanyStatus] ?? status;
  const color = STATUS_COLORS[status as CompanyStatus] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
