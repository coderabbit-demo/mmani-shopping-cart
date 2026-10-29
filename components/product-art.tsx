import type { Art } from "../lib/catalog";

export function ProductArt({ art }: { art: Art }) {
  return (
    <svg viewBox="0 0 320 250" fill="none" className={`product-art art-${art}`} aria-hidden="true">
      <ellipse cx="160" cy="214" rx="98" ry="12" fill="var(--art-shadow)" />
      <g stroke="var(--art-detail)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {art === "lamp" && <>
          <path d="M137 204h66l-9-10h-50z" fill="var(--art-detail)" />
          <path d="M169 194v-66l-47-42" strokeWidth="8" />
          <circle cx="169" cy="131" r="8" fill="var(--art-accent)" />
          <path d="M85 100c-10-28 4-52 26-52s43 18 44 43z" fill="var(--art-primary)" />
          <path d="m86 101 69-10" stroke="var(--art-accent)" strokeWidth="7" />
          <path d="m104 119-12 20m38-22 1 24m-54-16-14 10" stroke="var(--art-accent)" />
        </>}
        {art === "keyboard" && <>
          <path d="m48 115 208-22 24 87-209 26z" fill="var(--art-detail)" />
          <path d="m48 106 208-22 24 87-209 26z" fill="var(--art-body)" />
          {[0, 1, 2, 3].map((row) => <g key={row}>{Array.from({ length: 9 }, (_, col) => <path key={col} d={`m${63 + col * 20 + row * 5} ${116 + row * 17 - col * 2.2} 14-1.5 3 10-14 1.5z`} fill={col === 0 || col === 8 ? "var(--art-primary)" : "var(--art-bg)"} strokeWidth="1" />)}</g>)}
          <path d="m119 175 92-10 3 10-92 10z" fill="var(--art-accent)" strokeWidth="1" />
        </>}
        {art === "headphones" && <>
          <path d="M90 145v-28a70 70 0 0 1 140 0v28" stroke="var(--art-body)" strokeWidth="22" />
          <path d="M90 130v-13a70 70 0 0 1 140 0v13" strokeWidth="5" />
          <rect x="74" y="127" width="38" height="68" rx="18" fill="var(--art-primary)" transform="rotate(-12 74 127)" />
          <rect x="211" y="119" width="38" height="68" rx="18" fill="var(--art-primary)" transform="rotate(12 211 119)" />
          <path d="m91 144 8 34m125-34-8 34" stroke="var(--art-accent)" strokeWidth="6" />
        </>}
        {art === "plant" && <>
          <path d="M162 150V77" strokeWidth="6" />
          <path d="M161 119c-42 1-61-23-52-49 30 0 53 18 52 49zM162 101c-3-34 13-55 38-54 10 28-8 50-38 54zM162 143c4-36 29-52 51-44 2 26-18 47-51 44z" fill="var(--art-accent)" />
          <path d="m120 146 10 59q30 13 60 0l10-59z" fill="var(--art-primary)" />
          <ellipse cx="160" cy="146" rx="40" ry="9" fill="var(--art-body)" />
          <path d="m141 162 5 33m15-32v36m19-37-4 33" stroke="var(--art-highlight)" />
        </>}
        {art === "stand" && <>
          <path d="m85 179 97-30 55 37-94 31z" fill="var(--art-body)" />
          <path d="m141 185 16-63 34-11-15 65" fill="var(--art-primary)" />
          <path d="m68 105 149-39 39 57-152 43z" fill="var(--art-body)" />
          <path d="m88 105 121-31 27 39-123 34z" fill="var(--art-bg)" />
          <path d="m104 166 5 9 151-43-4-9" fill="var(--art-accent)" />
        </>}
        {art === "mat" && <>
          <path d="m43 126 170-47 74 82-169 54z" fill="var(--art-primary)" />
          <path d="m52 128 159-43 64 73-155 49z" stroke="var(--art-highlight)" strokeDasharray="3 5" />
          <path d="m80 132 95-25 31 34-94 27z" fill="var(--art-body)" />
          <path d="m215 141 15-4 11 12-16 5z" fill="var(--art-accent)" />
          <path d="m119 143 53-14m-62 4 52-14m-32 36 52-14" />
        </>}
        {art === "organizer" && <>
          <path d="m91 135 103-31 43 36-105 34z" fill="var(--art-body)" />
          <path d="m91 135 41 39v37l-41-39z" fill="var(--art-primary)" />
          <path d="m132 174 105-34v37l-105 34z" fill="var(--art-primary)" />
          <path d="m119 144 65-20 24 19-66 22z" fill="var(--art-bg)" />
          <path d="m116 140-5-59m24 53 7-67m9 62 18-48" stroke="var(--art-accent)" strokeWidth="8" />
          <path d="m181 159 38-12" stroke="var(--art-highlight)" />
        </>}
        {art === "clock" && <>
          <path d="m118 200-8 13m92-13 8 13" strokeWidth="8" />
          <circle cx="160" cy="131" r="76" fill="var(--art-primary)" />
          <circle cx="160" cy="131" r="63" fill="var(--art-body)" />
          <path d="M160 80v9m0 84v9m-51-51h9m84 0h9" />
          <path d="M160 96v35l29 18" strokeWidth="5" />
          <circle cx="160" cy="131" r="5" fill="var(--art-accent)" />
        </>}
      </g>
    </svg>
  );
}
