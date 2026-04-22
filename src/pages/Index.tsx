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

// ─── Скины ────────────────────────────────────────────────────────────────────
interface SkinDef {
  id: string; label: string; price: number;
  body: string; wing: string; beak: string; eye: string;
  trail?: string;
}
const SKINS: SkinDef[] = [
  { id: "classic",  label: "Классик",  price: 0,   body: "#111111", wing: "#555555", beak: "#111111", eye: "#ffffff" },
  { id: "ghost",    label: "Призрак",  price: 30,  body: "#d8d8d8", wing: "#aaaaaa", beak: "#999999", eye: "#111111", trail: "rgba(200,200,255,0.3)" },
  { id: "midnight", label: "Ночь",     price: 60,  body: "#1a1a2e", wing: "#16213e", beak: "#0f3460", eye: "#e94560", trail: "rgba(233,69,96,0.25)" },
  { id: "gold",     label: "Золото",   price: 100, body: "#b8860b", wing: "#daa520", beak: "#8b6914", eye: "#ffffff", trail: "rgba(218,165,32,0.3)" },
  { id: "cherry",   label: "Вишня",    price: 80,  body: "#c0392b", wing: "#922b21", beak: "#7b241c", eye: "#ffffff" },
  { id: "sky",      label: "Небесный", price: 50,  body: "#2980b9", wing: "#1a5276", beak: "#154360", eye: "#ffffff", trail: "rgba(41,128,185,0.2)" },
  { id: "forest",   label: "Лесной",   price: 70,  body: "#27ae60", wing: "#1e8449", beak: "#196f3d", eye: "#ffffff" },
  { id: "neon",     label: "Неон",     price: 150, body: "#111111", wing: "#333333", beak: "#00ff88", eye: "#00ff88", trail: "rgba(0,255,136,0.3)" },
];

// ─── Способности ──────────────────────────────────────────────────────────────
interface AbilityDef {
  id: string; label: string; icon: string; desc: string;
  price: number; usePrice: number; duration: number;
}
const ABILITIES: AbilityDef[] = [
  { id: "shield",   label: "Щит",          icon: "🛡️", desc: "5 сек неуязвимости",       price: 80,  usePrice: 8,  duration: 300 },
  { id: "slow",     label: "Замедление",   icon: "🐢", desc: "3 сек замедления труб",     price: 100, usePrice: 10, duration: 180 },
  { id: "magnet",   label: "Магнит",       icon: "🧲", desc: "8 сек притягивает монеты",  price: 60,  usePrice: 6,  duration: 480 },
  { id: "double",   label: "Двойной прыжок", icon: "⚡", desc: "Двойной прыжок (пассив)", price: 120, usePrice: 0,  duration: 0 },
];

// ─── Интерфейсы ───────────────────────────────────────────────────────────────
interface Pipe  { x: number; topHeight: number; scored: boolean; }
interface Coin  { x: number; y: number; collected: boolean; pulse: number; }
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

function playSound(ctx: AudioContext | null, type: "flap" | "score" | "die" | "coin" | "ability") {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  const t = ctx.currentTime;
  if (type === "flap") {
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.09);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.start(t); osc.stop(t + 0.12);
  } else if (type === "score") {
    osc.frequency.setValueAtTime(660, t); osc.frequency.setValueAtTime(990, t + 0.09);
    gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.start(t); osc.stop(t + 0.2);
  } else if (type === "coin") {
    osc.frequency.setValueAtTime(880, t); osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
    gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t); osc.stop(t + 0.15);
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

