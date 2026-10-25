export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 2 2" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="0" y="0" width=".92" height=".92" rx=".14" fill="var(--p0)" />
      <rect x="1.08" y="1.08" width=".92" height=".92" rx=".14" fill="var(--p1)" />
      <rect x="1.08" y="0" width=".92" height=".92" rx=".14" fill="var(--line)" />
      <rect x="0" y="1.08" width=".92" height=".92" rx=".14" fill="var(--line)" />
    </svg>
  );
}
