"use client";

/* The bar shape is a stable signature derived from the track identity (computed in
   scripts/compile.mjs), not an analysis of the audio: a cross-origin YouTube iframe
   exposes no audio buffer. The playhead, however, is real playback position. */
export function Waveform({
  wave,
  progress,
  color,
  active,
}: {
  wave: number[];
  progress: number;
  color: string;
  active: boolean;
}) {
  const played = Math.round(progress * wave.length);
  return (
    <svg
      viewBox={`0 0 ${wave.length * 3} 100`}
      preserveAspectRatio="none"
      className="h-20 w-full"
      aria-hidden="true"
    >
      {wave.map((v, i) => {
        const on = i <= played;
        const h = Math.max(3, v);
        return (
          <rect
            key={i}
            x={i * 3}
            y={50 - h / 2}
            width={2}
            height={h}
            fill={on ? color : "#33333c"}
            opacity={on ? (active ? 1 : 0.55) : 0.75}
          />
        );
      })}
      <rect x={played * 3} y={0} width={1.5} height={100} fill="#ffffff" opacity={active ? 0.95 : 0.3} />
    </svg>
  );
}
