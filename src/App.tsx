import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { WORDS } from "./words";

const TARGET = "nina";
const STARTERS = [
  "zone",
  "fire",
  "sing",
  "love",
  "home",
  "time",
  "vote",
  "bird",
  "word",
  "king",
  "dark",
  "cold",
  "cook",
  "last",
  "game",
  "jump",
  "rude",
];
const MAX_GUESSES = 5; // 5 guesses + the final step into NINA = ladders of at most 6 steps
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const DICT = new Set<string>([...WORDS, TARGET]);

const diff = (a: string, b: string) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

const neighbors = (w: string) => {
  const out: string[] = [];
  for (let i = 0; i < 4; i++)
    for (const c of LETTERS) {
      const n = w.slice(0, i) + c + w.slice(i + 1);
      if (n !== w && DICT.has(n)) out.push(n);
    }
  return out;
};

// Breadth-first search outward from NINA: gives par and a shortest path for every word.
const dist = new Map<string, number>([[TARGET, 0]]);
const toward = new Map<string, string>();
{
  const queue = [TARGET];
  for (let q = 0; q < queue.length; q++) {
    const w = queue[q];
    for (const n of neighbors(w)) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(w)! + 1);
        toward.set(n, w);
        queue.push(n);
      }
    }
  }
}

const shortestPath = (start: string) => {
  const path = [start];
  while (path[path.length - 1] !== TARGET)
    path.push(toward.get(path[path.length - 1])!);
  return path;
};

type Tone = "hit" | "near" | "miss";
const tone = (ch: string, i: number): Tone =>
  TARGET[i] === ch ? "hit" : TARGET.includes(ch) ? "near" : "miss";

// random starter, never the same one twice in a row
const pickStart = (avoid?: string) => {
  let s: string;
  do s = STARTERS[Math.floor(Math.random() * STARTERS.length)];
  while (s === avoid);
  return s;
};

const ROW =
  "relative flex justify-center gap-(--gap) " +
  "before:absolute before:top-1/2 before:-left-(--rail) before:h-[3px] before:w-(--rail) before:bg-rope/50 " +
  "after:absolute after:top-1/2 after:-right-(--rail) after:h-[3px] after:w-(--rail) after:bg-rope/50";

const TILE =
  "grid size-(--tile) place-items-center rounded-md border-2 text-[length:calc(var(--tile)*0.5)] font-bold uppercase";

const TONE: Record<Tone, string> = {
  hit: "border-hit bg-hit text-sea",
  near: "border-near bg-near text-sea",
  miss: "border-swell bg-deep text-foam",
};
const CHANGED = "shadow-[inset_0_calc(var(--tile)*-0.09)_0_var(--color-foam)]";
const BLANK = "border-deep bg-transparent";

function Row({
  word,
  prev,
  locked = false,
  target = false,
  reached = false,
}: {
  word: string;
  prev?: string;
  locked?: boolean;
  target?: boolean;
  reached?: boolean;
}) {
  return (
    <div className={ROW}>
      {word.split("").map((ch, i) => {
        const look =
          target && !reached
            ? "border-dashed border-rope bg-transparent text-rope"
            : TONE[tone(ch, i)];
        return (
          <div
            key={i}
            className={`${TILE} ${look} ${prev && prev[i] !== ch ? CHANGED : ""} ${locked ? "opacity-85" : ""}`}
          >
            {word === TARGET && i === 2 ? "Ñ" : ch}
          </div>
        );
      })}
    </div>
  );
}

