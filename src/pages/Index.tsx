import { useEffect, useRef, useState, useCallback } from "react";

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;

const DIFFICULTIES = {
  easy:   { label: "Лёгкий",  gravity: 0.32, jumpForce: -6.8, pipeSpeed: 2.2, pipeGap: 185, pipeInterval: 115 },
  normal: { label: "Средний", gravity: 0.45, jumpForce: -7.8, pipeSpeed: 3.0, pipeGap: 148, pipeInterval: 92  },
  hard:   { label: "Сложный", gravity: 0.62, jumpForce: -8.8, pipeSpeed: 4.2, pipeGap: 118, pipeInterval: 72  },
};

type Difficulty = keyof typeof DIFFICULTIES;
type GameState  = "menu" | "playing" | "dead" | "scores" | "shop";

// ─── Тема (набор скинов) ─────────────────────────────────────────────────────
interface ThemeDef {
  id: string;
  label: string;
  price: number;
  // bird
  body: string; wing: string; beak: string; eye: string; trail?: string;
  // world
  bgTop: string;      // верх фона
  bgBot: string;      // низ фона (градиент)
  gridColor: string;  // цвет сетки
  pipeColor: string;  // цвет труб
  pipeLine: string;   // светлая полоска на трубе
  groundColor: string;
  groundLine: string;
  groundMark: string;
}

const THEMES: ThemeDef[] = [
  {
    id: "classic", label: "Классик", price: 0,
    body: "#111111", wing: "#555555", beak: "#111111", eye: "#ffffff",
    bgTop: "#ffffff", bgBot: "#ffffff", gridColor: "#f2f2f2",
    pipeColor: "#111111", pipeLine: "#ffffff", groundColor: "#111111", groundLine: "#ffffff", groundMark: "#222222",
  },
  {
    id: "sunset", label: "Закат", price: 60,
    body: "#7c3d12", wing: "#b25c1a", beak: "#92400e", eye: "#fef3c7", trail: "rgba(251,146,60,0.35)",
    bgTop: "#fde68a", bgBot: "#fb923c", gridColor: "rgba(180,80,0,0.08)",
    pipeColor: "#92400e", pipeLine: "#fcd34d", groundColor: "#78350f", groundLine: "#fcd34d", groundMark: "#92400e",
  },
  {
    id: "ocean", label: "Океан", price: 80,
    body: "#0c4a6e", wing: "#075985", beak: "#0369a1", eye: "#e0f2fe", trail: "rgba(56,189,248,0.3)",
    bgTop: "#e0f2fe", bgBot: "#38bdf8", gridColor: "rgba(2,132,199,0.08)",
    pipeColor: "#0369a1", pipeLine: "#7dd3fc", groundColor: "#0c4a6e", groundLine: "#7dd3fc", groundMark: "#075985",
  },
  {
    id: "forest", label: "Лес", price: 70,
    body: "#14532d", wing: "#166534", beak: "#15803d", eye: "#dcfce7", trail: "rgba(74,222,128,0.25)",
    bgTop: "#dcfce7", bgBot: "#86efac", gridColor: "rgba(21,128,61,0.08)",
    pipeColor: "#15803d", pipeLine: "#bbf7d0", groundColor: "#14532d", groundLine: "#86efac", groundMark: "#166534",
  },
  {
    id: "midnight", label: "Ночь", price: 100,
    body: "#e2e8f0", wing: "#94a3b8", beak: "#cbd5e1", eye: "#0f172a", trail: "rgba(148,163,184,0.3)",
    bgTop: "#0f172a", bgBot: "#1e293b", gridColor: "rgba(148,163,184,0.06)",
    pipeColor: "#334155", pipeLine: "#94a3b8", groundColor: "#0f172a", groundLine: "#334155", groundMark: "#1e293b",
  },
  {
    id: "neon", label: "Неон", price: 150,
    body: "#09090b", wing: "#18181b", beak: "#00ff88", eye: "#00ff88", trail: "rgba(0,255,136,0.35)",
    bgTop: "#09090b", bgBot: "#09090b", gridColor: "rgba(0,255,136,0.07)",
    pipeColor: "#18181b", pipeLine: "#00ff88", groundColor: "#09090b", groundLine: "#00ff88", groundMark: "#18181b",
  },
  {
    id: "cherry", label: "Вишня", price: 90,
    body: "#881337", wing: "#9f1239", beak: "#be123c", eye: "#ffe4e6", trail: "rgba(251,113,133,0.3)",
    bgTop: "#fff1f2", bgBot: "#fda4af", gridColor: "rgba(190,18,60,0.07)",
    pipeColor: "#be123c", pipeLine: "#fecdd3", groundColor: "#881337", groundLine: "#fecdd3", groundMark: "#9f1239",
  },
  {
    id: "gold", label: "Золото", price: 120,
    body: "#78350f", wing: "#b45309", beak: "#92400e", eye: "#fef3c7", trail: "rgba(251,191,36,0.35)",
    bgTop: "#fffbeb", bgBot: "#fde68a", gridColor: "rgba(180,83,9,0.07)",
    pipeColor: "#b45309", pipeLine: "#fef08a", groundColor: "#78350f", groundLine: "#fef08a", groundMark: "#92400e",
  },
];

// ─── Способности ──────────────────────────────────────────────────────────────
interface AbilityDef {
  id: string; label: string; icon: string; desc: string;
  price: number; usePrice: number; duration: number;
}
const ABILITIES: AbilityDef[] = [
  { id: "shield", label: "Щит",            icon: "🛡️", desc: "Поглощает одно столкновение", price: 80,  usePrice: 8,  duration: 300 },
  { id: "slow",   label: "Замедление",     icon: "🐢", desc: "Трубы едут вдвое медленнее",  price: 100, usePrice: 10, duration: 180 },
  { id: "magnet", label: "Магнит",         icon: "🧲", desc: "Притягивает монеты 8 сек",    price: 60,  usePrice: 6,  duration: 480 },
  { id: "double", label: "Двойной прыжок", icon: "⚡", desc: "Пассивный второй прыжок",     price: 120, usePrice: 0,  duration: 0   },
];

