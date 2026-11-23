import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DeviceSelect({
  label,
  icon: Icon,
  devices,
  value,
  onChange,
  emptyLabel,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  devices: MediaDeviceInfo[];
  value: string | undefined;
  onChange: (id: string) => void;
  emptyLabel: string;
}) {
  const known = devices.some((d) => d.deviceId === value);
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </span>
      <Select value={known && value ? value : ""} onValueChange={onChange} disabled={!devices.length}>
        <SelectTrigger className="h-10 w-full bg-background/60" aria-label={label}>
          <SelectValue placeholder={devices.length ? "System default" : emptyLabel} />
        </SelectTrigger>
        <SelectContent>
          {devices.map((d, i) => (
            <SelectItem key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
