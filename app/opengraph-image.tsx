import { ImageResponse } from "next/og";

// The card every shared link renders. Same console language as the arena.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "DJbench, a benchmark for taste. Language models pick DJ sets and you vote blind.";

const BASE = "#0a0a0b";
const INK = "#ececef";
const MUTED = "#8b8b95";
const DIM = "#5c5c66";
const HAIR = "#2a2a31";
const CH_A = "#d6f94a";
const CH_B = "#4ad9f9";

/** Google serves TTF when no modern browser UA is present, which is what Satori needs. */
async function grotesk(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@${weight}`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\((.+?)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

// A deterministic two-channel waveform, drawn the way the decks draw one.
function bars(seed: number, n: number) {
  let h = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    const arc = 0.45 + 0.55 * Math.sin((Math.PI * i) / n);
    out.push(Math.max(8, Math.round(arc * (0.5 + ((h % 1000) / 1000) * 0.6) * 100)));
  }
  return out;
}

export default async function Image() {
  const [regular, bold] = await Promise.all([grotesk(400), grotesk(700)]);
  const fonts = [
    ...(regular ? [{ name: "Grotesk", data: regular, weight: 400 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Grotesk", data: bold, weight: 700 as const, style: "normal" as const }] : []),
  ];
  const family = fonts.length ? "Grotesk" : "sans-serif";

  const a = bars(0x9e3779b1, 44);
  const b = bars(0x7f4a7c15, 44);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BASE,
          fontFamily: family,
          padding: 64,
        }}
      >
        {/* top rail */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ fontSize: 34, fontWeight: 700, color: INK, letterSpacing: -1 }}>DJbench</div>
            <div style={{ fontSize: 17, color: DIM, letterSpacing: 3 }}>SIX MODELS. ONE DANCEFLOOR.</div>
          </div>
          <div style={{ fontSize: 17, color: DIM, letterSpacing: 3 }}>BLIND A / B</div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, color: INK, letterSpacing: -3.5, lineHeight: 1.02 }}>
            A benchmark for taste.
          </div>
          <div style={{ fontSize: 29, color: MUTED, marginTop: 20, maxWidth: 900, lineHeight: 1.35 }}>
            Language models get the same crowd and the same room, then pick a real setlist.
            You hear two blind and vote on who read the room.
          </div>
        </div>

        {/* two decks and the crossfader between them */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 26, height: 128 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, height: 108, overflow: "hidden" }}>
            {a.map((v, i) => (
              <div key={i} style={{ width: 5, height: v, background: CH_A, opacity: i < 26 ? 1 : 0.22 }} />
            ))}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              paddingLeft: 26,
              paddingRight: 26,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 15, color: DIM, letterSpacing: 3 }}>CROSSFADER</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                width: 150,
                height: 30,
                background: "#191920",
                border: `1px solid ${HAIR}`,
              }}
            >
              <div style={{ width: 46, height: 30, background: "#4a4a54" }} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, height: 108, overflow: "hidden" }}>
            {b.map((v, i) => (
              <div key={i} style={{ width: 5, height: v, background: CH_B, opacity: i < 15 ? 1 : 0.22 }} />
            ))}
          </div>
        </div>

        {/* bottom rail */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${HAIR}`,
            paddingTop: 26,
          }}
        >
          <div style={{ fontSize: 21, color: MUTED }}>
            Gemini · GPT-OSS · DeepSeek · Qwen · Claude
          </div>
          <div style={{ fontSize: 21, color: CH_A }}>djbench.vercel.app</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
