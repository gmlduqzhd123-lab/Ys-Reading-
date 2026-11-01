import { evolution } from "@/lib/growth-terms";
export function CharacterScene({
  species = "rabbit",
  xp = 0,
  accessory = "leaf_pin",
  background = "grove",
  preview = false,
}: {
  species?: string;
  xp?: number;
  accessory?: string | null;
  background?: string;
  preview?: boolean;
}) {
  const animal =
      species === "fox" ? "여우" : species === "owl" ? "부엉이" : "토끼",
    { stage, label } = evolution(xp);
  const room = background === "reading_room" || background === "plum_room",
    night = background === "plum_room" || background === "firefly_garden";
  const coat =
    species === "fox" ? "#d2a080" : species === "owl" ? "#a79aa6" : "#f6f1e8";
  return (
    <div className={`character-scene scene-${background}`}>
      <svg
        viewBox="0 0 320 290"
        role="img"
        aria-label={`${preview ? "미리보기 · " : ""}${label} ${animal}${accessory ? " · 장식 착용" : ""}`}
      >
        <rect
          x="0"
          y="0"
          width="320"
          height="290"
          rx="28"
          fill={night ? "#514557" : room ? "#e8ddd5" : "#e8e9df"}
        />
        {room ? (
          <g stroke={night ? "#9d849d" : "#c1afa5"} strokeWidth="5">
            <path d="M25 42H295M25 94H295M25 145H295" />
            <path
              d="M35 38V10M48 38V15M61 38V12M255 90V54M266 90V60M280 90V53"
              strokeWidth="9"
            />
            <rect
              x="118"
              y="15"
              width="84"
              height="81"
              rx="30"
              fill={night ? "#d8c5ae" : "#f8f1db"}
              strokeWidth="2"
            />
          </g>
        ) : (
          <g fill={night ? "#788377" : "#bbc6ae"}>
            <ellipse cx="30" cy="145" rx="40" ry="92" />
            <ellipse cx="296" cy="140" rx="45" ry="100" />
            <ellipse
              cx="160"
              cy="278"
              rx="150"
              ry="52"
              fill={night ? "#5c675b" : "#d6ddc9"}
            />
            {night &&
              [40, 76, 245, 280, 222].map((x, i) => (
                <circle key={x} cx={x} cy={40 + i * 22} r="3" fill="#e8dd9f" />
              ))}
          </g>
        )}
        <ellipse
          cx="160"
          cy="264"
          rx="72"
          ry="10"
          fill="#302933"
          opacity=".12"
        />
        <g
          transform={`translate(160 168) scale(${0.82 + stage * 0.045})`}
          stroke="#685965"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <ellipse cx="0" cy="48" rx="48" ry="54" fill={coat} />
          <ellipse cx="-28" cy="91" rx="23" ry="10" fill={coat} />
          <ellipse cx="29" cy="91" rx="23" ry="10" fill={coat} />
          {species === "rabbit" ? (
            <>
              <ellipse
                cx="-24"
                cy="-74"
                rx="15"
                ry="45"
                transform="rotate(-10 -24 -74)"
                fill={coat}
              />
              <ellipse
                cx="24"
                cy="-74"
                rx="15"
                ry="45"
                transform="rotate(10 24 -74)"
                fill={coat}
              />
              <path d="M-25-99v44M25-99v44" stroke="#d7b2b6" strokeWidth="8" />
            </>
          ) : species === "fox" ? (
            <>
              <path d="M-49-30L-48-91-8-48M49-30L48-91 8-48" fill={coat} />
              <path
                d="M-39-45L-40-73-20-47M39-45L40-73 20-47"
                fill="#f1d7cf"
                stroke="none"
              />
            </>
          ) : (
            <path d="M-48-18L-51-69-22-49Q0-62 22-49L51-69 48-18" fill={coat} />
          )}
          <ellipse cy="-23" rx="54" ry="47" fill={coat} />
          {species === "owl" ? (
            <>
              <ellipse
                cx="-22"
                cy="-21"
                rx="23"
                ry="25"
                fill="#f6f1e8"
                stroke="none"
              />
              <ellipse
                cx="22"
                cy="-21"
                rx="23"
                ry="25"
                fill="#f6f1e8"
                stroke="none"
              />
            </>
          ) : species === "fox" ? (
            <path
              d="M-51-22Q-29 4 0 10Q29 4 51-22L30 17Q0 31-30 17Z"
              fill="#f6f1e8"
              stroke="none"
            />
          ) : null}
          <path d="M-22-26v5M22-26v5" strokeWidth="5" />
          <path d="M-4-10L0-6 4-10M0-6v5m-7 0q7 7 14 0" fill="none" />
          <circle
            cx="-35"
            cy="-8"
            r="7"
            fill="#d3a5aa"
            opacity=".6"
            stroke="none"
          />
          <circle
            cx="35"
            cy="-8"
            r="7"
            fill="#d3a5aa"
            opacity=".6"
            stroke="none"
          />
          {stage >= 2 && (
            <path
              d="M-33 31L0 39 33 31V72L0 82-33 72Z"
              fill={stage >= 3 ? "#88718a" : "#a8b49a"}
            />
          )}
          {stage >= 3 && (
            <path
              d="M0 39v43M-25 42l17 4m-17 8l17 4m17-12l17-4m-17 16l17-4"
              stroke="#e9e1d5"
              strokeWidth="1.5"
            />
          )}
          <ellipse
            cx="-39"
            cy="49"
            rx="12"
            ry="19"
            transform="rotate(-15 -39 49)"
            fill={coat}
          />
          <ellipse
            cx="39"
            cy="49"
            rx="12"
            ry="19"
            transform="rotate(15 39 49)"
            fill={coat}
          />
          {stage === 4 && (
            <g fill="#e5cca0">
              <path d="M66 14l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
              <path d="M-68-54l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
            </g>
          )}
          {accessory === "leaf_pin" && (
            <path
              d="M-35 27q-20-18-8-25 19 0 8 25zm0 0q17-19 23-9-1 12-23 9"
              fill="#8b9d7c"
            />
          )}
          {accessory === "round_glasses" && (
            <g fill="none" stroke="#725d70" strokeWidth="3">
              <circle cx="-22" cy="-24" r="16" />
              <circle cx="22" cy="-24" r="16" />
              <path d="M-6-24H6M-38-24h-13M38-24h13" />
            </g>
          )}
          {accessory === "star_crown" && (
            <path d="M-33-64l-7-24 23 9L0-99 17-79l23-9-7 24z" fill="#dfc28c" />
          )}
          {accessory === "striped_scarf" && (
            <>
              <path
                d="M-38 12q38 15 76 0v15q-38 15-76 0zM18 30l19 2-5 36-17-6z"
                fill="#88677d"
              />
              <path
                d="M-27 17v13m17-8v12m17-11v12m18-14v11M18 44l17 4m-19 7l17 5"
                stroke="#dfcec1"
                strokeWidth="4"
              />
            </>
          )}
          {accessory === "author_hat" && (
            <>
              <path d="M-40-67q-5-35 40-35t40 35z" fill="#716473" />
              <ellipse cy="-65" rx="50" ry="7" fill="#716473" />
              <path d="M27-85q5-29 22-29-2 20-22 29" fill="#e4cdae" />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