const APP_VARS = [
  "[--gap:6px] [--rail:22px] [--chrome:430px]",
  "[--tile:clamp(30px,min(13vw,58px,calc((100dvh_-_var(--chrome))_/_var(--rows)_-_var(--gap))),64px)]",
  "short:[--chrome:345px] short:[--gap:5px]",
  "tiny:[--rail:16px]",
  "tall:[--chrome:470px] tall:[--gap:8px] tall:[--rail:28px]",
  "land:[--gap:4px] land:[--rail:16px] land:[--tile:clamp(24px,calc((100dvh_-_70px)_/_var(--rows)_-_var(--gap)),40px)]",
  "desk:[--gap:8px] desk:[--rail:28px] desk:[--tile:clamp(32px,calc((100dvh_-_var(--chrome))_/_var(--rows)_-_var(--gap)),72px)]",
].join(" ");

const KEYS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const KEY_TONE: Record<Tone | "unused", string> = {
  unused: "bg-swell text-foam",
  hit: "bg-hit text-sea",
  near: "bg-near text-sea",
  miss: "bg-deep text-faint",
};
const KEY =
  "h-[clamp(40px,6.5dvh,54px)] max-w-[44px] flex-1 touch-manipulation rounded-md p-0 font-bold uppercase " +
  "[-webkit-tap-highlight-color:transparent] hover:brightness-115 tall:max-w-[50px] land:h-10 desk:h-14 desk:max-w-[56px]";
const KEY_WIDE =
  "h-[clamp(40px,6.5dvh,54px)] max-w-[68px] flex-[1.6] touch-manipulation rounded-md bg-swell p-0 text-[0.75rem] font-bold text-foam " +
  "[-webkit-tap-highlight-color:transparent] hover:brightness-115 tiny:text-[0.65rem] tall:max-w-[76px] land:h-10 desk:h-14 desk:max-w-[88px]";

const CONFETTI_VARS = [
  "--color-hit",
  "--color-near",
  "--color-rope",
  "--color-foam",
  "--color-swell",
];

