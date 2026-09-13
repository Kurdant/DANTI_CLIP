interface RangeFieldProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  suffix?: string;
  disabled?: boolean;
  title?: string;
  onChange: (v: number) => void;
}

/** Slider labellise (meme style que les controles Vitesse/Hauteur). */
export function RangeField({ label, min, max, step, value, suffix = "", disabled, title, onChange }: RangeFieldProps) {
  return (
    <label
      title={title}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "rgba(245,237,247,.7)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "default",
      }}
    >
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span style={{ minWidth: 38, textAlign: "right" }}>{value}{suffix}</span>
    </label>
  );
}