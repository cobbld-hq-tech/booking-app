// The cobbld mark: three offset rounded squares ("cobble together"). On ink
// backgrounds the lead square flips to bone so it stays legible.
export function BrandMark({ onInk = false }: { onInk?: boolean }) {
  const base = onInk ? "#f2efe9" : "#11100d";
  return (
    <svg viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="9" width="9" height="9" rx="2" fill={base} />
      <rect x="11" y="14" width="9" height="9" rx="2" fill="#ff5b1e" opacity="0.55" />
      <rect x="11" y="3" width="9" height="9" rx="2" fill="#ff5b1e" opacity="0.85" />
    </svg>
  );
}
