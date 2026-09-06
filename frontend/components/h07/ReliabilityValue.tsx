import Badge from "@/components/ui/Badge";

interface ReliabilityValueProps {
  percent: string | null;
  belowThreshold: boolean;
}

export default function ReliabilityValue({
  percent,
  belowThreshold,
}: ReliabilityValueProps) {
  if (percent === null) {
    return <Badge variant="neutral">Brak danych</Badge>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-h4 font-black tabular-nums text-ink">
        {percent}%
      </span>
      {belowThreshold ? (
        <Badge variant="danger">Poniżej progu</Badge>
      ) : (
        <Badge variant="success">W normie</Badge>
      )}
    </div>
  );
}