// ─── Интерфейсы ───────────────────────────────────────────────────────────────
interface Pipe     { x: number; topHeight: number; scored: boolean; }
interface Coin     { x: number; y: number; collected: boolean; pulse: number; }
interface Apple    { x: number; y: number; collected: boolean; pulse: number; bobOffset: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }
interface HighScore { score: number; difficulty: Difficulty; date: string; }
interface WindowWithWebkit extends Window { webkitAudioContext?: typeof AudioContext; }

// ─── Audio ────────────────────────────────────────────────────────────────────
function createAudioCtx(): AudioContext | null {
  try {
    const W = window as WindowWithWebkit;
    const Ctx = window.AudioContext || W.webkitAudioContext;
    return Ctx ? new Ctx() : null;
  } catch { return null; }
}
function playSound(ctx: AudioContext | null, type: "flap" | "score" | "die" | "coin" | "apple" | "ability") {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  const t = ctx.currentTime;
  if (type === "flap") {
    osc.frequency.setValueAtTime(520, t); osc.frequency.exponentialRampToValueAtTime(260, t + 0.09);
    gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.start(t); osc.stop(t + 0.12);
  } else if (type === "score") {
    osc.frequency.setValueAtTime(660, t); osc.frequency.setValueAtTime(990, t + 0.09);
    gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.start(t); osc.stop(t + 0.2);
  } else if (type === "coin") {
    osc.frequency.setValueAtTime(880, t); osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
    gain.gain.setValueAtTime(0.14, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t); osc.stop(t + 0.15);
  } else if (type === "apple") {
    // сочный хруст — два тона
    osc.frequency.setValueAtTime(300, t); osc.frequency.exponentialRampToValueAtTime(600, t + 0.06);
    gain.gain.setValueAtTime(0.18, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.start(t); osc.stop(t + 0.18);
  } else if (type === "ability") {
    osc.frequency.setValueAtTime(440, t); osc.frequency.exponentialRampToValueAtTime(880, t + 0.2);
    gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t); osc.stop(t + 0.25);
  } else {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(280, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.45);
    gain.gain.setValueAtTime(0.18, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.start(t); osc.stop(t + 0.45);
  }
}

// ─── Константы ────────────────────────────────────────────────────────────────
const BIRD_SIZE     = 26;
const PIPE_WIDTH    = 52;
const GROUND_HEIGHT = 60;
const BIRD_X        = 90;
const STAMINA_MAX   = 100;
const COIN_RADIUS   = 9;
const APPLE_RADIUS  = 11;
const APPLE_RESTORE = 45; // сколько стамины восстанавливает яблоко

// ─── Нарисовать трубу ─────────────────────────────────────────────────────────
function drawPipe(ctx: CanvasRenderingContext2D, theme: ThemeDef, x: number, topH: number, botY: number, diff: typeof DIFFICULTIES[Difficulty]) {
  const botH = CANVAS_HEIGHT - GROUND_HEIGHT - botY;
  ctx.fillStyle = theme.pipeColor;
  ctx.fillRect(x, 0, PIPE_WIDTH, topH);
  ctx.fillRect(x - 4, topH - 14, PIPE_WIDTH + 8, 14);
  ctx.fillRect(x, botY, PIPE_WIDTH, botH);
  ctx.fillRect(x - 4, botY, PIPE_WIDTH + 8, 14);
  ctx.fillStyle = theme.pipeLine;
  ctx.fillRect(x + 10, 0, 4, topH - 14);
  ctx.fillRect(x + 10, botY + 14, 4, botH - 14);
  // дополнительный блик для тёмных тем
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(x + 2, 0, 8, topH - 14);
  ctx.fillRect(x + 2, botY + 14, 8, botH - 14);
  void diff;
}

// ─── Нарисовать яблоко ────────────────────────────────────────────────────────
function drawApple(ctx: CanvasRenderingContext2D, ax: number, ay: number, pulse: number) {
  const bob = Math.sin(pulse) * 2;
  const scale = 1 + Math.sin(pulse * 1.3) * 0.04;
  ctx.save();
  ctx.translate(ax, ay + bob);
  ctx.scale(scale, scale);

  // свечение
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, APPLE_RADIUS + 6);
  glow.addColorStop(0, "rgba(134,239,172,0.4)");
  glow.addColorStop(1, "rgba(134,239,172,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, APPLE_RADIUS + 6, 0, Math.PI * 2); ctx.fill();

  // тело яблока
  const grad = ctx.createRadialGradient(-3, -4, 1, 0, 0, APPLE_RADIUS);
  grad.addColorStop(0, "#4ade80");
  grad.addColorStop(0.5, "#22c55e");
  grad.addColorStop(1, "#15803d");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 2, APPLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // вмятинка сверху
  ctx.fillStyle = "#15803d";
  ctx.beginPath();
  ctx.arc(0, -APPLE_RADIUS + 4, 3, 0, Math.PI * 2);
  ctx.fill();

  // блик
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-4, -2, 4, 3, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // стебель
  ctx.strokeStyle = "#713f12";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -APPLE_RADIUS + 2);
  ctx.quadraticCurveTo(4, -APPLE_RADIUS - 4, 6, -APPLE_RADIUS - 8);
  ctx.stroke();

  // листик
  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.moveTo(4, -APPLE_RADIUS - 4);
  ctx.quadraticCurveTo(10, -APPLE_RADIUS - 10, 9, -APPLE_RADIUS - 2);
  ctx.quadraticCurveTo(5, -APPLE_RADIUS, 4, -APPLE_RADIUS - 4);
  ctx.fill();

  ctx.restore();
}

