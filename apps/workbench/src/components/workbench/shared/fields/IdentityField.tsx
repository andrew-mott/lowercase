type Props = {
  label: string;
  value?: string;
};

export function IdentityField({ label, value }: Props) {
  if (value === undefined) return null;
  return (
    <div>
      <h3 className="text-xs font-medium text-neutral-400">{label}</h3>
      <p className="text-xs font-mono break-all">{value}</p>
    </div>
  );
}
