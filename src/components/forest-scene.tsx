export function ForestScene({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={compact ? "forest-scene compact" : "forest-scene"}
      viewBox="0 0 560 340"
      role="img"
      aria-label="열린 책 위로 자라는 나무와 작은 독서 오두막"
    >
      <circle cx="318" cy="145" r="125" fill="#d9e8ce" />
      <circle cx="410" cy="73" r="28" fill="#fbf1c4" />
      <path d="M45 276Q127 207 238 247T535 260L535 330H45Z" fill="#c0d5b5" />
      <ellipse cx="292" cy="302" rx="218" ry="24" fill="#afc6a3" opacity=".5" />
      <path
        d="M118 251Q197 228 285 258Q372 228 455 251V292Q371 271 285 306Q202 271 118 292Z"
        fill="#527457"
      />
      <path
        d="M125 245Q205 220 285 252Q369 220 447 245V282Q366 262 285 295Q206 262 125 282Z"
        fill="#fffdf3"
      />
      <path
        d="M285 252V295M141 255Q213 238 272 261M141 266Q213 249 272 272M300 261Q369 238 430 255M300 273Q369 250 430 267"
        stroke="#d2d5b8"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M156 253V132"
        stroke="#7b6950"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path d="M156 72L104 159H124L96 202H216L189 159H208Z" fill="#507b57" />
      <path
        d="M156 82V198M156 135L137 119M156 171L185 151"
        stroke="#365e41"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M409 248V142"
        stroke="#7b6950"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <ellipse cx="409" cy="129" rx="44" ry="62" fill="#8ba978" />
      <path
        d="M409 101V215M409 157L388 137M409 179L429 156"
        stroke="#66845b"
        strokeWidth="3"
        fill="none"
      />
      <path d="M233 171L285 126L338 171V253H233Z" fill="#e6cba0" />
      <path
        d="M220 176L285 119L350 176L339 187L285 141L230 187Z"
        fill="#bd7452"
      />
      <path d="M264 254V211A21 21 0 0 1 306 211V254" fill="#57745d" />
      <circle cx="295" cy="230" r="3" fill="#f0dfb4" />
      <rect x="247" y="174" width="25" height="26" rx="3" fill="#fff3cf" />
      <path d="M259.5 174V200M247 187H272" stroke="#a58f6b" strokeWidth="3" />
      <rect x="303" y="174" width="23" height="26" rx="3" fill="#fff3cf" />
      <path d="M314.5 174V200M303 187H326" stroke="#a58f6b" strokeWidth="3" />
      <path
        d="M342 256V226M342 239Q315 232 323 216Q345 215 342 239M342 244Q365 237 362 221Q342 220 342 244"
        stroke="#6b8a50"
        strokeWidth="3"
        fill="#8eaa69"
      />
      <rect x="335" y="247" width="16" height="17" rx="4" fill="#c98c65" />
      <path d="M93 227Q84 207 93 196Q109 204 105 221" fill="#d8ac6b" />
      <circle cx="102" cy="218" r="13" fill="#d8ac6b" />
      <circle cx="106" cy="216" r="2" fill="#394d3a" />
      <path d="M113 218L123 222L113 226Z" fill="#9c6446" />
      <path
        d="M104 230L106 238M96 229L96 238"
        stroke="#9c6446"
        strokeWidth="2"
      />
      <path
        d="M213 83L217 73L222 83L232 87L222 92L217 102L213 92L203 87Z"
        fill="#b2c49a"
      />
      <path
        d="M465 182L468 175L471 182L478 185L471 188L468 195L465 188L458 185Z"
        fill="#9ab68a"
      />
      <path
        d="M284 62Q294 53 304 62M300 69Q310 60 320 69"
        stroke="#77966c"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