// ─── Нарисовать птицу ────────────────────────────────────────────────────────
function drawBird(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  smoothAngle: number, wingPhase: number,
  theme: ThemeDef, staminaRatio: number,
  shieldActive: boolean, particles: Particle[]
) {
  particles.forEach((p) => {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(smoothAngle);

  if (shieldActive) {
    const pulse = 0.55 + 0.2 * Math.sin(Date.now() * 0.008);
    ctx.beginPath(); ctx.arc(0, 0, BIRD_SIZE / 2 + 10, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100,180,255,${pulse})`; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, BIRD_SIZE / 2 + 14, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100,180,255,${pulse * 0.4})`; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (!shieldActive && staminaRatio < 0.3) {
    const alpha = 0.15 + Math.sin(Date.now() * 0.012) * 0.1;
    ctx.beginPath(); ctx.arc(0, 0, BIRD_SIZE / 2 + 6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(220,60,60,${alpha})`; ctx.lineWidth = 3; ctx.stroke();
  }

  // хвост
  const tailSwing = Math.sin(wingPhase * 0.5) * 0.15;
  for (let i = 0; i < 3; i++) {
    const tAngle = tailSwing + (i - 1) * 0.22;
    const tLen = 10 + i * 2;
    ctx.save(); ctx.rotate(Math.PI + tAngle);
    ctx.fillStyle = theme.wing;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(4, tLen * 0.5, 2, tLen);
    ctx.quadraticCurveTo(-4, tLen * 0.5, 0, 0);
    ctx.fill(); ctx.restore();
  }

  // тело
  ctx.fillStyle = theme.body;
  ctx.beginPath(); ctx.ellipse(0, 0, BIRD_SIZE / 2, BIRD_SIZE / 2.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath(); ctx.ellipse(1, 2, BIRD_SIZE / 3, BIRD_SIZE / 3.5, 0, 0, Math.PI * 2); ctx.fill();

  // глаз
  ctx.fillStyle = theme.eye; ctx.beginPath(); ctx.arc(6, -4, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = theme.body; ctx.beginPath(); ctx.arc(7.5, -4, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(8.5, -5, 1, 0, Math.PI * 2); ctx.fill();

  // крыло
  const wingLift = Math.sin(wingPhase) * 6;
  const wingScale = 0.9 + Math.sin(wingPhase) * 0.15;
  ctx.save(); ctx.scale(1, wingScale);
  ctx.fillStyle = theme.wing;
  ctx.beginPath(); ctx.ellipse(-4, 2 + wingLift * 0.5, 9, 5.5, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = theme.body;
  ctx.beginPath(); ctx.ellipse(-9, 3 + wingLift, 4, 3, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // клюв
  ctx.fillStyle = theme.beak;
  ctx.beginPath(); ctx.moveTo(10, -2); ctx.lineTo(18, 0); ctx.lineTo(10, 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(17, 0); ctx.stroke();

  ctx.restore();
}

// ─── Компонент ────────────────────────────────────────────────────────────────
export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gameRef = useRef({
    birdY: CANVAS_HEIGHT / 2,
    birdVY: 0,
    smoothAngle: 0,
    targetAngle: 0,
    particles: [] as Particle[],
    wingPhase: 0,
    pipes: [] as Pipe[],
    coins: [] as Coin[],
    apples: [] as Apple[],
    score: 0,
    coinsEarned: 0,
    frame: 0,
    animId: 0,
    state: "menu" as GameState,
    difficulty: "normal" as Difficulty,
    deathY: 0, deathVY: 0, deathAngle: 0,
    stamina: STAMINA_MAX,
    exhausted: false,
    activeThemeId: "classic",
    doubleJumpOwned: false,
    doubleJumpUsed: false,
    shieldActive: false, shieldFrames: 0,
    slowActive: false, slowFrames: 0,
    magnetActive: false, magnetFrames: 0,
    activeAbilityId: "" as string,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);

  const [uiState, setUiState]               = useState<GameState>("menu");
  const [score, setScore]                   = useState(0);
  const [difficulty, setDifficulty]         = useState<Difficulty>("normal");
  const [highScores, setHighScores]         = useState<HighScore[]>([]);
  const [bestScore, setBestScore]           = useState(0);
  const [totalCoins, setTotalCoins]         = useState(0);
  const [ownedThemes, setOwnedThemes]       = useState<string[]>(["classic"]);
  const [activeTheme, setActiveTheme]       = useState<string>("classic");
  const [ownedAbilities, setOwnedAbilities] = useState<string[]>([]);
  const [equippedAbility, setEquippedAbility] = useState<string>("");
  const [stamDisplay, setStamDisplay]       = useState(STAMINA_MAX);
  const [shopMsg, setShopMsg]               = useState("");
  const [shopTab, setShopTab]               = useState<"themes" | "abilities">("themes");
  const [, setAbilityFrames]               = useState(0);

  // ── load ──
  useEffect(() => {
    const sc = localStorage.getItem("flappy_scores");
    if (sc) { const p: HighScore[] = JSON.parse(sc); setHighScores(p); if (p.length) setBestScore(Math.max(...p.map(s => s.score))); }
    const co = localStorage.getItem("flappy_coins");   if (co) setTotalCoins(Number(co));
    const ot = localStorage.getItem("flappy_themes");  if (ot) setOwnedThemes(JSON.parse(ot));
    const th = localStorage.getItem("flappy_theme");   if (th) { setActiveTheme(th); gameRef.current.activeThemeId = th; }
    const oa = localStorage.getItem("flappy_abilities"); if (oa) setOwnedAbilities(JSON.parse(oa));
    const ea = localStorage.getItem("flappy_equipped");
    if (ea) { setEquippedAbility(ea); gameRef.current.activeAbilityId = ea; if (ea === "double") gameRef.current.doubleJumpOwned = true; }
  }, []);

  const addCoins = useCallback((n: number) => {
    setTotalCoins(prev => { const nx = prev + n; localStorage.setItem("flappy_coins", String(nx)); return nx; });
  }, []);

  const spendCoins = useCallback((n: number, cb: () => void) => {
    setTotalCoins(prev => {
      if (prev < n) { setShopMsg("Недостаточно монет!"); setTimeout(() => setShopMsg(""), 1500); return prev; }
      const nx = prev - n; localStorage.setItem("flappy_coins", String(nx)); cb(); return nx;
    });
  }, []);

  const saveScore = useCallback((s: number, diff: Difficulty) => {
    if (s === 0) return;
    const entry: HighScore = { score: s, difficulty: diff, date: new Date().toLocaleDateString("ru-RU") };
    setHighScores(prev => {
      const nx = [entry, ...prev].sort((a, b) => b.score - a.score).slice(0, 10);
      localStorage.setItem("flappy_scores", JSON.stringify(nx));
      setBestScore(Math.max(...nx.map(x => x.score)));
      return nx;
    });
  }, []);

  const buyTheme = useCallback((th: ThemeDef) => {
    spendCoins(th.price, () => {
      setOwnedThemes(o => { const u = [...o, th.id]; localStorage.setItem("flappy_themes", JSON.stringify(u)); return u; });
      setShopMsg("Куплено!"); setTimeout(() => setShopMsg(""), 1500);
    });
  }, [spendCoins]);

  const buyAbility = useCallback((ab: AbilityDef) => {
    spendCoins(ab.price, () => {
      setOwnedAbilities(o => { const u = [...o, ab.id]; localStorage.setItem("flappy_abilities", JSON.stringify(u)); return u; });
      setShopMsg("Куплено!"); setTimeout(() => setShopMsg(""), 1500);
    });
  }, [spendCoins]);

  const selectTheme = useCallback((id: string) => {
    setActiveTheme(id); gameRef.current.activeThemeId = id; localStorage.setItem("flappy_theme", id);
  }, []);

  const selectAbility = useCallback((id: string) => {
    const nx = equippedAbility === id ? "" : id;
    setEquippedAbility(nx); gameRef.current.activeAbilityId = nx;
    gameRef.current.doubleJumpOwned = nx === "double";
    localStorage.setItem("flappy_equipped", nx);
  }, [equippedAbility]);

  // ── trail particle ──
  const spawnParticle = (g: typeof gameRef.current, theme: ThemeDef) => {
    if (!theme.trail) return;
    g.particles.push({ x: BIRD_X - 8, y: g.birdY + (Math.random() - 0.5) * 8, vx: -1.2 - Math.random(), vy: (Math.random() - 0.5) * 0.8, life: 18, maxLife: 18, color: theme.trail, size: 4 + Math.random() * 3 });
  };

  // ── draw ──
  const drawScene = useCallback((ctx: CanvasRenderingContext2D) => {
    const g = gameRef.current;
    const diff = DIFFICULTIES[g.difficulty];
    const theme = THEMES.find(t => t.id === g.activeThemeId) ?? THEMES[0];
    const staminaRatio = g.stamina / STAMINA_MAX;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT - GROUND_HEIGHT);
    bgGrad.addColorStop(0, theme.bgTop);
    bgGrad.addColorStop(1, theme.bgBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // grid
    ctx.strokeStyle = theme.gridColor; ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT - GROUND_HEIGHT); ctx.stroke(); }
    for (let y = 0; y < CANVAS_HEIGHT - GROUND_HEIGHT; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke(); }

    // slow tint
    if (g.slowActive) { ctx.fillStyle = "rgba(41,128,185,0.05)"; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_HEIGHT); }

    // pipes
    g.pipes.forEach(pipe => drawPipe(ctx, theme, pipe.x, pipe.topHeight, pipe.topHeight + diff.pipeGap, diff));

    // coins
    g.coins.forEach(coin => {
      if (coin.collected) return;
      coin.pulse = (coin.pulse + 0.07) % (Math.PI * 2);
      const r = COIN_RADIUS + Math.sin(coin.pulse) * 1.5;
      ctx.save();
      if (g.magnetActive) { ctx.shadowColor = "#f5c518"; ctx.shadowBlur = 12; }
      ctx.beginPath(); ctx.arc(coin.x, coin.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#f5c518"; ctx.fill();
      ctx.strokeStyle = "#c9a000"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#7a5f00"; ctx.font = `bold ${Math.round(r)}px monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("$", coin.x, coin.y + 0.5);
      ctx.restore();
    });

    // apples
    g.apples.forEach(apple => {
      if (apple.collected) return;
      apple.pulse = (apple.pulse + 0.05) % (Math.PI * 2);
      apple.bobOffset = Math.sin(apple.pulse) * 2;
      drawApple(ctx, apple.x, apple.y + apple.bobOffset, apple.pulse);
    });

    // ground
    ctx.fillStyle = theme.groundColor;
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT);
    ctx.fillStyle = theme.groundLine;
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, 3);
    ctx.fillStyle = theme.groundMark;
    for (let x = (g.frame * 2) % 40; x < CANVAS_WIDTH; x += 40) {
      ctx.fillRect(x, CANVAS_HEIGHT - GROUND_HEIGHT + 10, 20, 3);
    }

    // bird
    if (g.state === "dead") {
      drawBird(ctx, BIRD_X, g.deathY, g.deathAngle, g.wingPhase, theme, 1, false, []);
    } else {
      drawBird(ctx, BIRD_X, g.birdY, g.smoothAngle, g.wingPhase, theme, staminaRatio, g.shieldActive, g.particles);
    }

    if (g.state !== "playing") return;

    // ── HUD ──
    // score
    ctx.fillStyle = theme.pipeColor;
    ctx.font = "bold 32px 'Space Grotesk', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(String(g.score), CANVAS_WIDTH / 2, 52);

    // coin hud
    ctx.beginPath(); ctx.arc(20, 20, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#f5c518"; ctx.fill();
    ctx.strokeStyle = "#c9a000"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = theme.pipeColor; ctx.font = "bold 13px 'Space Grotesk', monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(String(g.coinsEarned), 34, 20);

    // ability icon
    const abilDef = ABILITIES.find(a => a.id === g.activeAbilityId);
    if (abilDef && abilDef.id !== "double") {
      const isOn = (abilDef.id === "shield" && g.shieldActive) || (abilDef.id === "slow" && g.slowActive) || (abilDef.id === "magnet" && g.magnetActive);
      const fr   = abilDef.id === "shield" ? g.shieldFrames : abilDef.id === "slow" ? g.slowFrames : g.magnetFrames;
      ctx.save(); ctx.translate(CANVAS_WIDTH - 28, 28);
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = isOn ? "rgba(100,180,255,0.18)" : "rgba(128,128,128,0.12)"; ctx.fill();
      if (isOn) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, 18, -Math.PI / 2, -Math.PI / 2 + (fr / abilDef.duration) * Math.PI * 2);
        ctx.fillStyle = "rgba(100,180,255,0.5)"; ctx.fill();
      }
      ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(abilDef.icon, 0, 1);
      ctx.restore();
    }
    if (g.doubleJumpOwned) {
      ctx.beginPath(); ctx.arc(CANVAS_WIDTH - 28, 58, 7, 0, Math.PI * 2);
      ctx.fillStyle = g.doubleJumpUsed ? "#ccc" : theme.pipeColor; ctx.fill();
      ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = theme.bgTop === "#09090b" ? "#111" : "#fff";
      ctx.fillText("2x", CANVAS_WIDTH - 28, 58);
    }

    // stamina bar
    const BW = 110; const BH = 7;
    const BX = CANVAS_WIDTH / 2 - BW / 2; const BY = CANVAS_HEIGHT - GROUND_HEIGHT - 20;
    ctx.fillStyle = "rgba(128,128,128,0.2)";
    ctx.beginPath(); ctx.roundRect(BX, BY, BW, BH, 4); ctx.fill();
    const sr = g.stamina / STAMINA_MAX;
    ctx.fillStyle = sr > 0.5 ? theme.pipeColor : sr > 0.25 ? "#e67e22" : "#e74c3c";
    ctx.beginPath(); ctx.roundRect(BX, BY, BW * sr, BH, 4); ctx.fill();
    ctx.fillStyle = "rgba(128,128,128,0.6)"; ctx.font = "9px 'Space Grotesk', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("ВЫНОСЛИВОСТЬ", CANVAS_WIDTH / 2, BY - 1);

    if (g.exhausted) {
      ctx.fillStyle = "rgba(231,76,60,0.85)";
      ctx.font = "bold 12px 'Space Grotesk', monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("⚡ ВОССТАНОВЛЕНИЕ...", CANVAS_WIDTH / 2, CANVAS_HEIGHT - GROUND_HEIGHT - 36);
    }
  }, []);

  // ── death loop ──
  const deathLoop = useCallback(() => {
    const g = gameRef.current;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    if (g.state !== "dead") return;
    g.deathVY += 0.9; g.deathY += g.deathVY; g.deathAngle += 0.06; g.wingPhase += 0.05;
    drawScene(ctx);
    if (g.deathY < CANVAS_HEIGHT - GROUND_HEIGHT - BIRD_SIZE) g.animId = requestAnimationFrame(deathLoop);
    else { g.deathY = CANVAS_HEIGHT - GROUND_HEIGHT - BIRD_SIZE; drawScene(ctx); }
  }, [drawScene]);

  // ── game loop ──
  const gameLoop = useCallback(() => {
    const g = gameRef.current;
    const diff = DIFFICULTIES[g.difficulty];
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    if (g.state !== "playing") { drawScene(ctx); return; }

    g.frame++;
    const theme = THEMES.find(t => t.id === g.activeThemeId) ?? THEMES[0];

    // ability timers
    if (g.shieldActive) { g.shieldFrames--; if (g.shieldFrames <= 0) g.shieldActive = false; }
    if (g.slowActive)   { g.slowFrames--;   if (g.slowFrames <= 0)   g.slowActive   = false; }
    if (g.magnetActive) { g.magnetFrames--; if (g.magnetFrames <= 0) g.magnetActive = false; }
    setAbilityFrames(g.shieldFrames || g.slowFrames || g.magnetFrames);

    const speed = g.slowActive ? diff.pipeSpeed * 0.45 : diff.pipeSpeed;

    // stamina
    if (g.birdVY < 0) { g.stamina = Math.max(0, g.stamina - 0.08); }
    else { g.stamina = Math.min(STAMINA_MAX, g.stamina + 0.35); }
    if (g.stamina <= 0) g.exhausted = true;
    if (g.exhausted && g.stamina >= 30) g.exhausted = false;
    setStamDisplay(g.stamina);

    // physics
    g.birdVY += diff.gravity;
    g.birdVY = Math.max(g.birdVY, -12);
    g.birdY += g.birdVY;

    // smooth angle
    g.targetAngle = Math.max(-0.42, Math.min(0.65, g.birdVY * 0.065));
    g.smoothAngle += (g.targetAngle - g.smoothAngle) * 0.18;
    g.wingPhase += 0.22 + Math.abs(g.birdVY) * 0.02;

    // trail
    if (theme.trail && g.frame % 3 === 0) spawnParticle(g, theme);
    g.particles = g.particles.filter(p => p.life > 0);
    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });

    // spawn pipes + items
    if (g.frame % diff.pipeInterval === 0) {
      const minTop = 60, maxTop = CANVAS_HEIGHT - GROUND_HEIGHT - diff.pipeGap - 60;
      const topH = Math.random() * (maxTop - minTop) + minTop;
      g.pipes.push({ x: CANVAS_WIDTH + 10, topHeight: topH, scored: false });

      const itemX = CANVAS_WIDTH + 10 + PIPE_WIDTH / 2 + 70;
      const itemY = topH + diff.pipeGap / 2;
      // 25% яблоко, 75% монета
      if (Math.random() < 0.25) {
        g.apples.push({ x: itemX, y: itemY, collected: false, pulse: Math.random() * Math.PI * 2, bobOffset: 0 });
      } else {
        g.coins.push({ x: itemX, y: itemY, collected: false, pulse: Math.random() * Math.PI * 2 });
      }
    }

    // move pipes
    g.pipes = g.pipes.filter(p => p.x + PIPE_WIDTH + 10 > 0);
    g.pipes.forEach(pipe => {
      pipe.x -= speed;
      if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
        pipe.scored = true; g.score++; setScore(g.score);
        playSound(audioCtxRef.current, "score");
      }
    });

    // move coins
    g.coins = g.coins.filter(c => c.x + COIN_RADIUS > 0);
    g.coins.forEach(coin => {
      if (coin.collected) return;
      coin.x -= speed;
      const dx = BIRD_X - coin.x, dy = g.birdY - coin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (g.magnetActive && dist < 90) { coin.x += dx * 0.09; coin.y += dy * 0.09; }
      const cr = g.magnetActive ? BIRD_SIZE / 2 + 60 : BIRD_SIZE / 2 + COIN_RADIUS;
      if (dist < cr) { coin.collected = true; g.coinsEarned++; playSound(audioCtxRef.current, "coin"); }
    });

    // move apples
    g.apples = g.apples.filter(a => a.x + APPLE_RADIUS > 0);
    g.apples.forEach(apple => {
      if (apple.collected) return;
      apple.x -= speed;
      const dx = BIRD_X - apple.x, dy = g.birdY - (apple.y + apple.bobOffset);
      if (Math.sqrt(dx * dx + dy * dy) < BIRD_SIZE / 2 + APPLE_RADIUS) {
        apple.collected = true;
        g.stamina = Math.min(STAMINA_MAX, g.stamina + APPLE_RESTORE);
        if (g.exhausted && g.stamina >= 30) g.exhausted = false;
        playSound(audioCtxRef.current, "apple");
      }
    });

    // collision
    const bL = BIRD_X - BIRD_SIZE / 2 + 5, bR = BIRD_X + BIRD_SIZE / 2 - 5;
    const bT = g.birdY - BIRD_SIZE / 2 + 5, bB = g.birdY + BIRD_SIZE / 2 - 5;
    let died = bB >= CANVAS_HEIGHT - GROUND_HEIGHT || bT <= 0;
    for (const pipe of g.pipes) {
      const botY = pipe.topHeight + diff.pipeGap;
      if (bR > pipe.x - 4 && bL < pipe.x + PIPE_WIDTH + 4 && (bT < pipe.topHeight || bB > botY)) { died = true; break; }
    }
    if (died && g.shieldActive) { g.shieldActive = false; g.shieldFrames = 0; g.birdVY = -5; died = false; }
    if (died) {
      g.state = "dead"; g.deathY = g.birdY; g.deathVY = g.birdVY; g.deathAngle = g.smoothAngle;
      playSound(audioCtxRef.current, "die");
      saveScore(g.score, g.difficulty); addCoins(g.coinsEarned);
      setUiState("dead"); setScore(g.score);
      cancelAnimationFrame(g.animId);
      g.animId = requestAnimationFrame(deathLoop);
      return;
    }

    drawScene(ctx);
    g.animId = requestAnimationFrame(gameLoop);
  }, [drawScene, saveScore, addCoins, deathLoop]);

  // ── start ──
  const startGame = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
    const g = gameRef.current;
    cancelAnimationFrame(g.animId);
    Object.assign(g, {
      birdY: CANVAS_HEIGHT / 2, birdVY: 0, smoothAngle: 0, targetAngle: 0,
      wingPhase: 0, particles: [], pipes: [], coins: [], apples: [],
      score: 0, coinsEarned: 0, frame: 0,
      stamina: STAMINA_MAX, exhausted: false,
      shieldActive: false, shieldFrames: 0,
      slowActive: false, slowFrames: 0,
      magnetActive: false, magnetFrames: 0,
      doubleJumpUsed: false, state: "playing",
      difficulty,
    });
    setScore(0); setStamDisplay(STAMINA_MAX); setAbilityFrames(0);
    setUiState("playing");
    g.animId = requestAnimationFrame(gameLoop);
  }, [difficulty, gameLoop]);

  // ── jump ──
  const jump = useCallback(() => {
    const g = gameRef.current;
    if (g.state !== "playing" || g.exhausted) return;
    const diff = DIFFICULTIES[g.difficulty];
    if (g.birdVY > 0 && g.doubleJumpOwned && !g.doubleJumpUsed) {
      g.doubleJumpUsed = true; g.birdVY = diff.jumpForce * 0.85;
      g.stamina = Math.max(0, g.stamina - 8);
      playSound(audioCtxRef.current, "flap"); return;
    }
    if (g.birdVY <= 0 && g.doubleJumpOwned) g.doubleJumpUsed = false;
    g.birdVY = diff.jumpForce;
    g.stamina = Math.max(0, g.stamina - 10);
    if (g.stamina <= 0) g.exhausted = true;
    playSound(audioCtxRef.current, "flap");
  }, []);

  // ── activate ability ──
  const activateAbility = useCallback(() => {
    const g = gameRef.current;
    if (g.state !== "playing") return;
    const ab = ABILITIES.find(a => a.id === g.activeAbilityId);
    if (!ab || ab.id === "double") return;
    const isOn = (ab.id === "shield" && g.shieldActive) || (ab.id === "slow" && g.slowActive) || (ab.id === "magnet" && g.magnetActive);
    if (isOn) return;
    setTotalCoins(prev => {
      if (prev < ab.usePrice) return prev;
      const nx = prev - ab.usePrice; localStorage.setItem("flappy_coins", String(nx));
      if (ab.id === "shield") { g.shieldActive = true; g.shieldFrames = ab.duration; }
      if (ab.id === "slow")   { g.slowActive   = true; g.slowFrames   = ab.duration; }
      if (ab.id === "magnet") { g.magnetActive  = true; g.magnetFrames = ab.duration; }
      playSound(audioCtxRef.current, "ability"); return nx;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
      if (e.code === "KeyE") activateAbility();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, activateAbility]);

  useEffect(() => {
    if (uiState === "menu" || uiState === "scores" || uiState === "shop") {
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      gameRef.current.state = uiState as GameState;
      drawScene(ctx);
    }
  }, [uiState, drawScene]);

  // mini bird SVG preview for theme card
  const BirdPreview = ({ th }: { th: ThemeDef }) => (
    <svg width="60" height="44" style={{ overflow: "visible" }}>
      <polygon points="16,26 9,20 9,30" fill={th.wing} />
      <ellipse cx="28" cy="22" rx="13" ry="10" fill={th.body} />
      <ellipse cx="29" cy="23" rx="9" ry="7" fill="rgba(255,255,255,0.08)" />
      <circle cx="34" cy="17" r="5" fill={th.eye} />
      <circle cx="35.5" cy="17" r="2.5" fill={th.body} />
      <circle cx="36.5" cy="16" r="1" fill="#fff" />
      <ellipse cx="23" cy="24" rx="8" ry="5" fill={th.wing} />
      <polygon points="38,20 46,22 38,24" fill={th.beak} />
    </svg>
  );

  const staminaPct = stamDisplay / STAMINA_MAX;
  const g = gameRef.current;
  const activeAbDef = ABILITIES.find(a => a.id === equippedAbility);
  const isAbilityOn = activeAbDef
    ? (activeAbDef.id === "shield" && g.shieldActive) || (activeAbDef.id === "slow" && g.slowActive) || (activeAbDef.id === "magnet" && g.magnetActive)
    : false;

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#f0f0f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" />

      <div className="flex flex-col items-center gap-4">

        {/* header */}
        <div className="flex items-center justify-between w-full" style={{ maxWidth: CANVAS_WIDTH }}>
          <div>
            <h1 style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-1px", color: "#111", margin: 0 }}>FLAPPY BIRD</h1>
            {bestScore > 0 && <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>Рекорд: {bestScore}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#111", borderRadius: 20, padding: "6px 14px" }}>
            <span style={{ fontSize: 15 }}>🪙</span>
            <span style={{ fontWeight: 700, color: "#f5c518", fontSize: 15 }}>{totalCoins}</span>
          </div>
        </div>

        {/* canvas */}
        <div style={{ position: "relative" }}>
          <canvas
            ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}
            style={{ display: "block", border: "2px solid #111", borderRadius: 4, cursor: uiState === "playing" ? "none" : "default", userSelect: "none", touchAction: "none" }}
            onClick={jump}
            onTouchStart={e => { e.preventDefault(); jump(); }}
          />

          {/* ── MENU ── */}
          {uiState === "menu" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "rgba(255,255,255,0.91)", borderRadius: 2 }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Сложность</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {(Object.keys(DIFFICULTIES) as Difficulty[]).map(d => (
                    <button key={d} onClick={() => setDifficulty(d)} style={{ padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: difficulty === d ? "#111" : "#fff", color: difficulty === d ? "#fff" : "#111", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {DIFFICULTIES[d].label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 6, padding: "10px 16px", maxWidth: 280, textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "#555", margin: 0, lineHeight: 1.7 }}>
                  ⚡ Прыжок тратит стамину · 🍎 Яблоко восстанавливает<br/>
                  🪙 Монеты — за покупки в магазине
                  {equippedAbility && activeAbDef ? <><br/><b>{activeAbDef.icon} {activeAbDef.label}</b> — клавиша E</> : ""}
                </p>
              </div>

              <button onClick={startGame} style={{ padding: "13px 52px", fontSize: 16, fontWeight: 700, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: "#111", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                СТАРТ
              </button>

              <div style={{ display: "flex", gap: 10 }}>
                {highScores.length > 0 && (
                  <button onClick={() => setUiState("scores")} style={{ fontSize: 12, color: "#666", background: "none", border: "1px solid #ddd", borderRadius: 2, padding: "6px 12px", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>Рекорды</button>
                )}
                <button onClick={() => setUiState("shop")} style={{ fontSize: 12, fontWeight: 700, color: "#111", background: "#f5c518", border: "none", borderRadius: 2, padding: "6px 14px", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>🛒 Магазин</button>
              </div>
            </div>
          )}

          {/* ── DEAD ── */}
          {uiState === "dead" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(255,255,255,0.91)", borderRadius: 2 }}>
              <p style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Конец игры</p>
              <p style={{ fontSize: 60, fontWeight: 700, color: "#111", lineHeight: 1, margin: 0 }}>{score}</p>
              {bestScore === score && score > 0 && <p style={{ fontSize: 12, fontWeight: 700, color: "#111", textTransform: "uppercase", margin: 0 }}>★ Новый рекорд!</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff9e0", border: "1px solid #f5c518", borderRadius: 20, padding: "5px 14px" }}>
                <span>🪙</span>
                <span style={{ fontWeight: 700, color: "#b8860b", fontSize: 14 }}>+{gameRef.current.coinsEarned} монет</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 190 }}>
                <button onClick={startGame} style={{ padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: "#111", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>СНОВА</button>
                <button onClick={() => setUiState("menu")} style={{ padding: "8px 0", fontSize: 13, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: "#fff", color: "#111", fontFamily: "'Space Grotesk', sans-serif" }}>В меню</button>
              </div>
            </div>
          )}

          {/* ── SCORES ── */}
          {uiState === "scores" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 24px", gap: 4, background: "rgba(255,255,255,0.97)", borderRadius: 2, overflowY: "auto" }}>
              <p style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>Таблица рекордов</p>
              {highScores.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", width: "100%", borderBottom: "1px solid #eee", padding: "7px 0", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#aaa", width: 20, textAlign: "right" }}>#{i + 1}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#111", flex: 1 }}>{s.score}</span>
                  <span style={{ fontSize: 11, color: "#999" }}>{DIFFICULTIES[s.difficulty].label}</span>
                  <span style={{ fontSize: 11, color: "#bbb" }}>{s.date}</span>
                </div>
              ))}
              <button onClick={() => setUiState("menu")} style={{ marginTop: 14, padding: "9px 28px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: "#111", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Назад</button>
            </div>
          )}

          {/* ── SHOP ── */}
          {uiState === "shop" && (
            <div style={{ position: "absolute", inset: 0, background: "#fff", borderRadius: 2, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Магазин</p>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 13 }}>🪙</span>
                  <span style={{ fontWeight: 700, color: "#b8860b", fontSize: 13 }}>{totalCoins}</span>
                </div>
              </div>

              <div style={{ display: "flex", borderBottom: "1px solid #eee", margin: "10px 16px 0" }}>
                {(["themes", "abilities"] as const).map(tab => (
                  <button key={tab} onClick={() => setShopTab(tab)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: shopTab === tab ? 700 : 400, border: "none", background: "none", cursor: "pointer", borderBottom: shopTab === tab ? "2px solid #111" : "2px solid transparent", color: shopTab === tab ? "#111" : "#aaa", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {tab === "themes" ? "🎨 Наборы" : "⚡ Способности"}
                  </button>
                ))}
              </div>

              {shopMsg && (
                <div style={{ margin: "8px 16px 0", textAlign: "center", padding: "6px", background: shopMsg === "Куплено!" ? "#e8f8e8" : "#fde8e8", border: `1px solid ${shopMsg === "Куплено!" ? "#aed6ae" : "#f5aeae"}`, borderRadius: 4, fontSize: 12, fontWeight: 600, color: shopMsg === "Куплено!" ? "#2e7d32" : "#c62828" }}>
                  {shopMsg}
                </div>
              )}

              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 4px" }}>

                {/* ── THEMES TAB ── */}
                {shopTab === "themes" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {THEMES.map(th => {
                      const owned = ownedThemes.includes(th.id);
                      const isActive = activeTheme === th.id;
                      return (
                        <div key={th.id} style={{ border: isActive ? "2px solid #111" : "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                          {/* preview panel */}
                          <div style={{ height: 70, background: `linear-gradient(180deg, ${th.bgTop}, ${th.bgBot})`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", position: "relative" }}>
                            {/* mini pipe */}
                            <div style={{ width: 14, height: "100%", background: th.pipeColor, borderRadius: 2, opacity: 0.8 }} />
                            <BirdPreview th={th} />
                            <div style={{ width: 14, height: "100%", background: th.pipeColor, borderRadius: 2, opacity: 0.8 }} />
                            {/* ground strip */}
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: th.groundColor }} />
                          </div>
                          {/* info */}
                          <div style={{ padding: "8px", background: "#fff", display: "flex", flexDirection: "column", gap: 5, alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{th.label}</span>
                            {th.trail && <span style={{ fontSize: 9, color: "#aaa" }}>✨ след</span>}
                            {th.price === 0
                              ? <span style={{ fontSize: 10, color: "#aaa" }}>Бесплатно</span>
                              : <div style={{ display: "flex", gap: 3, alignItems: "center" }}><span style={{ fontSize: 11 }}>🪙</span><span style={{ fontSize: 11, fontWeight: 600, color: "#b8860b" }}>{th.price}</span></div>}
                            {isActive
                              ? <span style={{ fontSize: 10, fontWeight: 700, color: "#111" }}>✓ Активен</span>
                              : owned
                                ? <button onClick={() => selectTheme(th.id)} style={{ fontSize: 10, fontWeight: 600, padding: "3px 12px", border: "1.5px solid #111", borderRadius: 2, background: "#fff", color: "#111", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>Выбрать</button>
                                : <button onClick={() => buyTheme(th)} disabled={totalCoins < th.price} style={{ fontSize: 10, fontWeight: 600, padding: "3px 12px", border: "none", borderRadius: 2, background: totalCoins >= th.price ? "#111" : "#ccc", color: "#fff", cursor: totalCoins >= th.price ? "pointer" : "not-allowed", fontFamily: "'Space Grotesk', sans-serif" }}>Купить</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── ABILITIES TAB ── */}
                {shopTab === "abilities" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ABILITIES.map(ab => {
                      const owned = ownedAbilities.includes(ab.id);
                      const equipped = equippedAbility === ab.id;
                      return (
                        <div key={ab.id} style={{ border: equipped ? "2px solid #111" : "1px solid #e8e8e8", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, background: equipped ? "#f8f8f8" : "#fff" }}>
                          <span style={{ fontSize: 28 }}>{ab.icon}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#111" }}>{ab.label}</p>
                            <p style={{ margin: 0, fontSize: 11, color: "#888" }}>{ab.desc}</p>
                            {ab.usePrice > 0 && <p style={{ margin: "2px 0 0", fontSize: 10, color: "#aaa" }}>Активация: 🪙{ab.usePrice} · клавиша E</p>}
                            {ab.id === "double" && <p style={{ margin: "2px 0 0", fontSize: 10, color: "#aaa" }}>Пассивная — без затрат</p>}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                            {!owned && <div style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ fontSize: 11 }}>🪙</span><span style={{ fontSize: 12, fontWeight: 700, color: "#b8860b" }}>{ab.price}</span></div>}
                            {!owned
                              ? <button onClick={() => buyAbility(ab)} disabled={totalCoins < ab.price} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", border: "none", borderRadius: 2, background: totalCoins >= ab.price ? "#111" : "#ccc", color: "#fff", cursor: totalCoins >= ab.price ? "pointer" : "not-allowed", fontFamily: "'Space Grotesk', sans-serif" }}>Купить</button>
                              : <button onClick={() => selectAbility(ab.id)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", border: "2px solid #111", borderRadius: 2, background: equipped ? "#111" : "#fff", color: equipped ? "#fff" : "#111", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>{equipped ? "✓ Снять" : "Надеть"}</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ padding: "10px 16px 14px" }}>
                <button onClick={() => setUiState("menu")} style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: "#111", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Назад</button>
              </div>
            </div>
          )}
        </div>

        {/* stamina bar + ability button below canvas */}
        {uiState === "playing" && (
          <div style={{ width: CANVAS_WIDTH, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#888" }}>⚡</span>
            <div style={{ flex: 1, height: 5, background: "#ddd", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${staminaPct * 100}%`, background: staminaPct > 0.5 ? "#111" : staminaPct > 0.25 ? "#e67e22" : "#e74c3c", borderRadius: 3, transition: "width 0.08s, background 0.3s" }} />
            </div>
            {activeAbDef && activeAbDef.id !== "double" && (
              <button onClick={activateAbility} style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", border: "2px solid #111", borderRadius: 2, background: isAbilityOn ? "#111" : "#fff", color: isAbilityOn ? "#fff" : "#111", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", whiteSpace: "nowrap" }}>
                {activeAbDef.icon} E
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
