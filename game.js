/* ============================================================
   DINO EVOLUTION — AI Summon Runner
   A Chrome-offline-style runner where the dino evolves with
   distance and the player (or Claude) can summon any hazard.
   ============================================================ */

(() => {
  "use strict";

  // ---- Canvas & DOM ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 56;

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
  };

  // ---- Evolution stages ----
  // Each stage gates appearance, hitbox size and abilities by distance.
  const STAGES = [
    { name: "Egg",          at: 0,    w: 30, h: 34, color: "#f0e6d2", doubleJump: false, glide: false, accent: "#d9b38c" },
    { name: "Hatchling",    at: 150,  w: 34, h: 40, color: "#9bd86f", doubleJump: false, glide: false, accent: "#6fae45" },
    { name: "Raptor",       at: 400,  w: 42, h: 48, color: "#74c365", doubleJump: true,  glide: false, accent: "#4f9a45" },
    { name: "T-Rex",        at: 800,  w: 54, h: 60, color: "#5fb35a", doubleJump: true,  glide: false, accent: "#3d8a3a" },
    { name: "Winged Drake", at: 1400, w: 56, h: 58, color: "#5aa9d6", doubleJump: true,  glide: true,  accent: "#2f80b3", wings: true },
    { name: "Cyber-Dragon", at: 2200, w: 60, h: 64, color: "#c084fc", doubleJump: true,  glide: true,  accent: "#7c3aed", wings: true, glow: true },
  ];

  // ---- Game state ----
  let state = "menu"; // menu | playing | over
  let lastTime = 0;
  let distance = 0;        // meters (score)
  let speed = 360;         // world scroll px/s
  let hiscore = Number(localStorage.getItem("dino_hi") || 0);
  el.hiscore.textContent = hiscore;

  const player = {
    x: 110, y: GROUND_Y, vy: 0,
    w: 30, h: 34,
    onGround: true,
    jumps: 0,
    ducking: false,
    stageIndex: 0,
    legPhase: 0,
  };

  const GRAVITY = 2400;
  const JUMP_V = -760;

  let obstacles = [];  // ground hazards that auto-spawn
  let hazards = [];    // summoned + spawned threats
  let particles = [];
  let bgStars = [];
  let clouds = [];
  let nextObstacleIn = 1.2;
  let screenShake = 0;
  let flash = 0;

  // ---- Input ----
  const keys = {};
  function isJumpKey(k) { return k === " " || k === "ArrowUp" || k === "Spacebar" || k === "Up"; }

  window.addEventListener("keydown", (e) => {
    // Don't hijack typing in the summon box.
    if (document.activeElement === el.summonText || document.activeElement === el.apiKey) return;
    if (isJumpKey(e.key)) { e.preventDefault(); doJump(); }
    if (e.key === "ArrowDown" || e.key === "Down") { e.preventDefault(); player.ducking = true; }
    if (state !== "playing" && isJumpKey(e.key)) {
      if (state === "menu") startGame();
      else if (state === "over") startGame();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowDown" || e.key === "Down") player.ducking = false;
    if (isJumpKey(e.key)) keys.jumpHeld = false;
  });

  // Touch / click to jump on the canvas.
  canvas.addEventListener("pointerdown", () => {
    if (state === "playing") doJump();
    else startGame();
  });

  function doJump() {
    if (state !== "playing") return;
    const st = STAGES[player.stageIndex];
    const maxJumps = st.doubleJump ? 2 : 1;
    if (player.jumps < maxJumps) {
      player.vy = JUMP_V * (player.jumps === 0 ? 1 : 0.85);
      player.jumps++;
      player.onGround = false;
      keys.jumpHeld = true;
      spawnDust(player.x, GROUND_Y);
    }
  }

  // ---- Background setup ----
  function initBackground() {
    bgStars = [];
    for (let i = 0; i < 60; i++) {
      bgStars.push({ x: Math.random() * W, y: Math.random() * (GROUND_Y - 40), r: Math.random() * 1.6 + 0.4, tw: Math.random() * Math.PI * 2 });
    }
    clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({ x: Math.random() * W, y: 30 + Math.random() * 90, s: 0.3 + Math.random() * 0.5, scale: 0.7 + Math.random() * 0.8 });
    }
  }

  // ============================================================
  //  SUMMON ENGINE — turns free text into a hazard spec.
  // ============================================================
  const HAZARD_LIBRARY = {
    meteor:    { label: "Meteor shower",   emoji: "☄️" },
    spaceship: { label: "Alien spaceship", emoji: "🛸" },
    hunter:    { label: "Hunter",          emoji: "🏹" },
    lightning: { label: "Lightning storm", emoji: "⚡" },
    bird:      { label: "Bird swarm",      emoji: "🦅" },
    boulder:   { label: "Rolling boulder", emoji: "🪨" },
  };

  // Keyword → hazard type. The offline "AI": maps anything sensible.
  function interpretOffline(text) {
    const t = text.toLowerCase();
    const has = (...words) => words.some((w) => t.includes(w));

    if (has("meteor", "comet", "asteroid", "fireball", "rock from sky", "shooting star")) return { type: "meteor" };
    if (has("spaceship", "ufo", "alien", "saucer", "mothership", "ship")) return { type: "spaceship" };
    if (has("hunter", "human", "soldier", "archer", "poacher", "ranger", "man")) return { type: "hunter" };
    if (has("lightning", "thunder", "storm", "bolt", "zeus", "electric")) return { type: "lightning" };
    if (has("bird", "pterodactyl", "ptero", "eagle", "dragon", "flock", "swarm", "bat", "fly")) return { type: "bird" };
    if (has("boulder", "rock", "stone", "rolling", "ball", "wheel")) return { type: "boulder" };
    if (has("rain", "fire", "hail", "missile", "bomb", "drop")) return { type: "meteor" };

    // Unknown → pick a thematically random hazard so "anything" always works.
    const keys = Object.keys(HAZARD_LIBRARY);
    return { type: keys[Math.floor(Math.random() * keys.length)], improvised: true };
  }

  async function interpretWithClaude(text, apiKey) {
    const types = Object.keys(HAZARD_LIBRARY).join(", ");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 64,
        system:
          "You are the hazard director for a dinosaur runner game. The player names " +
          "something to throw at the dino. Map it to the single closest hazard type from " +
          "this list: " + types + ". Reply with ONLY a compact JSON object like " +
          '{"type":"meteor","count":4,"intensity":1.4}. count 1-6, intensity 0.6-2.0.',
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) throw new Error("API " + res.status);
    const data = await res.json();
    const raw = (data.content && data.content[0] && data.content[0].text) || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    const spec = JSON.parse(match[0]);
    if (!HAZARD_LIBRARY[spec.type]) throw new Error("bad type");
    return spec;
  }

  async function summon(text) {
    text = (text || "").trim();
    if (!text) return;
    if (state !== "playing") {
      setLog("Start a run first, then summon!", "err");
      return;
    }

    const apiKey = el.apiKey.value.trim();
    let spec;
    if (apiKey) {
      setLog("✦ Claude is conjuring \"" + text + "\"...", "active");
      try {
        spec = await interpretWithClaude(text, apiKey);
      } catch (err) {
        setLog("Claude unavailable (" + err.message + ") — using offline engine.", "err");
        spec = interpretOffline(text);
      }
    } else {
      spec = interpretOffline(text);
    }

    const info = HAZARD_LIBRARY[spec.type];
    const intensity = clamp(spec.intensity || 1, 0.6, 2.2);
    const count = clamp(spec.count || defaultCount(spec.type), 1, 6);
    spawnHazard(spec.type, count, intensity);

    const verb = spec.improvised ? "improvised" : "summoned";
    setLog(info.emoji + " AI " + verb + " " + info.label + " ×" + count + "!", "active");
    el.summonText.value = "";
  }

  function defaultCount(type) {
    return ({ meteor: 4, bird: 3, lightning: 2, hunter: 1, spaceship: 1, boulder: 1 })[type] || 1;
  }

  function setLog(msg, cls) {
    el.aiLog.textContent = msg;
    el.aiLog.className = "ai-log" + (cls ? " " + cls : "");
  }

  // ============================================================
  //  HAZARD SPAWNING
  // ============================================================
  function spawnHazard(type, count, intensity) {
    for (let i = 0; i < count; i++) {
      const delay = i * (0.35 / intensity);
      setTimeout(() => {
        if (state !== "playing") return;
        createHazard(type, intensity);
      }, delay * 1000);
    }
    if (type === "lightning" || type === "meteor") flash = Math.max(flash, 0.25);
  }

  function createHazard(type, intensity) {
    switch (type) {
      case "meteor": {
        const x = W * (0.4 + Math.random() * 0.7);
        hazards.push({ type, x, y: -30, w: 26, h: 26,
          vx: -(180 + Math.random() * 60), vy: 260 + Math.random() * 120 * intensity, rot: 0 });
        break;
      }
      case "spaceship": {
        hazards.push({ type, x: W + 40, y: 50 + Math.random() * 60, w: 70, h: 30,
          vx: -(160 + 60 * intensity), bombTimer: 0.6, bobseed: Math.random() * 6 });
        break;
      }
      case "hunter": {
        hazards.push({ type, x: W + 30, y: GROUND_Y, w: 30, h: 46,
          vx: -(120 + 40 * intensity), shootTimer: 0.8, walk: 0 });
        break;
      }
      case "lightning": {
        // Telegraph then strike near the dino's current/forward position.
        const targetX = player.x + 40 + Math.random() * 160;
        hazards.push({ type, x: targetX, y: 0, w: 26, h: GROUND_Y, warn: 0.7, alive: 0 });
        break;
      }
      case "bird": {
        const lanes = [GROUND_Y - 8, GROUND_Y - 60, GROUND_Y - 110];
        const y = lanes[Math.floor(Math.random() * lanes.length)];
        hazards.push({ type, x: W + 30, y, w: 38, h: 24, vx: -(speed * 0.9 + 80 * intensity), flap: 0 });
        break;
      }
      case "boulder": {
        hazards.push({ type, x: W + 40, y: GROUND_Y, w: 52, h: 52,
          vx: -(speed + 120 * intensity), rot: 0 });
        break;
      }
    }
  }

  // Projectiles fired by hunters/spaceships.
  function fireProjectile(x, y, vx, vy, kind) {
    hazards.push({ type: "projectile", kind, x, y, w: 14, h: 6, vx, vy });
  }

  // ============================================================
  //  PARTICLES
  // ============================================================
  function spawnDust(x, y) {
    for (let i = 0; i < 6; i++) {
      particles.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60,
        life: 0.4, max: 0.4, c: "#7a6f5d", r: 2 + Math.random() * 2 });
    }
  }
  function spawnExplosion(x, y, color) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.6, max: 0.6, c: color || "#ff8a3d", r: 2 + Math.random() * 3 });
    }
    screenShake = Math.max(screenShake, 10);
  }

  // ============================================================
  //  GAME FLOW
  // ============================================================
  function startGame() {
    state = "playing";
    distance = 0;
    speed = 360;
    obstacles = [];
    hazards = [];
    particles = [];
    nextObstacleIn = 1.2;
    screenShake = 0;
    flash = 0;
    Object.assign(player, { x: 110, y: GROUND_Y, vy: 0, onGround: true, jumps: 0, ducking: false, stageIndex: 0, legPhase: 0 });
    el.overlay.classList.add("hidden");
    el.gameover.classList.add("hidden");
    initBackground();
    setLog("Run started — summon something!", "active");
    lastTime = performance.now();
  }

  function gameOver() {
    state = "over";
    const finalDist = Math.floor(distance);
    el.finalScore.textContent = finalDist;
    el.finalStage.textContent = STAGES[player.stageIndex].name;
    if (finalDist > hiscore) {
      hiscore = finalDist;
      localStorage.setItem("dino_hi", String(hiscore));
      el.hiscore.textContent = hiscore;
      el.newHi.classList.remove("hidden");
    } else {
      el.newHi.classList.add("hidden");
    }
    spawnExplosion(player.x, player.y - player.h / 2, "#ff5555");
    el.gameover.classList.remove("hidden");
  }

  // ============================================================
  //  UPDATE
  // ============================================================
  function update(dt) {
    distance += (speed * dt) / 30; // tuned so meters feel right
    speed = 360 + Math.min(distance * 0.16, 360); // ramps up, caps

    // Evolution check.
    let si = 0;
    for (let i = 0; i < STAGES.length; i++) if (distance >= STAGES[i].at) si = i;
    if (si !== player.stageIndex) {
      player.stageIndex = si;
      onEvolve(STAGES[si]);
    }
    const st = STAGES[player.stageIndex];
    player.w = st.w;
    player.h = st.h;

    // Player physics.
    const gliding = st.glide && keys.jumpHeld && player.vy > 0;
    player.vy += GRAVITY * dt * (gliding ? 0.35 : 1);
    player.y += player.vy * dt;
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
      player.onGround = true;
      player.jumps = 0;
    }
    if (player.onGround) player.legPhase += dt * (speed / 40);

    // Auto ground obstacles.
    nextObstacleIn -= dt;
    if (nextObstacleIn <= 0) {
      spawnGroundObstacle();
      const base = clamp(1.5 - distance * 0.0003, 0.7, 1.5);
      nextObstacleIn = base + Math.random() * 0.9;
    }

    updateObstacles(dt);
    updateHazards(dt);
    updateParticles(dt);

    // Decay effects.
    if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 30);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.5);

    // Parallax bg.
    for (const c of clouds) {
      c.x -= c.s * speed * dt * 0.15;
      if (c.x < -60) { c.x = W + 60; c.y = 30 + Math.random() * 90; }
    }

    // HUD.
    el.score.textContent = Math.floor(distance);
    el.stage.textContent = st.name;
  }

  function onEvolve(st) {
    spawnExplosion(player.x, player.y - player.h / 2, st.accent);
    flash = Math.max(flash, 0.3);
    setLog("🧬 Evolved into " + st.name + "!" + (st.doubleJump ? " (double-jump!)" : "") + (st.glide ? " (hold to glide!)" : ""), "active");
  }

  function spawnGroundObstacle() {
    const tall = Math.random() < 0.4;
    const cluster = Math.random() < 0.3 ? 2 : 1;
    const w = tall ? 22 : 18 * cluster;
    const h = tall ? 52 : 34;
    obstacles.push({ x: W + 20, y: GROUND_Y, w, h, kind: tall ? "tall" : "cactus" });
  }

  function updateObstacles(dt) {
    for (const o of obstacles) o.x -= speed * dt;
    obstacles = obstacles.filter((o) => o.x + o.w > -10);
    for (const o of obstacles) {
      if (hits(playerBox(), { x: o.x, y: o.y - o.h, w: o.w, h: o.h })) gameOver();
    }
  }

  function updateHazards(dt) {
    for (const hz of hazards) {
      switch (hz.type) {
        case "meteor":
          hz.x += hz.vx * dt; hz.y += hz.vy * dt; hz.rot += dt * 8;
          if (hz.y >= GROUND_Y) { spawnExplosion(hz.x, GROUND_Y, "#ff8a3d"); hz.dead = true; }
          break;
        case "spaceship":
          hz.x += hz.vx * dt;
          hz.y += Math.sin((performance.now() / 400) + hz.bobseed) * 12 * dt;
          hz.bombTimer -= dt;
          if (hz.bombTimer <= 0 && hz.x < W - 40 && hz.x > 60) {
            hz.bombTimer = 0.9;
            fireProjectile(hz.x, hz.y + 14, -40, 260, "bomb");
          }
          if (hz.x < -80) hz.dead = true;
          break;
        case "hunter":
          hz.x += hz.vx * dt; hz.walk += dt * 8;
          hz.shootTimer -= dt;
          if (hz.shootTimer <= 0 && hz.x > player.x) {
            hz.shootTimer = 1.1;
            fireProjectile(hz.x - 14, hz.y - 30, -460, -30, "arrow");
          }
          if (hz.x < -40) hz.dead = true;
          break;
        case "lightning":
          if (hz.warn > 0) { hz.warn -= dt; }
          else { hz.alive += dt; if (hz.alive > 0.22) hz.dead = true; }
          break;
        case "bird":
          hz.x += hz.vx * dt; hz.flap += dt * 12;
          if (hz.x < -50) hz.dead = true;
          break;
        case "boulder":
          hz.x += hz.vx * dt; hz.rot -= (hz.vx * dt) / (hz.w / 2);
          if (hz.x < -60) hz.dead = true;
          break;
        case "projectile":
          hz.x += hz.vx * dt; hz.y += (hz.vy || 0) * dt;
          if (hz.kind === "bomb" && hz.y >= GROUND_Y) { spawnExplosion(hz.x, GROUND_Y, "#9be7ff"); hz.dead = true; }
          if (hz.x < -30 || hz.x > W + 60 || hz.y > H + 20) hz.dead = true;
          break;
      }

      // Collision with player.
      if (!hz.dead && hazardHitsPlayer(hz)) {
        if (hz.type === "lightning" && hz.warn > 0) { /* warning phase: harmless */ }
        else { gameOver(); }
      }
    }
    hazards = hazards.filter((h) => !h.dead);
  }

  function hazardHitsPlayer(hz) {
    const pb = playerBox();
    if (hz.type === "lightning") {
      if (hz.warn > 0) return false;
      return hits(pb, { x: hz.x - 8, y: 0, w: 16, h: GROUND_Y });
    }
    return hits(pb, { x: hz.x - hz.w / 2, y: hz.y - hz.h, w: hz.w, h: hz.h });
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  // ---- Collision helpers ----
  function playerBox() {
    const duckH = player.ducking && player.onGround ? player.h * 0.6 : player.h;
    const pad = 4; // forgiveness
    return { x: player.x - player.w / 2 + pad, y: player.y - duckH + pad, w: player.w - pad * 2, h: duckH - pad * 2 };
  }
  function hits(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ============================================================
  //  RENDER
  // ============================================================
  function render() {
    ctx.save();
    if (screenShake > 0) {
      ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    }
    ctx.clearRect(-20, -20, W + 40, H + 40);

    drawSky();
    drawGround();
    drawObstacles();
    drawHazards();
    drawDino();
    drawParticles();

    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + flash * 0.5 + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawSky() {
    // Stars twinkle.
    for (const s of bgStars) {
      s.tw += 0.04;
      const a = 0.3 + Math.abs(Math.sin(s.tw)) * 0.6;
      ctx.fillStyle = "rgba(200,220,255," + a + ")";
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    // Clouds.
    for (const c of clouds) {
      ctx.fillStyle = "rgba(120,140,170,0.18)";
      const s = c.scale;
      roundedBlob(c.x, c.y, 34 * s, 16 * s);
    }
  }

  function roundedBlob(x, y, w, h) {
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.6, y + 4, w * 0.7, h * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(x - w * 0.6, y + 4, w * 0.7, h * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround() {
    ctx.fillStyle = "#1b2a17";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = "#3c5a2e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    // Moving texture dashes.
    ctx.strokeStyle = "#2c4220";
    const off = (distance * 8) % 40;
    for (let x = -off; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 16);
      ctx.lineTo(x + 16, GROUND_Y + 16);
      ctx.stroke();
    }
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.fillStyle = "#2f7d32";
      ctx.fillRect(o.x, o.y - o.h, o.w, o.h);
      ctx.fillStyle = "#256528";
      // arms
      ctx.fillRect(o.x - 5, o.y - o.h * 0.6, 5, o.h * 0.25);
      ctx.fillRect(o.x + o.w, o.y - o.h * 0.7, 5, o.h * 0.25);
    }
  }

  function drawHazards() {
    for (const hz of hazards) {
      switch (hz.type) {
        case "meteor": drawMeteor(hz); break;
        case "spaceship": drawSpaceship(hz); break;
        case "hunter": drawHunter(hz); break;
        case "lightning": drawLightning(hz); break;
        case "bird": drawBird(hz); break;
        case "boulder": drawBoulder(hz); break;
        case "projectile": drawProjectile(hz); break;
      }
    }
  }

  function drawMeteor(hz) {
    // trail
    ctx.strokeStyle = "rgba(255,150,60,0.5)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(hz.x, hz.y);
    ctx.lineTo(hz.x - hz.vx * 0.06, hz.y - hz.vy * 0.06);
    ctx.stroke();
    ctx.fillStyle = "#5a3a2a";
    ctx.beginPath();
    ctx.arc(hz.x, hz.y, hz.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff8a3d";
    ctx.beginPath();
    ctx.arc(hz.x - 3, hz.y - 3, hz.w / 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSpaceship(hz) {
    ctx.save();
    ctx.translate(hz.x, hz.y);
    ctx.fillStyle = "#9aa6b2";
    ctx.beginPath();
    ctx.ellipse(0, 0, hz.w / 2, hz.h / 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#79c0ff";
    ctx.beginPath();
    ctx.ellipse(0, -8, hz.w / 4, hz.h / 3, 0, Math.PI, 0);
    ctx.fill();
    // glow lights
    ctx.fillStyle = "#7ee787";
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * 12 - 2, 6, 4, 4);
    ctx.restore();
  }

  function drawHunter(hz) {
    ctx.save();
    ctx.translate(hz.x, hz.y);
    const swing = Math.sin(hz.walk) * 4;
    ctx.fillStyle = "#c9a26b"; // skin/cloak
    ctx.fillRect(-8, -42, 16, 26); // body
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(-8, -16, 6, 16 + swing); // leg
    ctx.fillRect(2, -16, 6, 16 - swing); // leg
    ctx.fillStyle = "#e8c9a0";
    ctx.beginPath(); ctx.arc(0, -48, 7, 0, Math.PI * 2); ctx.fill(); // head
    // bow
    ctx.strokeStyle = "#5a3a1a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-12, -30, 10, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.restore();
  }

  function drawLightning(hz) {
    if (hz.warn > 0) {
      // telegraph
      ctx.strokeStyle = "rgba(255,255,120," + (0.3 + Math.abs(Math.sin(performance.now() / 60)) * 0.5) + ")";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hz.x, 0); ctx.lineTo(hz.x, GROUND_Y); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "#fff7a0";
      ctx.lineWidth = 5;
      ctx.shadowColor = "#fff7a0"; ctx.shadowBlur = 16;
      ctx.beginPath();
      let y = 0, x = hz.x;
      ctx.moveTo(x, y);
      while (y < GROUND_Y) { y += 28; x = hz.x + (Math.random() - 0.5) * 26; ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawBird(hz) {
    ctx.save();
    ctx.translate(hz.x, hz.y - hz.h / 2);
    ctx.fillStyle = "#cdb4ff";
    ctx.fillRect(-hz.w / 2, -4, hz.w, 8); // body
    const flap = Math.sin(hz.flap) * 10;
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(-18, -10 - flap); ctx.lineTo(-2, -4); ctx.fill(); // wing
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(-18, 10 + flap); ctx.lineTo(-2, 4); ctx.fill();
    ctx.fillStyle = "#ffb454";
    ctx.beginPath(); ctx.moveTo(hz.w / 2, 0); ctx.lineTo(hz.w / 2 + 8, 2); ctx.lineTo(hz.w / 2, 4); ctx.fill(); // beak
    ctx.restore();
  }

  function drawBoulder(hz) {
    ctx.save();
    ctx.translate(hz.x, hz.y - hz.h / 2);
    ctx.rotate(hz.rot);
    ctx.fillStyle = "#6b6b6b";
    ctx.beginPath(); ctx.arc(0, 0, hz.w / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#555";
    ctx.beginPath(); ctx.arc(-6, -4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, 6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawProjectile(hz) {
    if (hz.kind === "arrow") {
      ctx.strokeStyle = "#e0c060"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hz.x, hz.y); ctx.lineTo(hz.x + 14, hz.y); ctx.stroke();
      ctx.fillStyle = "#cfcfcf";
      ctx.beginPath(); ctx.moveTo(hz.x, hz.y); ctx.lineTo(hz.x + 6, hz.y - 4); ctx.lineTo(hz.x + 6, hz.y + 4); ctx.fill();
    } else { // bomb
      ctx.fillStyle = "#2b2b2b";
      ctx.beginPath(); ctx.arc(hz.x, hz.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffb454";
      ctx.fillRect(hz.x - 1, hz.y - 11, 2, 4);
    }
  }

  // ---- The evolving dino ----
  function drawDino() {
    const st = STAGES[player.stageIndex];
    const duck = player.ducking && player.onGround;
    const h = duck ? st.h * 0.6 : st.h;
    const w = st.w;
    const baseX = player.x - w / 2;
    const baseY = player.y - h;

    ctx.save();
    if (st.glow) { ctx.shadowColor = st.accent; ctx.shadowBlur = 18; }

    // Wings (behind body) for flying stages.
    if (st.wings) {
      const wf = Math.sin(performance.now() / 120) * (player.onGround ? 4 : 10);
      ctx.fillStyle = st.accent;
      ctx.beginPath();
      ctx.moveTo(baseX + w * 0.3, baseY + h * 0.3);
      ctx.lineTo(baseX - 14, baseY - 6 - wf);
      ctx.lineTo(baseX + w * 0.5, baseY + h * 0.5);
      ctx.fill();
    }

    // Body.
    ctx.fillStyle = st.color;
    roundRect(baseX, baseY + h * 0.2, w * 0.78, h * 0.8, 6);

    // Tail.
    ctx.beginPath();
    ctx.moveTo(baseX, baseY + h * 0.55);
    ctx.lineTo(baseX - w * 0.35, baseY + h * 0.7);
    ctx.lineTo(baseX, baseY + h * 0.85);
    ctx.fill();

    // Head — grows with stage.
    const headW = w * (0.4 + player.stageIndex * 0.05);
    const headH = h * (0.32 + player.stageIndex * 0.03);
    const headX = baseX + w * 0.55;
    const headY = baseY + (duck ? h * 0.15 : 0);
    roundRect(headX, headY, headW, headH, 5);

    // Snout for bigger stages.
    if (player.stageIndex >= 3) {
      ctx.fillRect(headX + headW - 4, headY + headH * 0.4, 8, headH * 0.4);
    }

    // Eye.
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(headX + headW * 0.6, headY + headH * 0.28, 4, 4);
    if (st.glow) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(headX + headW * 0.6, headY + headH * 0.28, 2, 2);
    }

    // Legs (animated when grounded).
    ctx.fillStyle = st.accent;
    const lp = Math.sin(player.legPhase) * (player.onGround ? 5 : 0);
    const legY = baseY + h;
    if (!duck) {
      ctx.fillRect(baseX + w * 0.18, legY - 12, 6, 12 + lp);
      ctx.fillRect(baseX + w * 0.42, legY - 12, 6, 12 - lp);
    } else {
      ctx.fillRect(baseX + w * 0.2, legY - 6, 7, 6);
      ctx.fillRect(baseX + w * 0.5, legY - 6, 7, 6);
    }

    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.r, p.r);
    }
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

  // ---- Wire up UI ----
  el.startBtn.addEventListener("click", startGame);
  el.restartBtn.addEventListener("click", startGame);
  el.summonBtn.addEventListener("click", () => summon(el.summonText.value));
  el.summonText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); summon(el.summonText.value); }
  });
  document.querySelectorAll(".quick-summons button").forEach((b) => {
    b.addEventListener("click", () => summon(b.dataset.summon));
  });

  initBackground();
  render();
  requestAnimationFrame(loop);
})();
