import { useEffect, useRef, useState, useCallback } from "react";

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;

const DIFFICULTIES = {
  easy: { label: "Лёгкий", gravity: 0.35, jumpForce: -7, pipeSpeed: 2.2, pipeGap: 180, pipeInterval: 110 },
  normal: { label: "Средний", gravity: 0.5, jumpForce: -8, pipeSpeed: 3.2, pipeGap: 145, pipeInterval: 90 },
  hard: { label: "Сложный", gravity: 0.68, jumpForce: -9, pipeSpeed: 4.5, pipeGap: 115, pipeInterval: 70 },
};

type Difficulty = keyof typeof DIFFICULTIES;
type GameState = "menu" | "playing" | "dead" | "scores";

interface Pipe {
  x: number;
  topHeight: number;
  scored: boolean;
}

interface HighScore {
  score: number;
  difficulty: Difficulty;
  date: string;
}

interface WindowWithWebkit extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function createAudioCtx(): AudioContext | null {
  try {
    const W = window as WindowWithWebkit;
    const Ctx = window.AudioContext || W.webkitAudioContext;
    if (!Ctx) return null;
    return new Ctx();
  } catch {
    return null;
  }
}

function playSound(ctx: AudioContext | null, type: "flap" | "score" | "die") {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === "flap") {
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } else if (type === "score") {
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.setValueAtTime(900, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } else {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }
}