// ─── Рисовать птицу ───────────────────────────────────────────────────────────
function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  smoothAngle: number,   // плавный угол
  wingPhase: number,
  skin: SkinDef,
  staminaRatio: number,
  shieldActive: boolean,
  particles: Particle[]
) {
  // trail particles
  particles.forEach((p) => {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(smoothAngle);

  // shield aura
  if (shieldActive) {
    const pulse = 0.55 + 0.2 * Math.sin(Date.now() * 0.008);
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_SIZE / 2 + 10, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100,180,255,${pulse})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_SIZE / 2 + 14, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100,180,255,${pulse * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // low stamina ring
  if (!shieldActive && staminaRatio < 0.3) {
    const alpha = 0.15 + Math.sin(Date.now() * 0.012) * 0.1;
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_SIZE / 2 + 6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(220,60,60,${alpha})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // tail feathers (плавно качаются)
  const tailSwing = Math.sin(wingPhase * 0.5) * 0.15;
  for (let i = 0; i < 3; i++) {
    const tAngle = tailSwing + (i - 1) * 0.22;
    const tLen = 10 + i * 2;
    ctx.save();
    ctx.rotate(Math.PI + tAngle);
    ctx.fillStyle = skin.wing;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(4, tLen * 0.5, 2, tLen);
    ctx.quadraticCurveTo(-4, tLen * 0.5, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  // body
  ctx.fillStyle = skin.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_SIZE / 2, BIRD_SIZE / 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // belly highlight
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.ellipse(1, 2, BIRD_SIZE / 3, BIRD_SIZE / 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // eye white
  ctx.fillStyle = skin.eye;
  ctx.beginPath(); ctx.arc(6, -4, 5, 0, Math.PI * 2); ctx.fill();
  // pupil
  ctx.fillStyle = skin.body;
  ctx.beginPath(); ctx.arc(7.5, -4, 2.5, 0, Math.PI * 2); ctx.fill();
  // shine
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(8.5, -5, 1, 0, Math.PI * 2); ctx.fill();

  // wing (взмах — более широкий диапазон)
  const wingLift = Math.sin(wingPhase) * 6;
  const wingScale = 0.9 + Math.sin(wingPhase) * 0.15;
  ctx.save();
  ctx.scale(1, wingScale);
  ctx.fillStyle = skin.wing;
  ctx.beginPath();
  ctx.ellipse(-4, 2 + wingLift * 0.5, 9, 5.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // wing tip
  ctx.fillStyle = skin.body;
  ctx.beginPath();
  ctx.ellipse(-9, 3 + wingLift, 4, 3, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // beak
  ctx.fillStyle = skin.beak;
  ctx.beginPath();
  ctx.moveTo(10, -2); ctx.lineTo(18, 0); ctx.lineTo(10, 2);
  ctx.closePath(); ctx.fill();
  // beak line
  ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(17, 0); ctx.stroke();

  ctx.restore();
}

// ─── Компонент ────────────────────────────────────────────────────────────────
export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gameRef = useRef({
    birdY: CANVAS_HEIGHT / 2,
    birdVY: 0,
    // плавная интерполяция угла
    smoothAngle: 0,
    targetAngle: 0,
    // хвостовые частицы
    particles: [] as Particle[],
    wingPhase: 0,

    pipes: [] as Pipe[],
    coins: [] as Coin[],
    score: 0,
    coinsEarned: 0,
    frame: 0,
    animId: 0,
    state: "menu" as GameState,
    difficulty: "normal" as Difficulty,

    deathY: 0,
    deathVY: 0,
    deathAngle: 0,

    stamina: STAMINA_MAX,
    exhausted: false,
    activeSkinId: "classic",

    // способности в бою
    doubleJumpOwned: false,
    doubleJumpUsed: false,

    shieldActive: false,
    shieldFrames: 0,

    slowActive: false,
    slowFrames: 0,

    magnetActive: false,
    magnetFrames: 0,

    activeAbilityId: "" as string,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);

  const [uiState, setUiState]         = useState<GameState>("menu");
  const [score, setScore]             = useState(0);
  const [difficulty, setDifficulty]   = useState<Difficulty>("normal");
  const [highScores, setHighScores]   = useState<HighScore[]>([]);
  const [bestScore, setBestScore]     = useState(0);
  const [totalCoins, setTotalCoins]   = useState(0);
  const [ownedSkins, setOwnedSkins]   = useState<string[]>(["classic"]);
  const [activeSkin, setActiveSkin]   = useState<string>("classic");
  const [ownedAbilities, setOwnedAbilities] = useState<string[]>([]);
  const [equippedAbility, setEquippedAbility] = useState<string>("");
  const [stamDisplay, setStamDisplay] = useState(STAMINA_MAX);
  const [shopMsg, setShopMsg]         = useState("");
  const [shopTab, setShopTab]         = useState<"skins" | "abilities">("skins");
  const [abilityFrames, setAbilityFrames] = useState(0);

  // ── load ──
  useEffect(() => {
    const scores = localStorage.getItem("flappy_scores");
    if (scores) {
      const p: HighScore[] = JSON.parse(scores);
      setHighScores(p);
      if (p.length) setBestScore(Math.max(...p.map((s) => s.score)));
    }
    const coins = localStorage.getItem("flappy_coins");
    if (coins) setTotalCoins(Number(coins));
    const owned = localStorage.getItem("flappy_owned");
    if (owned) setOwnedSkins(JSON.parse(owned));
    const skin = localStorage.getItem("flappy_skin");
    if (skin) { setActiveSkin(skin); gameRef.current.activeSkinId = skin; }
    const oa = localStorage.getItem("flappy_abilities");
    if (oa) setOwnedAbilities(JSON.parse(oa));
    const ea = localStorage.getItem("flappy_equipped");
    if (ea) {
      setEquippedAbility(ea);
      gameRef.current.activeAbilityId = ea;
      if (ea === "double") gameRef.current.doubleJumpOwned = true;
    }
  }, []);

  const addCoins = useCallback((n: number) => {
    setTotalCoins((prev) => {
      const next = prev + n;
      localStorage.setItem("flappy_coins", String(next));
      return next;
    });
  }, []);

  const spendCoins = useCallback((n: number, cb: () => void) => {
    setTotalCoins((prev) => {
      if (prev < n) return prev;
      const next = prev - n;
      localStorage.setItem("flappy_coins", String(next));
      cb();
      return next;
    });
  }, []);

  const saveScore = useCallback((s: number, diff: Difficulty) => {
    if (s === 0) return;
    const entry: HighScore = { score: s, difficulty: diff, date: new Date().toLocaleDateString("ru-RU") };
    setHighScores((prev) => {
      const next = [entry, ...prev].sort((a, b) => b.score - a.score).slice(0, 10);
      localStorage.setItem("flappy_scores", JSON.stringify(next));
      setBestScore(Math.max(...next.map((x) => x.score)));
      return next;
    });
  }, []);

  const buySkin = useCallback((skin: SkinDef) => {
    spendCoins(skin.price, () => {
      setOwnedSkins((o) => {
        const u = [...o, skin.id];
        localStorage.setItem("flappy_owned", JSON.stringify(u));
        return u;
      });
      setShopMsg("Куплено!");
      setTimeout(() => setShopMsg(""), 1500);
    });
  }, [spendCoins]);

  const buyAbility = useCallback((ab: AbilityDef) => {
    spendCoins(ab.price, () => {
      setOwnedAbilities((o) => {
        const u = [...o, ab.id];
        localStorage.setItem("flappy_abilities", JSON.stringify(u));
        return u;
      });
      setShopMsg("Куплено!");
      setTimeout(() => setShopMsg(""), 1500);
    });
  }, [spendCoins]);

  const selectSkin = useCallback((id: string) => {
    setActiveSkin(id); gameRef.current.activeSkinId = id;
    localStorage.setItem("flappy_skin", id);
  }, []);

  const selectAbility = useCallback((id: string) => {
    const next = equippedAbility === id ? "" : id;
    setEquippedAbility(next);
    gameRef.current.activeAbilityId = next;
    gameRef.current.doubleJumpOwned = next === "double";
    localStorage.setItem("flappy_equipped", next);
  }, [equippedAbility]);

  // ── spawn trail particle ──
  const spawnParticle = (g: typeof gameRef.current, skin: SkinDef) => {
    if (!skin.trail) return;
    g.particles.push({
      x: BIRD_X - 8,
      y: g.birdY + (Math.random() - 0.5) * 8,
      vx: -1.2 - Math.random(),
      vy: (Math.random() - 0.5) * 0.8,
      life: 18, maxLife: 18,
      color: skin.trail,
      size: 4 + Math.random() * 3,
    });
  };

  // ── draw ──
  const drawScene = useCallback((ctx: CanvasRenderingContext2D) => {
    const g = gameRef.current;
    const diff = DIFFICULTIES[g.difficulty];
    const skin = SKINS.find((s) => s.id === g.activeSkinId) ?? SKINS[0];
    const staminaRatio = g.stamina / STAMINA_MAX;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // grid
    ctx.strokeStyle = "#f2f2f2"; ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT - GROUND_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT - GROUND_HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }

    // slow effect — полупрозрачный синий оверлей
    if (g.slowActive) {
      ctx.fillStyle = "rgba(41,128,185,0.06)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_HEIGHT);
    }

    // pipes
    g.pipes.forEach((pipe) => {
      const botY = pipe.topHeight + diff.pipeGap;
      const botH = CANVAS_HEIGHT - GROUND_HEIGHT - botY;
      ctx.fillStyle = "#111111";
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
      ctx.fillRect(pipe.x - 4, pipe.topHeight - 14, PIPE_WIDTH + 8, 14);
      ctx.fillRect(pipe.x, botY, PIPE_WIDTH, botH);
      ctx.fillRect(pipe.x - 4, botY, PIPE_WIDTH + 8, 14);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(pipe.x + 10, 0, 4, pipe.topHeight - 14);
      ctx.fillRect(pipe.x + 10, botY + 14, 4, botH - 14);
    });

    // coins
    g.coins.forEach((coin) => {
      if (coin.collected) return;
      coin.pulse = (coin.pulse + 0.07) % (Math.PI * 2);
      const r = COIN_RADIUS + Math.sin(coin.pulse) * 1.5;
      ctx.save();
      // magnet highlight
      if (g.magnetActive) {
        ctx.shadowColor = "#f5c518"; ctx.shadowBlur = 12;
      }
      ctx.beginPath(); ctx.arc(coin.x, coin.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#f5c518"; ctx.fill();
      ctx.strokeStyle = "#c9a000"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#7a5f00";
      ctx.font = `bold ${Math.round(r)}px monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("$", coin.x, coin.y + 0.5);
      ctx.restore();
    });

    // ground
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, 3);
    ctx.fillStyle = "#222222";
    for (let x = (g.frame * 2) % 40; x < CANVAS_WIDTH; x += 40) {
      ctx.fillRect(x, CANVAS_HEIGHT - GROUND_HEIGHT + 10, 20, 3);
    }

    // bird
    if (g.state === "dead") {
      // рисуем птицу в смерти без частиц
      drawBird(ctx, BIRD_X, g.deathY, g.deathAngle, g.wingPhase, skin, 1, false, []);
    } else {
      drawBird(ctx, BIRD_X, g.birdY, g.smoothAngle, g.wingPhase, skin, staminaRatio, g.shieldActive, g.particles);
    }

    if (g.state !== "playing") return;

    // ── HUD ──
    // score
    ctx.fillStyle = "#111111";
    ctx.font = "bold 32px 'Space Grotesk', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(String(g.score), CANVAS_WIDTH / 2, 52);

    // coins count
    ctx.beginPath(); ctx.arc(20, 20, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#f5c518"; ctx.fill();
    ctx.strokeStyle = "#c9a000"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#111111";
    ctx.font = "bold 13px 'Space Grotesk', monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(String(g.coinsEarned), 34, 20);

    // ability cooldown arc
    const abilDef = ABILITIES.find((a) => a.id === g.activeAbilityId);
    if (abilDef && abilDef.id !== "double") {
      const isOn = (abilDef.id === "shield" && g.shieldActive) ||
                   (abilDef.id === "slow"   && g.slowActive)   ||
                   (abilDef.id === "magnet" && g.magnetActive);
      const fr = abilDef.id === "shield" ? g.shieldFrames :
                 abilDef.id === "slow"   ? g.slowFrames   :
                 abilDef.id === "magnet" ? g.magnetFrames : 0;
      const ratio = fr / abilDef.duration;

      ctx.save();
      ctx.translate(CANVAS_WIDTH - 28, 28);
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = isOn ? "rgba(100,180,255,0.15)" : "rgba(0,0,0,0.08)";
      ctx.fill();
      if (isOn) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, 18, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
        ctx.fillStyle = "rgba(100,180,255,0.5)"; ctx.fill();
      }
      ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(abilDef.icon, 0, 1);
      ctx.restore();
    }
    // double jump dot
    if (g.doubleJumpOwned) {
      ctx.beginPath(); ctx.arc(CANVAS_WIDTH - 28, 58, 7, 0, Math.PI * 2);
      ctx.fillStyle = g.doubleJumpUsed ? "#ccc" : "#111";
      ctx.fill();
      ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText("2x", CANVAS_WIDTH - 28, 58);
    }

    // stamina bar
    const BAR_W = 110; const BAR_H = 7;
    const BAR_X = CANVAS_WIDTH / 2 - BAR_W / 2; const BAR_Y = CANVAS_HEIGHT - GROUND_HEIGHT - 20;
    ctx.fillStyle = "#eeeeee";
    ctx.beginPath(); ctx.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, 4); ctx.fill();
    const sRatio = g.stamina / STAMINA_MAX;
    const barColor = sRatio > 0.5 ? "#111111" : sRatio > 0.25 ? "#e67e22" : "#e74c3c";
    ctx.fillStyle = barColor;
    ctx.beginPath(); ctx.roundRect(BAR_X, BAR_Y, BAR_W * sRatio, BAR_H, 4); ctx.fill();
    ctx.fillStyle = "#999"; ctx.font = "9px 'Space Grotesk', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("ВЫНОСЛИВОСТЬ", CANVAS_WIDTH / 2, BAR_Y - 1);

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
    g.deathVY += 0.9;
    g.deathY += g.deathVY;
    g.deathAngle += 0.06;
    g.wingPhase += 0.05;
    if (g.deathY < CANVAS_HEIGHT - GROUND_HEIGHT - BIRD_SIZE) {
      drawScene(ctx);
      g.animId = requestAnimationFrame(deathLoop);
    } else {
      g.deathY = CANVAS_HEIGHT - GROUND_HEIGHT - BIRD_SIZE;
      drawScene(ctx);
    }
  }, [drawScene]);

  // ── game loop ──
  const gameLoop = useCallback(() => {
    const g = gameRef.current;
    const diff = DIFFICULTIES[g.difficulty];
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    if (g.state !== "playing") { drawScene(ctx); return; }

    g.frame++;
    const skin = SKINS.find((s) => s.id === g.activeSkinId) ?? SKINS[0];

    // ability timers
    if (g.shieldActive) { g.shieldFrames--; if (g.shieldFrames <= 0) g.shieldActive = false; }
    if (g.slowActive)   { g.slowFrames--;   if (g.slowFrames <= 0)   g.slowActive = false; }
    if (g.magnetActive) { g.magnetFrames--; if (g.magnetFrames <= 0) g.magnetActive = false; }
    setAbilityFrames(g.shieldFrames || g.slowFrames || g.magnetFrames);

    const speed = g.slowActive ? diff.pipeSpeed * 0.45 : diff.pipeSpeed;

    // stamina
    if (g.birdVY < 0) {
      g.stamina = Math.max(0, g.stamina - 0.08);
    } else {
      g.stamina = Math.min(STAMINA_MAX, g.stamina + 0.35);
    }
    if (g.stamina <= 0) g.exhausted = true;
    if (g.exhausted && g.stamina >= 30) g.exhausted = false;
    setStamDisplay(g.stamina);

    // physics
    g.birdVY += diff.gravity;
    g.birdVY = Math.max(g.birdVY, -12); // cap upward
    g.birdY += g.birdVY;

    // плавный угол — lerp к цели
    g.targetAngle = Math.max(-0.42, Math.min(0.65, g.birdVY * 0.065));
    g.smoothAngle += (g.targetAngle - g.smoothAngle) * 0.18;

    // wing phase
    g.wingPhase += 0.22 + Math.abs(g.birdVY) * 0.02;

    // trail
    if (skin.trail && g.frame % 3 === 0) spawnParticle(g, skin);
    g.particles = g.particles.filter((p) => p.life > 0);
    g.particles.forEach((p) => { p.x += p.vx; p.y += p.vy; p.life--; });

    // spawn pipes
    if (g.frame % diff.pipeInterval === 0) {
      const minTop = 60, maxTop = CANVAS_HEIGHT - GROUND_HEIGHT - diff.pipeGap - 60;
      const topH = Math.random() * (maxTop - minTop) + minTop;
      g.pipes.push({ x: CANVAS_WIDTH + 10, topHeight: topH, scored: false });
      g.coins.push({ x: CANVAS_WIDTH + 10 + PIPE_WIDTH / 2 + 70, y: topH + diff.pipeGap / 2, collected: false, pulse: 0 });
    }

    // move pipes
    g.pipes = g.pipes.filter((p) => p.x + PIPE_WIDTH + 10 > 0);
    g.pipes.forEach((pipe) => {
      pipe.x -= speed;
      if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
        pipe.scored = true; g.score++; setScore(g.score);
        playSound(audioCtxRef.current, "score");
      }
    });

    // move coins
    g.coins = g.coins.filter((c) => c.x + COIN_RADIUS > 0);
    g.coins.forEach((coin) => {
      if (coin.collected) return;
      coin.x -= speed;
      const dx = BIRD_X - coin.x;
      const dy = g.birdY - coin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // magnet: притягивать если близко
      const collectR = g.magnetActive ? BIRD_SIZE / 2 + 60 : BIRD_SIZE / 2 + COIN_RADIUS;
      if (g.magnetActive && dist < 80 && !coin.collected) {
        coin.x += dx * 0.08; coin.y += dy * 0.08;
      }
      if (dist < collectR) {
        coin.collected = true; g.coinsEarned++;
        playSound(audioCtxRef.current, "coin");
      }
    });

    // collision
    const bL = BIRD_X - BIRD_SIZE / 2 + 5, bR = BIRD_X + BIRD_SIZE / 2 - 5;
    const bT = g.birdY - BIRD_SIZE / 2 + 5, bB = g.birdY + BIRD_SIZE / 2 - 5;
    let died = false;
    if (bB >= CANVAS_HEIGHT - GROUND_HEIGHT || bT <= 0) died = true;
    for (const pipe of g.pipes) {
      const botY = pipe.topHeight + diff.pipeGap;
      if (bR > pipe.x - 4 && bL < pipe.x + PIPE_WIDTH + 4) {
        if (bT < pipe.topHeight || bB > botY) { died = true; break; }
      }
    }

    if (died && g.shieldActive) {
      // щит поглощает урон
      g.shieldActive = false; g.shieldFrames = 0;
      g.birdVY = -5;
      died = false;
    }

    if (died) {
      g.state = "dead";
      g.deathY = g.birdY; g.deathVY = g.birdVY; g.deathAngle = g.smoothAngle;
      playSound(audioCtxRef.current, "die");
      saveScore(g.score, g.difficulty);
      addCoins(g.coinsEarned);
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
    g.birdY = CANVAS_HEIGHT / 2; g.birdVY = 0;
    g.smoothAngle = 0; g.targetAngle = 0;
    g.wingPhase = 0; g.particles = [];
    g.pipes = []; g.coins = [];
    g.score = 0; g.coinsEarned = 0; g.frame = 0;
    g.stamina = STAMINA_MAX; g.exhausted = false;
    g.shieldActive = false; g.shieldFrames = 0;
    g.slowActive = false; g.slowFrames = 0;
    g.magnetActive = false; g.magnetFrames = 0;
    g.doubleJumpUsed = false;
    g.state = "playing";
    g.difficulty = difficulty;
    setScore(0); setStamDisplay(STAMINA_MAX); setAbilityFrames(0);
    setUiState("playing");
    g.animId = requestAnimationFrame(gameLoop);
  }, [difficulty, gameLoop]);

  // ── jump ──
  const jump = useCallback(() => {
    const g = gameRef.current;
    if (g.state !== "playing") return;
    if (g.exhausted) return;
    const diff = DIFFICULTIES[g.difficulty];

    // double jump
    if (g.birdVY > 0 && g.doubleJumpOwned && !g.doubleJumpUsed) {
      g.doubleJumpUsed = true;
      g.birdVY = diff.jumpForce * 0.85;
      g.stamina = Math.max(0, g.stamina - 8);
      playSound(audioCtxRef.current, "flap");
      return;
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
    const ab = ABILITIES.find((a) => a.id === g.activeAbilityId);
    if (!ab || ab.id === "double") return;
    const isOn = (ab.id === "shield" && g.shieldActive) ||
                 (ab.id === "slow"   && g.slowActive)   ||
                 (ab.id === "magnet" && g.magnetActive);
    if (isOn) return;

    setTotalCoins((prev) => {
      if (prev < ab.usePrice) return prev;
      const next = prev - ab.usePrice;
      localStorage.setItem("flappy_coins", String(next));
      if (ab.id === "shield") { g.shieldActive = true; g.shieldFrames = ab.duration; }
      if (ab.id === "slow")   { g.slowActive   = true; g.slowFrames   = ab.duration; }
      if (ab.id === "magnet") { g.magnetActive = true; g.magnetFrames = ab.duration; }
      playSound(audioCtxRef.current, "ability");
      return next;
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

  const staminaPct = stamDisplay / STAMINA_MAX;
  const g = gameRef.current;
  const activeAbDef = ABILITIES.find((a) => a.id === equippedAbility);
  const isAbilityOn = activeAbDef
    ? (activeAbDef.id === "shield" && g.shieldActive) ||
      (activeAbDef.id === "slow"   && g.slowActive)   ||
      (activeAbDef.id === "magnet" && g.magnetActive)
    : false;

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#f5f5f5", fontFamily: "'Space Grotesk', sans-serif" }}>
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
            onTouchStart={(e) => { e.preventDefault(); jump(); }}
          />

          {/* ── MENU ── */}
          {uiState === "menu" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "rgba(255,255,255,0.91)", borderRadius: 2 }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Сложность</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                    <button key={d} onClick={() => setDifficulty(d)} style={{ padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: difficulty === d ? "#111" : "#fff", color: difficulty === d ? "#fff" : "#111", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {DIFFICULTIES[d].label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 6, padding: "10px 16px", maxWidth: 280, textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "#555", margin: 0, lineHeight: 1.7 }}>
                  ⚡ Прыжок тратит стамину&nbsp;&nbsp;🪙 Собирай монеты<br/>
                  {equippedAbility && activeAbDef
                    ? <><b>{activeAbDef.icon} {activeAbDef.label}</b> — нажми <b>E</b> чтобы активировать</>
                    : <>Купи способности в <b>🛒 магазине</b></>}
                </p>
              </div>

              <button onClick={startGame} style={{ padding: "13px 52px", fontSize: 16, fontWeight: 700, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: "#111", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                СТАРТ
              </button>

              <div style={{ display: "flex", gap: 10 }}>
                {highScores.length > 0 && (
                  <button onClick={() => setUiState("scores")} style={{ fontSize: 12, color: "#666", background: "none", border: "1px solid #ddd", borderRadius: 2, padding: "6px 12px", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>Рекорды</button>
                )}
                <button onClick={() => setUiState("shop")} style={{ fontSize: 12, fontWeight: 700, color: "#111", background: "#f5c518", border: "none", borderRadius: 2, padding: "6px 14px", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                  🛒 Магазин
                </button>
              </div>
            </div>
          )}

          {/* ── DEAD ── */}
          {uiState === "dead" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(255,255,255,0.91)", borderRadius: 2 }}>
              <p style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Конец игры</p>
              <p style={{ fontSize: 60, fontWeight: 700, color: "#111", lineHeight: 1, margin: 0 }}>{score}</p>
              {bestScore === score && score > 0 && (
                <p style={{ fontSize: 12, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>★ Новый рекорд!</p>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff9e0", border: "1px solid #f5c518", borderRadius: 20, padding: "5px 14px" }}>
                <span>🪙</span>
                <span style={{ fontWeight: 700, color: "#b8860b", fontSize: 14 }}>+{gameRef.current.coinsEarned} монет</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 190 }}>
                <button onClick={startGame} style={{ padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: "#111", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>СНОВА</button>
                <button onClick={() => setUiState("menu")} style={{ padding: "8px 0", fontSize: 13, fontWeight: 500, cursor: "pointer", border: "2px solid #111", borderRadius: 2, background: "#fff", color: "#111", fontFamily: "'Space Grotesk', sans-serif" }}>В меню</button>
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
              {/* shop header */}
              <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Магазин</p>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 13 }}>🪙</span>
                  <span style={{ fontWeight: 700, color: "#b8860b", fontSize: 13 }}>{totalCoins}</span>
                </div>
              </div>

              {/* tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid #eee", margin: "10px 16px 0" }}>
                {(["skins", "abilities"] as const).map((tab) => (
                  <button key={tab} onClick={() => setShopTab(tab)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: shopTab === tab ? 700 : 400, border: "none", background: "none", cursor: "pointer", borderBottom: shopTab === tab ? "2px solid #111" : "2px solid transparent", color: shopTab === tab ? "#111" : "#aaa", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {tab === "skins" ? "Скины" : "Способности"}
                  </button>
                ))}
              </div>

              {shopMsg && (
                <div style={{ margin: "8px 16px 0", textAlign: "center", padding: "6px", background: shopMsg === "Куплено!" ? "#e8f8e8" : "#fde8e8", border: `1px solid ${shopMsg === "Куплено!" ? "#aed6ae" : "#f5aeae"}`, borderRadius: 4, fontSize: 12, fontWeight: 600, color: shopMsg === "Куплено!" ? "#2e7d32" : "#c62828" }}>
                  {shopMsg}
                </div>
              )}

              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
                {shopTab === "skins" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {SKINS.map((skin) => {
                      const owned = ownedSkins.includes(skin.id);
                      const isActive = activeSkin === skin.id;
                      return (
                        <div key={skin.id} style={{ border: isActive ? "2px solid #111" : "1px solid #e0e0e0", borderRadius: 6, padding: "10px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: isActive ? "#f8f8f8" : "#fff" }}>
                          <svg width="54" height="40" style={{ overflow: "visible" }}>
                            {/* tail */}
                            <polygon points="16,24 9,18 9,28" fill={skin.wing} />
                            {/* body */}
                            <ellipse cx="27" cy="21" rx="13" ry="10" fill={skin.body} />
                            <ellipse cx="28" cy="22" rx="9" ry="7" fill="rgba(255,255,255,0.08)" />
                            {/* eye */}
                            <circle cx="33" cy="16" r="5" fill={skin.eye} />
                            <circle cx="34.5" cy="16" r="2.5" fill={skin.body} />
                            <circle cx="35.5" cy="15" r="1" fill="#fff" />
                            {/* wing */}
                            <ellipse cx="22" cy="23" rx="8" ry="5" fill={skin.wing} />
                            {/* beak */}
                            <polygon points="37,19 45,21 37,23" fill={skin.beak} />
                          </svg>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#111" }}>{skin.label}</span>
                          {skin.trail && <span style={{ fontSize: 9, color: "#aaa" }}>✨ след</span>}
                          {skin.price === 0
                            ? <span style={{ fontSize: 10, color: "#aaa" }}>Бесплатно</span>
                            : <div style={{ display: "flex", gap: 3, alignItems: "center" }}><span style={{ fontSize: 11 }}>🪙</span><span style={{ fontSize: 11, fontWeight: 600, color: "#b8860b" }}>{skin.price}</span></div>}
                          {isActive
                            ? <span style={{ fontSize: 10, fontWeight: 700, color: "#111" }}>✓ Активен</span>
                            : owned
                              ? <button onClick={() => selectSkin(skin.id)} style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", border: "1.5px solid #111", borderRadius: 2, background: "#fff", color: "#111", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>Выбрать</button>
                              : <button onClick={() => { if (ownedSkins.includes(skin.id)) return; buySkin(skin); }} disabled={totalCoins < skin.price} style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", border: "none", borderRadius: 2, background: totalCoins >= skin.price ? "#111" : "#ccc", color: "#fff", cursor: totalCoins >= skin.price ? "pointer" : "not-allowed", fontFamily: "'Space Grotesk', sans-serif" }}>Купить</button>
                          }
                        </div>
                      );
                    })}
                  </div>
                )}

                {shopTab === "abilities" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ABILITIES.map((ab) => {
                      const owned = ownedAbilities.includes(ab.id);
                      const equipped = equippedAbility === ab.id;
                      return (
                        <div key={ab.id} style={{ border: equipped ? "2px solid #111" : "1px solid #e8e8e8", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, background: equipped ? "#f8f8f8" : "#fff" }}>
                          <span style={{ fontSize: 28 }}>{ab.icon}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#111" }}>{ab.label}</p>
                            <p style={{ margin: 0, fontSize: 11, color: "#888" }}>{ab.desc}</p>
                            {ab.usePrice > 0 && (
                              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#aaa" }}>Использование: 🪙{ab.usePrice} · Клавиша E</p>
                            )}
                            {ab.id === "double" && (
                              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#aaa" }}>Пассивная способность</p>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                            {!owned && (
                              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <span style={{ fontSize: 11 }}>🪙</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#b8860b" }}>{ab.price}</span>
                              </div>
                            )}
                            {!owned
                              ? <button onClick={() => buyAbility(ab)} disabled={totalCoins < ab.price} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", border: "none", borderRadius: 2, background: totalCoins >= ab.price ? "#111" : "#ccc", color: "#fff", cursor: totalCoins >= ab.price ? "pointer" : "not-allowed", fontFamily: "'Space Grotesk', sans-serif" }}>Купить</button>
                              : <button onClick={() => selectAbility(ab.id)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", border: "2px solid #111", borderRadius: 2, background: equipped ? "#111" : "#fff", color: equipped ? "#fff" : "#111", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>{equipped ? "✓ Снять" : "Экипировать"}</button>
                            }
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

        {/* stamina + ability bar below canvas */}
        {uiState === "playing" && (
          <div style={{ width: CANVAS_WIDTH, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>⚡</span>
            <div style={{ flex: 1, height: 5, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${staminaPct * 100}%`, background: staminaPct > 0.5 ? "#111" : staminaPct > 0.25 ? "#e67e22" : "#e74c3c", borderRadius: 3, transition: "width 0.08s" }} />
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
