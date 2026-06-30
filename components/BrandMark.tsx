// The cobbld mark: three offset rounded squares ("cobble together"). Colors are
// drawn from theme tokens — the lead square inherits the surrounding text color
// (currentColor) and the two accent squares use --acc — so the mark adapts to
// light/dark automatically. `onInk` is retained for call-site compatibility but
// no longer changes the output.
export function BrandMark({ onInk = false }: { onInk?: boolean }) {
  void onInk;
  return (
    <svg viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="9" width="9" height="9" rx="2" fill="currentColor" />
      <rect x="11" y="14" width="9" height="9" rx="2" fill="var(--acc)" opacity="0.55" />
      <rect x="11" y="3" width="9" height="9" rx="2" fill="var(--acc)" opacity="0.85" />
    </svg>
  );
}