/** Two confetti cannons from the bottom corners, drawn on a full-screen canvas for ~4 seconds. */
function Confetti({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (
      !active ||
      !canvas ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(document.documentElement);
    const colors = [
      ...CONFETTI_VARS.map((v) => css.getPropertyValue(v).trim()),
      "#ffffff",
    ];

    const power = Math.max(0.8, Math.min(1.4, H / 800));
    const pieces = Array.from({ length: 160 }, (_, n) => {
      const fromLeft = n % 2 === 0;
      const angle =
        (fromLeft ? -Math.PI / 3 : (-2 * Math.PI) / 3) +
        (Math.random() - 0.5) * 0.9;
      const speed = (11 + Math.random() * 10) * power;
      return {
        x: fromLeft ? 0 : W,
        y: H,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });

    const DURATION = 4000;
    const t0 = performance.now();
    let last = t0;
    let raf = 0;

    const tick = (now: number) => {
      const t = now - t0;
      const dt = Math.min(3, (now - last) / 16.67); // normalise to 60fps
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = t > 3000 ? Math.max(0, 1 - (t - 3000) / 1000) : 1;
      for (const p of pieces) {
        p.vx *= Math.pow(0.99, dt);
        p.vy = p.vy * Math.pow(0.99, dt) + 0.28 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < DURATION) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, W, H);
    };
  }, [active]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "size-4 shrink-0",
} as const;

const KeyboardIcon = () => (
  <svg {...ICON}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10" />
  </svg>
);

const Chevron = ({ flipped }: { flipped: boolean }) => (
  <svg
    {...ICON}
    className={`size-4 shrink-0 motion-safe:transition-transform motion-safe:duration-300 ${flipped ? "rotate-180" : ""}`}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export default function App() {
  const [start, setStart] = useState(() => pickStart());
  const [ladder, setLadder] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("");
  const [shake, setShake] = useState(false);
  const [open, setOpen] = useState(false); // result pop-up
  const [round, setRound] = useState(0); // bumps each new game so animated sections remount
  const [intro, setIntro] = useState(true); // true while the entrance animation plays
  const [pink, setPink] = useState(() => {
    try {
      return localStorage.getItem("ninadle:theme") === "pink";
    } catch {
      return false;
    }
  });
  const [showKeys, setShowKeys] = useState(() => {
    try {
      return localStorage.getItem("ninadle:keyboard") !== "hidden";
    } catch {
      return true;
    }
  }); // on-screen keyboard toggle (desktop only)

  const shown = useMemo(() => ladder.filter((w) => w !== TARGET), [ladder]);
  const won = ladder[ladder.length - 1] === TARGET;
  const par = dist.get(start)!;
  const lost = !won && shown.length >= MAX_GUESSES;
  const playing = !won && !lost;
  const prev = shown[shown.length - 1] ?? start;

  // clear the intro class once the entrance animation has finished
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1400);
    return () => clearTimeout(t);
  }, [round]);

  // apply the theme before paint so a saved pink theme never flashes blue first
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (pink) root.dataset.theme = "pink";
    else delete root.dataset.theme;
    try {
      localStorage.setItem("ninadle:theme", pink ? "pink" : "blue");
    } catch {
      /* storage unavailable, ignore */
    }
  }, [pink]);

  const niñafy = () => {
    const root = document.documentElement;
    root.classList.add("theme-fade"); // briefly fades colours instead of snapping
    setTimeout(() => root.classList.remove("theme-fade"), 450);
    setPink((v) => !v);
  };

  useEffect(() => {
    try {
      localStorage.setItem("ninadle:keyboard", showKeys ? "shown" : "hidden");
    } catch {
      /* storage unavailable, ignore */
    }
  }, [showKeys]);

  // show the result pop-up shortly after the game ends (lets the final rung and confetti land first)
  useEffect(() => {
    if (playing) {
      setOpen(false);
      return;
    }
    const t = setTimeout(() => setOpen(true), 250);
    return () => clearTimeout(t);
  }, [playing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const reject = useCallback((text: string) => {
    setMsg(text);
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }, []);

  const submit = useCallback(() => {
    if (input.length < 4) return reject("Need 4 letters");
    if (!DICT.has(input)) return reject("Not in the word list");
    if (ladder.includes(input) || input === start)
      return reject("Already on your ladder");
    if (diff(prev, input) !== 1) return reject("Change exactly one letter");
    const done = input === TARGET || diff(input, TARGET) === 1;
    setLadder((l) =>
      input === TARGET
        ? [...l, input]
        : done
          ? [...l, input, TARGET]
          : [...l, input],
    );
    setInput("");
    setMsg("");
  }, [input, ladder, start, prev, reject]);

  const press = useCallback(
    (key: string) => {
      if (!playing) return;
      if (key === "Enter") submit();
      else if (key === "Backspace") setInput((s) => s.slice(0, -1));
      else if (/^[a-z]$/.test(key))
        setInput((s) => (s.length < 4 ? s + key : s));
    },
    [playing, submit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      press(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const keyTone = useMemo(() => {
    const m = new Map<string, Tone>();
    const rank = { miss: 0, near: 1, hit: 2 };
    for (const w of [start, ...shown])
      w.split("").forEach((ch, i) => {
        const t = tone(ch, i);
        if (!m.has(ch) || rank[t] > rank[m.get(ch)!]) m.set(ch, t);
      });
    return m;
  }, [start, shown]);

  const playAgain = () => {
    setStart(pickStart(start));
    setOpen(false);
    setLadder([]);
    setInput("");
    setMsg("");
    setRound((r) => r + 1);
    setIntro(true);
  };

  const empty = Math.max(0, MAX_GUESSES - shown.length - (playing ? 1 : 0));

  return (
    <main
      className={`${APP_VARS} ${showKeys ? "desk:[--chrome:430px]" : "desk:[--chrome:250px]"} chrome-anim mx-auto flex min-h-dvh max-w-[480px] flex-col items-center gap-3 pt-[max(16px,env(safe-area-inset-top))] pr-[max(14px,env(safe-area-inset-right))] pb-[max(20px,env(safe-area-inset-bottom))] pl-[max(14px,env(safe-area-inset-left))] short:gap-2 tall:max-w-[560px] tall:gap-4 tall:pt-9 desk:max-w-[640px] desk:gap-4 desk:pt-8 land:max-w-[920px] land:grid land:grid-cols-[auto_minmax(0,1fr)] land:items-start land:justify-items-center land:gap-x-7 land:gap-y-2`}
      style={{ "--rows": MAX_GUESSES + 2 } as CSSProperties}
    >
      <Confetti active={won} />

      <button
        type="button"
        role="switch"
        aria-checked={pink}
        onClick={niñafy}
        onMouseDown={(e) => e.preventDefault()}
        className="fixed top-[max(12px,env(safe-area-inset-top))] right-[max(12px,env(safe-area-inset-right))] z-20 flex min-h-9 cursor-pointer touch-manipulation items-center gap-2.5 rounded-full border border-swell py-1 pr-1.5 pl-3.5 text-[0.85rem] font-bold text-mist transition-colors hover:bg-deep hover:text-foam motion-safe:animate-drop"
      >
        Niñafy✨
        <span
          aria-hidden
          className={`flex h-6 w-10 items-center rounded-full p-1 transition-colors ${pink ? "bg-rope" : "bg-swell"}`}
        >
          <span
            className={`size-4 rounded-full bg-foam shadow-sm motion-safe:transition-transform motion-safe:duration-200 ${pink ? "translate-x-4" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-sea/80 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
            onClick={(e) => e.stopPropagation()}
            className="w-[min(92vw,380px)] rounded-2xl border border-swell bg-deep p-6 text-center shadow-2xl motion-safe:animate-pop"
          >
            <h2
              id="result-title"
              className="font-display text-[1.9rem] leading-tight font-normal"
            >
              {won ? "Congratulations!" : "Better luck next time"}
            </h2>
            <p className="mt-3 text-[0.95rem] leading-[1.5] text-mist [overflow-wrap:anywhere]">
              {won
                ? `You climbed from ${start.toUpperCase()} to NIÑA in ${shown.length + 1} steps${
                    shown.length + 1 === par
                      ? ", a shortest ladder!"
                      : ` (par ${par}).`
                  }`
                : `You ran out of rungs. One shortest ladder: ${shortestPath(start).join(" → ").toUpperCase()}`}
            </p>
            <p className="mt-5 text-[1.05rem] font-bold">Want to play again?</p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                autoFocus
                onClick={playAgain}
                className="min-h-11 cursor-pointer touch-manipulation rounded-lg bg-rope px-5 py-3 font-bold text-sea"
              >
                Play again
              </button>
              <button
                onClick={() => setOpen(false)}
                className="min-h-11 cursor-pointer touch-manipulation rounded-lg px-5 py-2 text-mist hover:text-foam"
              >
                View ladder
              </button>
            </div>
          </div>
        </div>
      )}
      <header
        key={`h${round}`}
        className="text-center motion-safe:animate-drop land:col-span-2 land:pr-24 land:row-start-1 land:flex land:flex-wrap land:items-center land:justify-center land:gap-4"
      >
        <h1 className="font-display text-[length:clamp(1.8rem,7vw,2.4rem)] font-normal tracking-[0.01em] land:text-[1.6rem] desk:text-[2.6rem]">
          Niñadle
        </h1>
        <p className="mx-auto mt-1.5 mb-2.5 max-w-[34ch] text-[length:clamp(0.85rem,3.4vw,0.95rem)] leading-[1.4] text-mist short:mt-1 short:mb-2 land:m-0 land:max-w-none [&_b]:text-foam">
          Change one letter at a time to climb from <b>{start.toUpperCase()}</b>{" "}
          to <b>NIÑA</b>. Par {par}.
        </p>
      </header>

      <div
        key={`l${round}`}
        className={`${intro ? "ladder-intro" : ""} relative flex flex-col gap-(--gap) px-(--rail) before:absolute before:-top-(--gap) before:-bottom-(--gap) before:left-0 before:w-1 before:rounded-sm before:bg-rope after:absolute after:-top-(--gap) after:-bottom-(--gap) after:right-0 after:w-1 after:rounded-sm after:bg-rope land:col-start-1 land:row-start-2`}
      >
        <Row word={start} locked />
        {shown.map((w, i) => (
          <Row key={w} word={w} prev={i === 0 ? start : shown[i - 1]} />
        ))}
        {playing && (
          <div className={`${ROW} ${shake ? "motion-safe:animate-shake" : ""}`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`${TILE} ${input[i] ? "border-foam bg-deep motion-safe:animate-pop" : BLANK}`}
              >
                {input[i] ?? ""}
              </div>
            ))}
          </div>
        )}
        {Array.from({ length: empty }).map((_, i) => (
          <div className={ROW} key={`e${i}`}>
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className={`${TILE} ${BLANK}`} />
            ))}
          </div>
        ))}
        <Row
          word={TARGET}
          prev={won ? (shown[shown.length - 1] ?? start) : undefined}
          target
          reached={won}
        />
      </div>

      {!playing && (
        <button
          className="min-h-11 cursor-pointer touch-manipulation rounded-lg bg-rope px-[22px] py-3 font-bold text-sea land:col-start-1 land:row-start-4"
          onClick={playAgain}
        >
          Play again
        </button>
      )}

      <div
        key={`k${round}`}
        className="motion-safe:animate-lift mt-auto flex w-full flex-col land:col-start-2 land:row-span-3 land:row-start-2 land:mt-0 land:max-w-[420px] land:self-center"
        // keep focus off the buttons on click so a physical Enter/Space doesn't re-press them
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          aria-expanded={showKeys}
          aria-controls="keyboard"
          onClick={() => setShowKeys((v) => !v)}
          className="mx-auto mb-2 hidden cursor-pointer touch-manipulation items-center gap-2 rounded-full border border-swell px-3.5 py-1.5 text-[0.85rem] font-bold text-mist transition-colors hover:bg-deep hover:text-foam desk:flex"
        >
          <KeyboardIcon />
          {showKeys ? "Hide keyboard" : "Show keyboard"}
          <Chevron flipped={!showKeys} />
        </button>
        {/* grid-rows 1fr → 0fr animates the height; visibility drops the hidden keys out of tab order once collapsed */}
        <div
          id="keyboard"
          aria-label="Keyboard"
          className={`grid grid-rows-[1fr] select-none motion-safe:desk:transition-[grid-template-rows,opacity,visibility] motion-safe:desk:duration-300 motion-safe:desk:ease-out ${showKeys ? "" : "desk:invisible desk:grid-rows-[0fr] desk:opacity-0"}`}
        >
          {/* padding + negative margin leave room for the focus rings inside the clipped area */}
          <div
            className={`-m-1.5 flex min-h-0 flex-col gap-1.5 overflow-hidden p-1.5 motion-safe:desk:transition-transform motion-safe:desk:duration-300 motion-safe:desk:ease-out ${showKeys ? "" : "desk:translate-y-3"}`}
          >
            {KEYS.map((row, r) => (
              <div
                className="flex justify-center gap-[clamp(3px,1.2vw,6px)]"
                key={row}
              >
                {r === 2 && (
                  <button className={KEY_WIDE} onClick={() => press("Enter")}>
                    Enter
                  </button>
                )}
                {row.split("").map((k) => (
                  <button
                    key={k}
                    className={`${KEY} ${KEY_TONE[keyTone.get(k) ?? "unused"]}`}
                    onClick={() => press(k)}
                  >
                    {k}
                  </button>
                ))}
                {r === 2 && (
                  <button
                    className={KEY_WIDE}
                    aria-label="Delete"
                    onClick={() => press("Backspace")}
                  >
                    ⌫
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
