import { memo } from 'react';

interface ThumbProps {
  n: number;
  /** ownerString(): '0'/'1' = filled by that player, '.' = blank. Omit to show an unsolved placeholder. */
  owners?: string | null;
  label?: string;
}

/** Small SVG picture of a puzzle. Filled cells use the color of whoever filled them. */
export const Thumb = memo(function Thumb({ n, owners, label }: ThumbProps) {
  const rects = [];
  for (let i = 0; i < n * n; i++) {
    const x = i % n;
    const y = Math.floor(i / n);
    const c = owners ? owners[i] : null;
    if (c === '0' || c === '1') {
      rects.push(<rect key={i} x={x} y={y} width="1.02" height="1.02" fill={`var(--p${c})`} />);
    } else if (!owners) {
      rects.push(<rect key={i} x={x + 0.1} y={y + 0.1} width=".8" height=".8" rx=".12" fill="var(--line)" />);
    }
  }
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect width={n} height={n} fill="var(--paper)" />
      {rects}
    </svg>
  );
});