const BIRD_SIZE = 26;
const PIPE_WIDTH = 52;
const GROUND_HEIGHT = 60;
const BIRD_X = 90;

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef({
    birdY: CANVAS_HEIGHT / 2,
    birdVY: 0,
    pipes: [] as Pipe[],
    score: 0,
    frame: 0,
    animId: 0,
    state: "menu" as GameState,
    difficulty: "normal" as Difficulty,
    wingAngle: 0,
    deathY: 0,
    deathFrame: 0,
  });
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [uiState, setUiState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [bestScore, setBestScore] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem("flappy_scores");
    if (saved) {
      const parsed: HighScore[] = JSON.parse(saved);
      setHighScores(parsed);
      if (parsed.length > 0) setBestScore(Math.max(...parsed.map((s) => s.score)));
    }
  }, []);

  const saveScore = useCallback((s: number, diff: Difficulty) => {
    if (s === 0) return;
    const entry: HighScore = {
      score: s,
      difficulty: diff,
      date: new Date().toLocaleDateString("ru-RU"),
    };
    setHighScores((prev) => {
      const next = [entry, ...prev].sort((a, b) => b.score - a.score).slice(0, 10);
      localStorage.setItem("flappy_scores", JSON.stringify(next));
      const best = Math.max(...next.map((x) => x.score));
      setBestScore(best);
      return next;
    });
  }, []);

  const drawScene = useCallback((ctx: CanvasRenderingContext2D) => {
    const g = gameRef.current;
    const diff = DIFFICULTIES[g.difficulty];

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // subtle grid
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT - GROUND_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT - GROUND_HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }

    // pipes
    g.pipes.forEach((pipe) => {
      const botY = pipe.topHeight + diff.pipeGap;
      const botH = CANVAS_HEIGHT - GROUND_HEIGHT - botY;

      ctx.fillStyle = "#111111";
      // top pipe
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
      // top cap
      ctx.fillRect(pipe.x - 4, pipe.topHeight - 14, PIPE_WIDTH + 8, 14);

      // bottom pipe
      ctx.fillRect(pipe.x, botY, PIPE_WIDTH, botH);
      // bottom cap
      ctx.fillRect(pipe.x - 4, botY, PIPE_WIDTH + 8, 14);

      // white inner lines
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(pipe.x + 10, 0, 4, pipe.topHeight - 14);
      ctx.fillRect(pipe.x + 10, botY + 14, 4, botH - 14);
    });

    // ground
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, 3);
    // ground pattern
    ctx.fillStyle = "#222222";
    for (let x = (g.frame * 2) % 40; x < CANVAS_WIDTH; x += 40) {
      ctx.fillRect(x, CANVAS_HEIGHT - GROUND_HEIGHT + 10, 20, 3);
    }

    // bird
    const birdY = g.state === "dead" ? g.deathY : g.birdY;
    const angle = g.state === "dead" ? Math.min(Math.PI / 2, g.deathFrame * 0.08) : Math.max(-0.4, Math.min(0.6, g.birdVY * 0.07));

    ctx.save();
    ctx.translate(BIRD_X, birdY);
    ctx.rotate(angle);

    // body
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_SIZE / 2, BIRD_SIZE / 2.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // eye
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(6, -4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(7.5, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(8.5, -5, 1, 0, Math.PI * 2);
    ctx.fill();

    // wing
    const wingOffset = Math.sin(g.wingAngle) * 4;
    ctx.fillStyle = "#555555";
    ctx.beginPath();
    ctx.ellipse(-4, 2 + wingOffset, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // beak
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.moveTo(11, -1);
    ctx.lineTo(18, 1);
    ctx.lineTo(11, 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // score in game
    if (g.state === "playing") {
      ctx.fillStyle = "#111111";
      ctx.font = "bold 36px 'Space Grotesk', monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(g.score), CANVAS_WIDTH / 2, 60);
    }
  }, []);

  const gameLoop = useCallback(() => {
    const g = gameRef.current;
    const diff = DIFFICULTIES[g.difficulty];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (g.state !== "playing") { drawScene(ctx); return; }

    g.frame++;
    g.wingAngle += 0.2;

    // physics
    g.birdVY += diff.gravity;
    g.birdY += g.birdVY;

    // spawn pipes
    if (g.frame % diff.pipeInterval === 0) {
      const minTop = 60;
      const maxTop = CANVAS_HEIGHT - GROUND_HEIGHT - diff.pipeGap - 60;
      const topHeight = Math.random() * (maxTop - minTop) + minTop;
      g.pipes.push({ x: CANVAS_WIDTH + 10, topHeight, scored: false });
    }

    // move pipes
    g.pipes = g.pipes.filter((p) => p.x + PIPE_WIDTH + 10 > 0);
    g.pipes.forEach((pipe) => {
      pipe.x -= diff.pipeSpeed;
      if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
        pipe.scored = true;
        g.score++;
        setScore(g.score);
        playSound(audioCtxRef.current, "score");
      }
    });

    // collision
    const birdLeft = BIRD_X - BIRD_SIZE / 2 + 4;
    const birdRight = BIRD_X + BIRD_SIZE / 2 - 4;
    const birdTop = g.birdY - BIRD_SIZE / 2 + 4;
    const birdBot = g.birdY + BIRD_SIZE / 2 - 4;

    if (birdBot >= CANVAS_HEIGHT - GROUND_HEIGHT || birdTop <= 0) {
      g.state = "dead";
      g.deathY = g.birdY;
      g.deathFrame = 0;
      playSound(audioCtxRef.current, "die");
      saveScore(g.score, g.difficulty);
      setUiState("dead");
      setScore(g.score);
    }

    for (const pipe of g.pipes) {
      const botY = pipe.topHeight + diff.pipeGap;
      const pipeRight = pipe.x + PIPE_WIDTH + 4;
      const pipeLeft = pipe.x - 4;
      if (birdRight > pipeLeft && birdLeft < pipeRight) {
        if (birdTop < pipe.topHeight || birdBot > botY) {
          g.state = "dead";
          g.deathY = g.birdY;
          g.deathFrame = 0;
          playSound(audioCtxRef.current, "die");
          saveScore(g.score, g.difficulty);
          setUiState("dead");
          setScore(g.score);
          break;
        }
      }
    }

    drawScene(ctx);
    g.animId = requestAnimationFrame(gameLoop);
  }, [drawScene, saveScore]);

  const deathLoop = useCallback(() => {
    const g = gameRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (g.state !== "dead") return;

    g.deathFrame++;
    g.deathY = Math.min(CANVAS_HEIGHT - GROUND_HEIGHT - BIRD_SIZE, g.deathY + g.deathFrame * 0.5);
    drawScene(ctx);
    if (g.deathY < CANVAS_HEIGHT - GROUND_HEIGHT - BIRD_SIZE) {
      g.animId = requestAnimationFrame(deathLoop);
    }
  }, [drawScene]);

  useEffect(() => {
    if (uiState === "dead") {
      cancelAnimationFrame(gameRef.current.animId);
      gameRef.current.animId = requestAnimationFrame(deathLoop);
    }
  }, [uiState, deathLoop]);

  const startGame = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
    const g = gameRef.current;
    cancelAnimationFrame(g.animId);
    g.birdY = CANVAS_HEIGHT / 2;
    g.birdVY = 0;
    g.pipes = [];
    g.score = 0;
    g.frame = 0;
    g.wingAngle = 0;
    g.state = "playing";
    g.difficulty = difficulty;
    setScore(0);
    setUiState("playing");
    g.animId = requestAnimationFrame(gameLoop);
  }, [difficulty, gameLoop]);

  const jump = useCallback(() => {
    const g = gameRef.current;
    if (g.state !== "playing") return;
    const diff = DIFFICULTIES[g.difficulty];
    g.birdVY = diff.jumpForce;
    g.wingAngle = 0;
    playSound(audioCtxRef.current, "flap");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  // draw menu/idle state
  useEffect(() => {
    if (uiState === "menu" || uiState === "scores") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      gameRef.current.state = uiState as GameState;
      drawScene(ctx);
    }
  }, [uiState, drawScene]);

  const diffColors: Record<Difficulty, string> = {
    easy: "bg-white border-2 border-black text-black",
    normal: "bg-black text-white border-2 border-black",
    hard: "bg-white border-2 border-black text-black",
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#f5f5f5", fontFamily: "'Space Grotesk', sans-serif" }}
    >
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" />

      <div className="flex flex-col items-center gap-6">
        {/* title */}
        <div className="text-center">
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 32, letterSpacing: "-1px", color: "#111" }}>
            FLAPPY BIRD
          </h1>
          {bestScore > 0 && (
            <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>Рекорд: {bestScore}</p>
          )}
        </div>

        {/* canvas */}
        <div style={{ position: "relative" }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{
              display: "block",
              border: "2px solid #111",
              borderRadius: 4,
              cursor: uiState === "playing" ? "none" : "default",
              userSelect: "none",
              touchAction: "none",
            }}
            onClick={jump}
            onTouchStart={(e) => { e.preventDefault(); jump(); }}
          />

          {/* menu overlay */}
          {uiState === "menu" && (
            <div
              style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 20,
                background: "rgba(255,255,255,0.88)", borderRadius: 2,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 16, letterSpacing: "0.05em", textTransform: "uppercase" }}>Сложность</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      style={{
                        padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                        border: "2px solid #111", borderRadius: 2,
                        background: difficulty === d ? "#111" : "#fff",
                        color: difficulty === d ? "#fff" : "#111",
                        transition: "all 0.15s",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      {DIFFICULTIES[d].label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={startGame}
                style={{
                  padding: "14px 48px", fontSize: 16, fontWeight: 700, cursor: "pointer",
                  border: "2px solid #111", borderRadius: 2,
                  background: "#111", color: "#fff",
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "0.04em",
                }}
              >
                СТАРТ
              </button>

              <p style={{ fontSize: 12, color: "#aaa" }}>Пробел / тап для прыжка</p>

              {highScores.length > 0 && (
                <button
                  onClick={() => setUiState("scores")}
                  style={{
                    fontSize: 13, color: "#666", background: "none", border: "none",
                    cursor: "pointer", textDecoration: "underline", fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  Таблица рекордов
                </button>
              )}
            </div>
          )}

          {/* dead overlay */}
          {uiState === "dead" && (
            <div
              style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 16,
                background: "rgba(255,255,255,0.88)", borderRadius: 2,
              }}
            >
              <p style={{ fontSize: 14, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>Конец игры</p>
              <p style={{ fontSize: 64, fontWeight: 700, color: "#111", lineHeight: 1 }}>{score}</p>
              {bestScore === score && score > 0 && (
                <p style={{ fontSize: 13, color: "#111", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  ★ Новый рекорд!
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 200 }}>
                <button
                  onClick={startGame}
                  style={{
                    padding: "12px 0", fontSize: 15, fontWeight: 700, cursor: "pointer",
                    border: "2px solid #111", borderRadius: 2,
                    background: "#111", color: "#fff",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  СНОВА
                </button>
                <button
                  onClick={() => setUiState("menu")}
                  style={{
                    padding: "10px 0", fontSize: 14, fontWeight: 500, cursor: "pointer",
                    border: "2px solid #111", borderRadius: 2,
                    background: "#fff", color: "#111",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  В меню
                </button>
              </div>
            </div>
          )}

          {/* scores overlay */}
          {uiState === "scores" && (
            <div
              style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", padding: "32px 28px", gap: 4,
                background: "rgba(255,255,255,0.97)", borderRadius: 2, overflowY: "auto",
              }}
            >
              <p style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
                Таблица рекордов
              </p>

              {highScores.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", width: "100%",
                    borderBottom: "1px solid #eee", padding: "8px 0", gap: 12,
                  }}
                >
                  <span style={{ fontSize: 12, color: "#aaa", width: 20, textAlign: "right" }}>#{i + 1}</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: "#111", flex: 1 }}>{s.score}</span>
                  <span style={{ fontSize: 11, color: "#999" }}>{DIFFICULTIES[s.difficulty].label}</span>
                  <span style={{ fontSize: 11, color: "#bbb" }}>{s.date}</span>
                </div>
              ))}

              <button
                onClick={() => setUiState("menu")}
                style={{
                  marginTop: 20, padding: "10px 32px", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", border: "2px solid #111", borderRadius: 2,
                  background: "#111", color: "#fff", fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                Назад
              </button>
            </div>
          )}
        </div>

        {/* live score outside during playing */}
        {uiState === "playing" && (
          <p style={{ fontSize: 13, color: "#888" }}>Счёт: {score}</p>
        )}
      </div>
    </div>
  );
}