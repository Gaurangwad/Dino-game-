/* ============================================================
   DINO EVOLUTION — AI Summon Runner
   Cozy cel-shaded runner (inspired by messenger.abeto.co):
   soft sunset palette, rounded low-poly shapes, dark outlines.
   The dino evolves with distance; you (or Claude, or AUTO mode)
   can summon any hazard onto it.
   ============================================================ */

(() => {
  "use strict";

  // ---- Canvas ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, GROUND_Y = 0, DPR = 1;

  // Cozy cel-shaded palette.
  const C = {
    ink: "#33293f",
    skyTop: "#c6b3e6", skyMid: "#ffc79e", skyLow: "#ffe2c0",
    sun: "#fff3d6", sunGlow: "rgba(255,225,170,0.55)",
    hillFar: "#b9a3d4", hillMid: "#e7a98f", hillNear: "#f2c28c",
    groundTop: "#e9c28d", groundBot: "#d2a368",
    cactus: "#7cc28a", cactusShade: "#5da870",
    cloud: "#fff6e9",
  };

  function resize() {
    const wrap = canvas.parentElement;
    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    W = cssW; H = cssH;
    GROUND_Y = H - Math.max(96, Math.min(H * 0.22, 180));
    initBackground();
    if (state !== "playing") render();
  }
  window.addEventListener("resize", resize);

  const el = {
    score: document.getElementById("score"),
    hiscore: document.getElementById("hiscore"),
    stage: document.getElementById("stage"),
    overlay: document.getElementById("overlay"),
    gameover: document.getElementById("gameover"),
    finalScore: document.getElementById("finalScore"),
    finalStage: document.getElementById("finalStage"),
    newHi: document.getElementById("newHi"),
    startBtn: document.getElementById("startBtn"),
    restartBtn: document.getElementById("restartBtn"),
    summonText: document.getElementById("summonText"),
    summonBtn: document.getElementById("summonBtn"),
    aiLog: document.getElementById("aiLog"),
    apiKey: document.getElementById("apiKey"),
    autoToggle: document.getElementById("autoToggle"),
    fullscreenBtn: document.getElementById("fullscreenBtn"),
  };

  // ---- Evolution stages ----
  const STAGES = [
    { name: "Egg",          at: 0,    w: 30, h: 36, body: "#fbe7cf", accent: "#e0b07d", belly: "#fff6e9", doubleJump: false, glide: false },
    { name: "Hatchling",    at: 150,  w: 36, h: 42, body: "#a9e08a", accent: "#7cbb5e", belly: "#e9f7d4", doubleJump: false, glide: false },
    { name: "Raptor",       at: 400,  w: 44, h: 50, body: "#7fd0a0", accent: "#52a878", belly: "#dff5e6", doubleJump: true,  glide: false },
    { name: "T-Rex",        at: 800,  w: 56, h: 62, body: "#6cc06a", accent: "#3f9a48", belly: "#dff0cf", doubleJump: true,  glide: false },
    { name: "Winged Drake", at: 1400, w: 58, h: 60, body: "#7cb8e6", accent: "#3f86c4", belly: "#dfeefb", doubleJump: true,  glide: true,  wings: true },
    { name: "Cyber-Dragon", at: 2200, w: 64, h: 66, body: "#c79bf0", accent: "#8a4fd0", belly: "#f0e3ff", doubleJump: true,  glide: true,  wings: true, glow: true },
  ];

  // ---- Game state ----
  let state = "menu";
  let lastTime = 0;
  let distance = 0;
  let speed = 360;
  let hiscore = Number(localStorage.getItem("dino_hi") || 0);

  const player = { x: 150, y: 0, vy: 0, w: 30, h: 36, onGround: true, jumps: 0, ducking: false, stageIndex: 0, legPhase: 0 };
  const GRAVITY = 2400;
  const JUMP_V = -780;

  let obstacles = [], hazards = [], particles = [];
  let bgStars = [], clouds = [], hillsFar = [], hillsNear = [];
  let nextObstacleIn = 1.2;
  let autoTimer = 0;
  let screenShake = 0, flash = 0, sunPulse = 0;

  const keys = {};
  function isJumpKey(k) { return k === " " || k === "ArrowUp" || k === "Spacebar" || k === "Up"; }

  window.addEventListener("keydown", (e) => {
    if (document.activeElement === el.summonText || document.activeElement === el.apiKey) return;
    if (isJumpKey(e.key)) { e.preventDefault(); if (state === "playing") doJump(); else startGame(); }
    if (e.key === "ArrowDown" || e.key === "Down") { e.preventDefault(); player.ducking = true; }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowDown" || e.key === "Down") player.ducking = false;
    if (isJumpKey(e.key)) keys.jumpHeld = false;
  });
  canvas.addEventListener("pointerdown", () => { if (state === "playing") doJump(); else startGame(); });

  function doJump() {
    const st = STAGES[player.stageIndex];
    const maxJumps = st.doubleJump ? 2 : 1;
    if (player.jumps < maxJumps) {
      player.vy = JUMP_V * (player.jumps === 0 ? 1 : 0.85);
      player.jumps++; player.onGround = false; keys.jumpHeld = true;
      spawnDust(player.x, GROUND_Y);
    }
  }

  // ---- Background ----
  function initBackground() {
    bgStars = [];
    for (let i = 0; i < 36; i++) bgStars.push({ x: Math.random() * W, y: Math.random() * (GROUND_Y * 0.5), r: Math.random() * 1.4 + 0.5, tw: Math.random() * 6 });
    clouds = [];
    for (let i = 0; i < 5; i++) clouds.push({ x: Math.random() * W, y: 30 + Math.random() * (GROUND_Y * 0.4), s: 0.25 + Math.random() * 0.4, scale: 0.7 + Math.random() * 0.9 });
    hillsFar = makeHills(GROUND_Y - 6, 110, 0.32);
    hillsNear = makeHills(GROUND_Y + 4, 70, 0.55);
  }
  function makeHills(baseY, amp, speedFactor) {
    const pts = [];
    const step = 90;
    for (let x = -step; x <= W + step * 2; x += step) {
      pts.push({ x, y: baseY - amp * (0.4 + Math.random() * 0.6) });
    }
    return { pts, baseY, amp, speedFactor, offset: 0, step };
  }

  // ============================================================
  //  SUMMON ENGINE
  // ============================================================
  const HAZARD_LIBRARY = {
    meteor:    { label: "Meteor shower",   emoji: "☄️" },
    spaceship: { label: "Alien spaceship", emoji: "🛸" },
    hunter:    { label: "Hunter",          emoji: "🏹" },
    lightning: { label: "Lightning storm", emoji: "⚡" },
    bird:      { label: "Bird swarm",      emoji: "🦅" },
    boulder:   { label: "Rolling boulder", emoji: "🪨" },
  };
  const HAZARD_KEYS = Object.keys(HAZARD_LIBRARY);

  function interpretOffline(text) {
    const t = text.toLowerCase();
    const has = (...w) => w.some((x) => t.includes(x));
    if (has("meteor", "comet", "asteroid", "fireball", "shooting star")) return { type: "meteor" };
    if (has("spaceship", "ufo", "alien", "saucer", "mothership", "ship")) return { type: "spaceship" };
    if (has("hunter", "human", "soldier", "archer", "poacher", "ranger", "man")) return { type: "hunter" };
    if (has("lightning", "thunder", "storm", "bolt", "zeus", "electric")) return { type: "lightning" };
    if (has("bird", "ptero", "eagle", "dragon", "flock", "swarm", "bat", "fly")) return { type: "bird" };
    if (has("boulder", "rock", "stone", "rolling", "ball", "wheel")) return { type: "boulder" };
    if (has("rain", "fire", "hail", "missile", "bomb", "drop")) return { type: "meteor" };
    return { type: HAZARD_KEYS[(Math.random() * HAZARD_KEYS.length) | 0], improvised: true };
  }

  async function interpretWithClaude(text, apiKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json", "x-api-key": apiKey,
        "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: 64,
        system: "You are the hazard director for a dinosaur runner game. Map the player's text " +
          "to the closest hazard type from: " + HAZARD_KEYS.join(", ") +
          '. Reply ONLY compact JSON like {"type":"meteor","count":4,"intensity":1.4}. count 1-6, intensity 0.6-2.0.',
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) throw new Error("API " + res.status);
    const data = await res.json();
    const raw = (data.content && data.content[0] && data.content[0].text) || "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json");
    const spec = JSON.parse(m[0]);
    if (!HAZARD_LIBRARY[spec.type]) throw new Error("bad type");
    return spec;
  }

  async function summon(text, fromAuto) {
    text = (text || "").trim();
    if (!text) return;
    if (state !== "playing") { if (!fromAuto) setLog("Start a run first, then summon!", "err"); return; }

    const apiKey = el.apiKey.value.trim();
    let spec;
    if (apiKey && !fromAuto) {
      setLog("✦ Claude is conjuring “" + text + "”…");
      try { spec = await interpretWithClaude(text, apiKey); }
      catch (e) { setLog("Claude offline (" + e.message + ") — using built-in engine.", "err"); spec = interpretOffline(text); }
    } else {
      spec = interpretOffline(text);
    }

    const info = HAZARD_LIBRARY[spec.type];
    const intensity = clamp(spec.intensity || 1, 0.6, 2.2);
    const count = clamp(spec.count || defaultCount(spec.type), 1, 6);
    spawnHazard(spec.type, count, intensity);
    const verb = fromAuto ? "AUTO rained" : (spec.improvised ? "improvised" : "summoned");
    setLog(info.emoji + " " + verb + " " + info.label + " ×" + count + "!");
    if (!fromAuto) el.summonText.value = "";
  }
  function defaultCount(t) { return ({ meteor: 4, bird: 3, lightning: 2, hunter: 1, spaceship: 1, boulder: 1 })[t] || 1; }

  let logTimer = 0;
  function setLog(msg, cls) {
    el.aiLog.textContent = msg;
    el.aiLog.className = "ai-log" + (cls ? " " + cls : "");
    el.aiLog.style.opacity = "1";
    logTimer = 3.2;
  }

  // ============================================================
  //  HAZARD SPAWNING
  // ============================================================
  function spawnHazard(type, count, intensity) {
    for (let i = 0; i < count; i++) {
      const delay = i * (0.35 / intensity);
      setTimeout(() => { if (state === "playing") createHazard(type, intensity); }, delay * 1000);
    }
    if (type === "lightning" || type === "meteor") flash = Math.max(flash, 0.22);
  }

  function createHazard(type, intensity) {
    switch (type) {
      case "meteor":
        hazards.push({ type, x: W * (0.4 + Math.random() * 0.7), y: -30, w: 28, h: 28,
          vx: -(180 + Math.random() * 70), vy: 260 + Math.random() * 130 * intensity, rot: 0 }); break;
      case "spaceship":
        hazards.push({ type, x: W + 50, y: GROUND_Y * 0.32 + Math.random() * 60, w: 74, h: 34,
          vx: -(160 + 60 * intensity), bombTimer: 0.6, bob: Math.random() * 6 }); break;
      case "hunter":
        hazards.push({ type, x: W + 30, y: GROUND_Y, w: 30, h: 48,
          vx: -(120 + 40 * intensity), shootTimer: 0.8, walk: 0 }); break;
      case "lightning":
        hazards.push({ type, x: player.x + 60 + Math.random() * 180, y: 0, w: 26, h: GROUND_Y, warn: 0.7, alive: 0 }); break;
      case "bird": {
        const lanes = [GROUND_Y - 8, GROUND_Y - 64, GROUND_Y - 120];
        hazards.push({ type, x: W + 30, y: lanes[(Math.random() * lanes.length) | 0], w: 40, h: 26,
          vx: -(speed * 0.9 + 80 * intensity), flap: 0 }); break;
      }
      case "boulder":
        hazards.push({ type, x: W + 50, y: GROUND_Y, w: 54, h: 54,
          vx: -(speed + 120 * intensity), rot: 0 }); break;
    }
  }
  function fireProjectile(x, y, vx, vy, kind) { hazards.push({ type: "projectile", kind, x, y, w: 14, h: 6, vx, vy }); }

  // ---- Particles ----
  function spawnDust(x, y) {
    for (let i = 0; i < 6; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 70, life: .4, max: .4, c: "#cda980", r: 2 + Math.random() * 2 });
  }
  function spawnExplosion(x, y, color) {
    for (let i = 0; i < 20; i++) { const a = Math.random() * 6.28, s = 60 + Math.random() * 240; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .6, max: .6, c: color || "#ff8a3d", r: 2 + Math.random() * 3 }); }
    screenShake = Math.max(screenShake, 11);
  }

  // ============================================================
  //  GAME FLOW
  // ============================================================
  function startGame() {
    state = "playing";
    distance = 0; speed = 360;
    obstacles = []; hazards = []; particles = [];
    nextObstacleIn = 1.2; autoTimer = 1.5; screenShake = 0; flash = 0;
    Object.assign(player, { x: 150, y: GROUND_Y, vy: 0, onGround: true, jumps: 0, ducking: false, stageIndex: 0, legPhase: 0 });
    el.overlay.classList.add("hidden");
    el.gameover.classList.add("hidden");
    initBackground();
    setLog("Run started — summon something or flip AUTO on!");
    lastTime = performance.now();
  }

  function gameOver() {
    state = "over";
    const d = Math.floor(distance);
    el.finalScore.textContent = d;
    el.finalStage.textContent = STAGES[player.stageIndex].name;
    if (d > hiscore) { hiscore = d; localStorage.setItem("dino_hi", String(d)); el.hiscore.textContent = d; el.newHi.classList.remove("hidden"); }
    else el.newHi.classList.add("hidden");
    spawnExplosion(player.x, player.y - player.h / 2, "#ff6a4d");
    el.gameover.classList.remove("hidden");
  }

  // ============================================================
  //  UPDATE
  // ============================================================
  function update(dt) {
    distance += (speed * dt) / 30;
    speed = 360 + Math.min(distance * 0.16, 380);
    sunPulse += dt;

    let si = 0;
    for (let i = 0; i < STAGES.length; i++) if (distance >= STAGES[i].at) si = i;
    if (si !== player.stageIndex) { player.stageIndex = si; onEvolve(STAGES[si]); }
    const st = STAGES[player.stageIndex];
    player.w = st.w; player.h = st.h;

    const gliding = st.glide && keys.jumpHeld && player.vy > 0;
    player.vy += GRAVITY * dt * (gliding ? 0.35 : 1);
    player.y += player.vy * dt;
    if (player.y >= GROUND_Y) { player.y = GROUND_Y; player.vy = 0; player.onGround = true; player.jumps = 0; }
    if (player.onGround) player.legPhase += dt * (speed / 40);

    nextObstacleIn -= dt;
    if (nextObstacleIn <= 0) { spawnGroundObstacle(); nextObstacleIn = clamp(1.5 - distance * 0.0003, 0.7, 1.5) + Math.random() * 0.9; }

    // AUTO mode: periodically rain a random hazard.
    if (el.autoToggle.checked) {
      autoTimer -= dt;
      if (autoTimer <= 0) {
        const type = HAZARD_KEYS[(Math.random() * HAZARD_KEYS.length) | 0];
        summon(HAZARD_LIBRARY[type].label, true);
        autoTimer = clamp(3.2 - distance * 0.0006, 1.3, 3.2) + Math.random() * 1.4;
      }
    }

    updateObstacles(dt);
    updateHazards(dt);
    updateParticles(dt);

    if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 30);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.5);
    if (logTimer > 0) { logTimer -= dt; if (logTimer <= 0) el.aiLog.style.opacity = "0.0"; }

    for (const c of clouds) { c.x -= c.s * speed * dt * 0.12; if (c.x < -80) { c.x = W + 80; c.y = 30 + Math.random() * (GROUND_Y * 0.4); } }
    hillsFar.offset = (hillsFar.offset + speed * dt * hillsFar.speedFactor) % hillsFar.step;
    hillsNear.offset = (hillsNear.offset + speed * dt * hillsNear.speedFactor) % hillsNear.step;

    el.score.textContent = Math.floor(distance);
    el.stage.textContent = st.name;
    el.hiscore.textContent = Math.max(hiscore, Math.floor(distance));
  }

  function onEvolve(st) {
    spawnExplosion(player.x, player.y - st.h / 2, st.accent);
    flash = Math.max(flash, 0.3);
    setLog("🧬 Evolved into " + st.name + "!" + (st.doubleJump ? " (double-jump!)" : "") + (st.glide ? " (hold to glide!)" : ""));
  }

  function spawnGroundObstacle() {
    const tall = Math.random() < 0.4;
    const cluster = Math.random() < 0.3 ? 2 : 1;
    obstacles.push({ x: W + 20, y: GROUND_Y, w: tall ? 22 : 18 * cluster, h: tall ? 54 : 36, tall });
  }

  function updateObstacles(dt) {
    for (const o of obstacles) o.x -= speed * dt;
    obstacles = obstacles.filter((o) => o.x + o.w > -10);
    for (const o of obstacles) if (hits(playerBox(), { x: o.x, y: o.y - o.h, w: o.w, h: o.h })) gameOver();
  }

  function updateHazards(dt) {
    for (const hz of hazards) {
      switch (hz.type) {
        case "meteor":
          hz.x += hz.vx * dt; hz.y += hz.vy * dt; hz.rot += dt * 8;
          if (hz.y >= GROUND_Y) { spawnExplosion(hz.x, GROUND_Y, "#ff8a3d"); hz.dead = true; } break;
        case "spaceship":
          hz.x += hz.vx * dt; hz.y += Math.sin(performance.now() / 400 + hz.bob) * 12 * dt;
          hz.bombTimer -= dt;
          if (hz.bombTimer <= 0 && hz.x < W - 40 && hz.x > 60) { hz.bombTimer = 0.9; fireProjectile(hz.x, hz.y + 16, -40, 260, "bomb"); }
          if (hz.x < -90) hz.dead = true; break;
        case "hunter":
          hz.x += hz.vx * dt; hz.walk += dt * 8; hz.shootTimer -= dt;
          if (hz.shootTimer <= 0 && hz.x > player.x) { hz.shootTimer = 1.1; fireProjectile(hz.x - 14, hz.y - 30, -480, -30, "arrow"); }
          if (hz.x < -40) hz.dead = true; break;
        case "lightning":
          if (hz.warn > 0) hz.warn -= dt; else { hz.alive += dt; if (hz.alive > 0.22) hz.dead = true; } break;
        case "bird":
          hz.x += hz.vx * dt; hz.flap += dt * 12; if (hz.x < -60) hz.dead = true; break;
        case "boulder":
          hz.x += hz.vx * dt; hz.rot -= (hz.vx * dt) / (hz.w / 2); if (hz.x < -70) hz.dead = true; break;
        case "projectile":
          hz.x += hz.vx * dt; hz.y += (hz.vy || 0) * dt;
          if (hz.kind === "bomb" && hz.y >= GROUND_Y) { spawnExplosion(hz.x, GROUND_Y, "#9be7ff"); hz.dead = true; }
          if (hz.x < -30 || hz.x > W + 80 || hz.y > H + 20) hz.dead = true; break;
      }
      if (!hz.dead && hazardHitsPlayer(hz)) {
        if (!(hz.type === "lightning" && hz.warn > 0)) gameOver();
      }
    }
    hazards = hazards.filter((h) => !h.dead);
  }

  function hazardHitsPlayer(hz) {
    const pb = playerBox();
    if (hz.type === "lightning") { if (hz.warn > 0) return false; return hits(pb, { x: hz.x - 8, y: 0, w: 16, h: GROUND_Y }); }
    return hits(pb, { x: hz.x - hz.w / 2, y: hz.y - hz.h, w: hz.w, h: hz.h });
  }

  function updateParticles(dt) {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
  }

  function playerBox() {
    const duckH = player.ducking && player.onGround ? player.h * 0.6 : player.h;
    const pad = 5;
    return { x: player.x - player.w / 2 + pad, y: player.y - duckH + pad, w: player.w - pad * 2, h: duckH - pad * 2 };
  }
  function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ============================================================
  //  RENDER (cel-shaded with outlines)
  // ============================================================
  function outline(lw) { ctx.strokeStyle = C.ink; ctx.lineWidth = lw || 3; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(); }

  function render() {
    ctx.save();
    if (screenShake > 0) ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    drawSky();
    drawHills(hillsFar, C.hillFar, 0.5);
    drawClouds();
    drawHills(hillsNear, C.hillNear, 0.9);
    drawGround();
    drawObstacles();
    drawHazards();
    drawDino();
    drawParticles();
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = "rgba(255,255,255," + flash * 0.5 + ")"; ctx.fillRect(0, 0, W, H); }
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, C.skyTop); g.addColorStop(0.55, C.skyMid); g.addColorStop(1, C.skyLow);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y);
    // Soft sun.
    const sx = W * 0.78, sy = GROUND_Y * 0.42, r = 46 + Math.sin(sunPulse) * 2;
    const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, r * 2.6);
    sg.addColorStop(0, C.sunGlow); sg.addColorStop(1, "rgba(255,225,170,0)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, r * 2.6, 0, 6.283); ctx.fill();
    ctx.fillStyle = C.sun; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.283); ctx.fill(); outline(3);
    // Stars near top.
    for (const s of bgStars) { s.tw += 0.04; ctx.globalAlpha = 0.25 + Math.abs(Math.sin(s.tw)) * 0.4; ctx.fillStyle = "#fff"; ctx.fillRect(s.x, s.y, s.r, s.r); }
    ctx.globalAlpha = 1;
  }

  function drawClouds() {
    ctx.fillStyle = C.cloud;
    for (const c of clouds) {
      const s = c.scale;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 30 * s, 16 * s, 0, 0, 6.283);
      ctx.ellipse(c.x + 26 * s, c.y + 4, 22 * s, 13 * s, 0, 0, 6.283);
      ctx.ellipse(c.x - 26 * s, c.y + 4, 22 * s, 13 * s, 0, 0, 6.283);
      ctx.fill(); outline(2.5);
    }
  }

  function drawHills(hill, color, lw) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-hill.step, H);
    let first = true;
    for (const p of hill.pts) {
      const x = p.x - hill.offset;
      if (first) { ctx.lineTo(x, p.y); first = false; }
      else ctx.lineTo(x, p.y);
    }
    ctx.lineTo(W + hill.step, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = lw * 3; ctx.lineJoin = "round";
    // Only stroke the top ridge.
    ctx.beginPath(); first = true;
    for (const p of hill.pts) { const x = p.x - hill.offset; if (first) { ctx.moveTo(x, p.y); first = false; } else ctx.lineTo(x, p.y); }
    ctx.stroke();
  }

  function drawGround() {
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    g.addColorStop(0, C.groundTop); g.addColorStop(1, C.groundBot);
    ctx.fillStyle = g; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); outline(4);
    // Scrolling pebble dashes.
    ctx.strokeStyle = "rgba(51,41,63,0.18)"; ctx.lineWidth = 4;
    const off = (distance * 9) % 56;
    for (let x = -off; x < W; x += 56) { ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 22); ctx.lineTo(x + 20, GROUND_Y + 22); ctx.stroke(); }
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.fillStyle = C.cactus;
      roundRectPath(o.x, o.y - o.h, o.w, o.h, 8); ctx.fill(); outline(3);
      // arms
      ctx.fillStyle = C.cactus;
      roundRectPath(o.x - 6, o.y - o.h * 0.62, 7, o.h * 0.28, 4); ctx.fill(); outline(2.5);
      roundRectPath(o.x + o.w - 1, o.y - o.h * 0.72, 7, o.h * 0.28, 4); ctx.fill(); outline(2.5);
      // shade stripe
      ctx.fillStyle = C.cactusShade; ctx.fillRect(o.x + o.w * 0.62, o.y - o.h + 4, o.w * 0.22, o.h - 8);
    }
  }

  function drawHazards() {
    for (const hz of hazards) ({
      meteor: drawMeteor, spaceship: drawSpaceship, hunter: drawHunter,
      lightning: drawLightning, bird: drawBird, boulder: drawBoulder, projectile: drawProjectile,
    })[hz.type](hz);
  }

  function drawMeteor(hz) {
    ctx.strokeStyle = "rgba(255,150,60,0.55)"; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hz.x, hz.y); ctx.lineTo(hz.x - hz.vx * 0.05, hz.y - hz.vy * 0.05); ctx.stroke();
    ctx.fillStyle = "#6a4636"; ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.w / 2, 0, 6.283); ctx.fill(); outline(3);
    ctx.fillStyle = "#ffae5c"; ctx.beginPath(); ctx.arc(hz.x - 3, hz.y - 3, hz.w / 4, 0, 6.283); ctx.fill();
  }
  function drawSpaceship(hz) {
    ctx.save(); ctx.translate(hz.x, hz.y);
    ctx.fillStyle = "#aab6c4"; ctx.beginPath(); ctx.ellipse(0, 0, hz.w / 2, hz.h / 3, 0, 0, 6.283); ctx.fill(); outline(3);
    ctx.fillStyle = "#a9def0"; ctx.beginPath(); ctx.ellipse(0, -9, hz.w / 4, hz.h / 2.6, 0, Math.PI, 0); ctx.fill(); outline(3);
    ctx.fillStyle = "#8fd6a8"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 13, 7, 3, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
  function drawHunter(hz) {
    ctx.save(); ctx.translate(hz.x, hz.y);
    const swing = Math.sin(hz.walk) * 4;
    ctx.fillStyle = "#3a2a1a"; roundRectPath(-8, -16, 6, 16 + swing, 2); ctx.fill(); outline(2);
    roundRectPath(2, -16, 6, 16 - swing, 2); ctx.fill(); outline(2);
    ctx.fillStyle = "#d98b5f"; roundRectPath(-9, -42, 18, 28, 6); ctx.fill(); outline(3);  // cloak
    ctx.fillStyle = "#f0c69c"; ctx.beginPath(); ctx.arc(0, -48, 8, 0, 6.283); ctx.fill(); outline(3); // head
    ctx.strokeStyle = "#7a4a1a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-13, -30, 11, -1.3, 1.3); ctx.stroke();
    ctx.restore();
  }
  function drawLightning(hz) {
    if (hz.warn > 0) {
      ctx.strokeStyle = "rgba(255,210,80," + (0.3 + Math.abs(Math.sin(performance.now() / 60)) * 0.5) + ")";
      ctx.setLineDash([7, 7]); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(hz.x, 0); ctx.lineTo(hz.x, GROUND_Y); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "#fff0a0"; ctx.lineWidth = 6; ctx.shadowColor = "#ffe680"; ctx.shadowBlur = 18; ctx.lineJoin = "round";
      ctx.beginPath(); let y = 0, x = hz.x; ctx.moveTo(x, y);
      while (y < GROUND_Y) { y += 30; x = hz.x + (Math.random() - 0.5) * 28; ctx.lineTo(x, y); }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  }
  function drawBird(hz) {
    ctx.save(); ctx.translate(hz.x, hz.y - hz.h / 2);
    const flap = Math.sin(hz.flap) * 11;
    ctx.fillStyle = "#caa9f0";
    roundRectPath(-hz.w / 2, -5, hz.w, 10, 5); ctx.fill(); outline(3);
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-20, -10 - flap); ctx.lineTo(-2, -5); ctx.closePath(); ctx.fill(); outline(2.5);
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-20, 10 + flap); ctx.lineTo(-2, 5); ctx.closePath(); ctx.fill(); outline(2.5);
    ctx.fillStyle = "#ffb454"; ctx.beginPath(); ctx.moveTo(hz.w / 2, -2); ctx.lineTo(hz.w / 2 + 9, 2); ctx.lineTo(hz.w / 2, 5); ctx.closePath(); ctx.fill(); outline(2);
    ctx.restore();
  }
  function drawBoulder(hz) {
    ctx.save(); ctx.translate(hz.x, hz.y - hz.h / 2); ctx.rotate(hz.rot);
    ctx.fillStyle = "#9a8f86"; ctx.beginPath(); ctx.arc(0, 0, hz.w / 2, 0, 6.283); ctx.fill(); outline(3);
    ctx.fillStyle = "#7d7269"; ctx.beginPath(); ctx.arc(-6, -4, 5, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(8, 6, 4, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function drawProjectile(hz) {
    if (hz.kind === "arrow") {
      ctx.strokeStyle = "#a06a2a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hz.x, hz.y); ctx.lineTo(hz.x + 14, hz.y); ctx.stroke();
      ctx.fillStyle = "#5b4f6e"; ctx.beginPath(); ctx.moveTo(hz.x, hz.y); ctx.lineTo(hz.x + 6, hz.y - 4); ctx.lineTo(hz.x + 6, hz.y + 4); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = "#3a3340"; ctx.beginPath(); ctx.arc(hz.x, hz.y, 8, 0, 6.283); ctx.fill(); outline(2.5);
      ctx.fillStyle = "#ffb454"; ctx.fillRect(hz.x - 1, hz.y - 12, 2, 4);
    }
  }

  // ---- The evolving dino (cel-shaded, outlined) ----
  function drawDino() {
    const st = STAGES[player.stageIndex];
    const duck = player.ducking && player.onGround;
    const h = duck ? st.h * 0.6 : st.h, w = st.w;
    const bx = player.x - w / 2, by = player.y - h;

    ctx.save();
    if (st.glow) { ctx.shadowColor = st.accent; ctx.shadowBlur = 16; }

    // Wings (behind).
    if (st.wings) {
      const wf = Math.sin(performance.now() / 120) * (player.onGround ? 4 : 11);
      ctx.fillStyle = st.accent;
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.32, by + h * 0.30);
      ctx.lineTo(bx - 16, by - 8 - wf);
      ctx.lineTo(bx + w * 0.5, by + h * 0.52);
      ctx.closePath(); ctx.fill(); outline(2.5);
    }

    // Tail.
    ctx.fillStyle = st.body;
    ctx.beginPath();
    ctx.moveTo(bx + 4, by + h * 0.55);
    ctx.lineTo(bx - w * 0.34, by + h * 0.72);
    ctx.lineTo(bx + 6, by + h * 0.9);
    ctx.closePath(); ctx.fill(); outline(3);

    // Body.
    ctx.fillStyle = st.body;
    roundRectPath(bx, by + h * 0.18, w * 0.8, h * 0.82, 9); ctx.fill(); outline(3);
    // Belly highlight.
    ctx.fillStyle = st.belly;
    roundRectPath(bx + w * 0.1, by + h * 0.5, w * 0.4, h * 0.46, 7); ctx.fill();

    // Legs.
    ctx.fillStyle = st.accent;
    const lp = Math.sin(player.legPhase) * (player.onGround ? 5 : 0);
    const legY = by + h;
    if (!duck) {
      roundRectPath(bx + w * 0.16, legY - 13, 7, 13 + lp, 3); ctx.fill(); outline(2.5);
      roundRectPath(bx + w * 0.42, legY - 13, 7, 13 - lp, 3); ctx.fill(); outline(2.5);
    } else {
      roundRectPath(bx + w * 0.2, legY - 6, 8, 6, 2); ctx.fill();
      roundRectPath(bx + w * 0.5, legY - 6, 8, 6, 2); ctx.fill();
    }

    // Head — grows with stage.
    const headW = w * (0.42 + player.stageIndex * 0.05);
    const headH = h * (0.34 + player.stageIndex * 0.03);
    const headX = bx + w * 0.52, headY = by + (duck ? h * 0.16 : 0);
    ctx.fillStyle = st.body;
    roundRectPath(headX, headY, headW, headH, 8); ctx.fill(); outline(3);
    // Snout for big stages.
    if (player.stageIndex >= 3) { ctx.fillStyle = st.body; roundRectPath(headX + headW - 5, headY + headH * 0.42, 9, headH * 0.38, 3); ctx.fill(); outline(2.5); }
    // Eye.
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(headX + headW * 0.66, headY + headH * 0.36, 5, 0, 6.283); ctx.fill(); outline(2);
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(headX + headW * 0.7, headY + headH * 0.36, 2.4, 0, 6.283); ctx.fill();

    ctx.restore();
  }

  function roundRectPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawParticles() {
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  // ============================================================
  //  MAIN LOOP
  // ============================================================
  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (state === "playing") update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ============================================================
  //  UI WIRING
  // ============================================================
  el.startBtn.addEventListener("click", startGame);
  el.restartBtn.addEventListener("click", startGame);
  el.summonBtn.addEventListener("click", () => summon(el.summonText.value));
  el.summonText.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); summon(el.summonText.value); } });

  // Dropdowns.
  function bindDropdown(btnId, menuId) {
    const btn = document.getElementById(btnId), menu = document.getElementById(menuId);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".dropdown-menu.open").forEach((m) => { if (m !== menu) m.classList.remove("open"); });
      menu.classList.toggle("open");
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
  }
  bindDropdown("quickToggle", "quickMenu");
  bindDropdown("aiToggle", "aiMenu");
  document.addEventListener("click", () => document.querySelectorAll(".dropdown-menu.open").forEach((m) => m.classList.remove("open")));
  document.querySelectorAll("#quickMenu button").forEach((b) => b.addEventListener("click", () => { summon(b.dataset.summon); document.getElementById("quickMenu").classList.remove("open"); }));

  // Auto toggle feedback.
  el.autoToggle.addEventListener("change", () => { if (state === "playing") setLog(el.autoToggle.checked ? "AUTO mode ON — hazards will rain automatically!" : "AUTO mode off."); autoTimer = 1.2; });

  // Fullscreen.
  el.fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  el.hiscore.textContent = hiscore;
  resize();
  requestAnimationFrame(loop);
})();
