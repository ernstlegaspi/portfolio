const sidebar = document.querySelector(".sidebar");
const toggle = document.querySelector(".sidebar-toggle");
const viewLinks = document.querySelectorAll("[data-view-target]");
const views = document.querySelectorAll("[data-view]");
const pixelRain = document.querySelector(".pixel-rain");
const gameStage = document.querySelector("[data-game]");
const gameTarget = document.querySelector("[data-game-target]");
const gameGuide = document.querySelector("[data-game-guide]");
const rainColors = ["#70ff87", "#ff5b68", "#ffd65a", "#72d7ff", "#f5f5f0"];
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sparkColors = ["#70ff87", "#ff5b68", "#ffd65a", "#72d7ff"];
const maxGameLevel = 10;
const baseGameSpeed = 96;
const activeGameGuide = "Destroy the green box before it keeps disturbing the screen.";
const clearedGameGuide = "Disturbance cleared.";
let lastSparkTime = 0;
let gameFrame = null;
let gameSpawnTimer = null;
const gameState = {
  initialized: false,
  running: false,
  visible: true,
  waitingToSpawn: false,
  completed: false,
  level: 1,
  x: 0,
  y: 0,
  vx: baseGameSpeed,
  vy: baseGameSpeed,
  size: 74,
  lastTime: 0,
};

function clearActiveView() {
  views.forEach((item) => {
    item.hidden = true;
  });
  viewLinks.forEach((item) => {
    item.removeAttribute("aria-current");
  });
}

function setGameGuide(text, isCleared = false) {
  if (gameGuide) {
    gameGuide.textContent = text;
  }

  if (gameStage) {
    gameStage.dataset.cleared = isCleared ? "true" : "false";
  }
}

function getGameTargetSize() {
  if (!gameTarget) {
    return 0;
  }

  return gameTarget.offsetWidth || (window.matchMedia("(max-width: 640px)").matches ? 58 : 74);
}

function getGameBounds() {
  const size = getGameTargetSize();

  if (!gameStage) {
    return { width: size, height: size, size };
  }

  return {
    width: Math.max(size, gameStage.clientWidth),
    height: Math.max(size, gameStage.clientHeight),
    size,
  };
}

function placeGameTarget() {
  if (!gameTarget) {
    return;
  }

  gameTarget.style.transform = `translate3d(${gameState.x}px, ${gameState.y}px, 0)`;
}

function setGameVelocity() {
  const speed = baseGameSpeed * gameState.level;
  const angle = Math.random() * Math.PI * 2;

  gameState.vx = Math.cos(angle) * speed;
  gameState.vy = Math.sin(angle) * speed;
}

function keepGameTargetInBounds() {
  const bounds = getGameBounds();
  const maxX = Math.max(0, bounds.width - bounds.size);
  const maxY = Math.max(0, bounds.height - bounds.size);

  gameState.size = bounds.size;
  gameState.x = Math.min(Math.max(0, gameState.x), maxX);
  gameState.y = Math.min(Math.max(0, gameState.y), maxY);
  placeGameTarget();
}

function clearGameFragments() {
  if (!gameStage) {
    return;
  }

  gameStage.querySelectorAll(".game-fragment").forEach((fragment) => {
    fragment.remove();
  });
}

function spawnGameTarget() {
  if (!gameStage || !gameTarget || gameState.completed) {
    return;
  }

  clearGameFragments();
  setGameGuide(activeGameGuide, false);

  const bounds = getGameBounds();
  const maxX = Math.max(0, bounds.width - bounds.size);
  const maxY = Math.max(0, bounds.height - bounds.size);

  gameState.size = bounds.size;
  gameState.x = Math.random() * maxX;
  gameState.y = Math.random() * maxY;
  gameState.waitingToSpawn = false;
  gameState.initialized = true;
  setGameVelocity();
  placeGameTarget();

  gameTarget.hidden = false;
  gameTarget.disabled = false;
  gameTarget.setAttribute("aria-label", `Explode target at ${gameState.level}x speed`);
}

function stopGameLoop() {
  gameState.running = false;
  gameState.lastTime = 0;

  if (gameFrame !== null) {
    window.cancelAnimationFrame(gameFrame);
    gameFrame = null;
  }
}

function updateGame(now) {
  if (!gameState.running) {
    gameFrame = null;
    return;
  }

  if (!gameState.lastTime) {
    gameState.lastTime = now;
  }

  const elapsed = Math.min((now - gameState.lastTime) / 1000, 0.05);
  const bounds = getGameBounds();
  const maxX = Math.max(0, bounds.width - bounds.size);
  const maxY = Math.max(0, bounds.height - bounds.size);

  gameState.lastTime = now;
  gameState.size = bounds.size;
  gameState.x += gameState.vx * elapsed;
  gameState.y += gameState.vy * elapsed;

  if (gameState.x <= 0) {
    gameState.x = 0;
    gameState.vx = Math.abs(gameState.vx);
  } else if (gameState.x >= maxX) {
    gameState.x = maxX;
    gameState.vx = -Math.abs(gameState.vx);
  }

  if (gameState.y <= 0) {
    gameState.y = 0;
    gameState.vy = Math.abs(gameState.vy);
  } else if (gameState.y >= maxY) {
    gameState.y = maxY;
    gameState.vy = -Math.abs(gameState.vy);
  }

  placeGameTarget();
  gameFrame = window.requestAnimationFrame(updateGame);
}

function startGameLoop() {
  if (
    !gameStage ||
    !gameTarget ||
    !gameState.visible ||
    gameState.completed ||
    gameState.waitingToSpawn ||
    gameTarget.hidden ||
    gameFrame !== null
  ) {
    return;
  }

  keepGameTargetInBounds();
  gameState.running = true;
  gameState.lastTime = performance.now();
  gameFrame = window.requestAnimationFrame(updateGame);
}

function createGameExplosion(x, y) {
  if (!gameStage) {
    return;
  }

  const colors = ["#70ff87", "#ffd65a", "#ff5b68", "#72d7ff"];
  const count = prefersReducedMotion ? 12 : 34;
  const radius = prefersReducedMotion ? 42 : 122;

  for (let index = 0; index < count; index += 1) {
    const fragment = document.createElement("span");
    const size = index % 4 === 0 ? 14 : 10;
    const angle = (Math.PI * 2 * index) / count;
    const distance = radius * (0.42 + Math.random() * 0.58);

    fragment.className = "game-fragment";
    fragment.style.setProperty("--x", `${x - size / 2}px`);
    fragment.style.setProperty("--y", `${y - size / 2}px`);
    fragment.style.setProperty("--size", `${size}px`);
    fragment.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
    fragment.style.setProperty("--burst-y", `${Math.sin(angle) * distance}px`);
    fragment.style.setProperty("--fragment-color", colors[index % colors.length]);

    gameStage.appendChild(fragment);
    fragment.addEventListener("animationend", () => fragment.remove(), { once: true });

    if (prefersReducedMotion) {
      window.setTimeout(() => fragment.remove(), 90);
    }
  }
}

function scheduleNextGameTarget() {
  if (gameState.completed) {
    return;
  }

  window.clearTimeout(gameSpawnTimer);
  gameSpawnTimer = window.setTimeout(
    () => {
      gameSpawnTimer = null;

      if (!gameState.visible) {
        return;
      }

      spawnGameTarget();
      startGameLoop();
    },
    prefersReducedMotion ? 90 : 360,
  );
}

function pauseGame() {
  gameState.visible = false;
  clearGameFragments();

  if (gameStage) {
    gameStage.hidden = true;
  }

  window.clearTimeout(gameSpawnTimer);
  gameSpawnTimer = null;
  stopGameLoop();
}

function resumeGame() {
  if (!gameStage || !gameTarget) {
    return;
  }

  gameState.visible = true;
  gameStage.hidden = false;

  if (gameState.completed) {
    gameTarget.hidden = true;
    setGameGuide(clearedGameGuide, true);
    return;
  }

  if (!gameState.initialized || (gameState.waitingToSpawn && gameSpawnTimer === null)) {
    spawnGameTarget();
  }

  startGameLoop();
}

function showBlankStage() {
  clearActiveView();
  resumeGame();
}

if (pixelRain) {
  for (let index = 0; index < 72; index += 1) {
    const fragment = document.createElement("span");
    const size = Math.floor(Math.random() * 4) * 2 + 4;
    const color = rainColors[index % rainColors.length];

    fragment.className = "pixel-fragment";
    fragment.style.setProperty("--x", String(Math.random() * 100));
    fragment.style.setProperty("--start-y", String(Math.random() * 100));
    fragment.style.setProperty("--size", String(size));
    fragment.style.setProperty("--duration", `${8 + Math.random() * 12}s`);
    fragment.style.setProperty("--delay", String(Math.random() * 18));
    fragment.style.setProperty("--drift", `${Math.random() * 42 - 21}px`);
    fragment.style.setProperty("--opacity", String(0.16 + Math.random() * 0.38));
    fragment.style.setProperty("--fragment-color", color);
    pixelRain.appendChild(fragment);
  }
}

toggle.addEventListener("click", () => {
  const isExpanded = sidebar.dataset.expanded === "true";
  const nextState = String(!isExpanded);

  sidebar.dataset.expanded = nextState;
  toggle.setAttribute("aria-expanded", nextState);
  toggle.setAttribute("aria-label", isExpanded ? "Open sidebar" : "Close sidebar");
  showBlankStage();
});

viewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = link.dataset.viewTarget;
    const view = document.querySelector(`[data-view="${target}"]`);

    if (!view) {
      return;
    }

    event.preventDefault();
    clearActiveView();
    pauseGame();
    view.hidden = false;
    viewLinks.forEach((item) => {
      if (item === link) {
        item.setAttribute("aria-current", "page");
      }
    });
  });
});

if (gameTarget) {
  gameTarget.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  gameTarget.addEventListener("click", (event) => {
    if (!gameState.visible || gameTarget.hidden) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    stopGameLoop();
    createGameExplosion(gameState.x + gameState.size / 2, gameState.y + gameState.size / 2);
    gameTarget.hidden = true;

    if (gameState.level >= maxGameLevel) {
      gameState.completed = true;
      gameState.waitingToSpawn = false;
      window.clearTimeout(gameSpawnTimer);
      gameSpawnTimer = null;
      setGameGuide(clearedGameGuide, true);
      return;
    }

    gameState.level = Math.min(maxGameLevel, gameState.level + 1);
    gameState.waitingToSpawn = true;
    scheduleNextGameTarget();
  });
}

window.addEventListener(
  "resize",
  () => {
    if (!gameStage || gameStage.hidden || !gameState.initialized) {
      return;
    }

    keepGameTargetInBounds();
  },
  { passive: true },
);

function makeParticle(className, x, y, options = {}) {
  const particle = document.createElement("span");
  const size = options.size ?? 6;
  const color = options.color ?? sparkColors[Math.floor(Math.random() * sparkColors.length)];

  particle.className = className;
  particle.style.setProperty("--x", `${x - size / 2}px`);
  particle.style.setProperty("--y", `${y - size / 2}px`);
  particle.style.setProperty("--size", `${size}px`);
  particle.style.setProperty("--spark-color", color);

  if (options.driftX !== undefined) {
    particle.style.setProperty("--drift-x", `${options.driftX}px`);
  }

  if (options.driftY !== undefined) {
    particle.style.setProperty("--drift-y", `${options.driftY}px`);
  }

  if (options.burstX !== undefined) {
    particle.style.setProperty("--burst-x", `${options.burstX}px`);
  }

  if (options.burstY !== undefined) {
    particle.style.setProperty("--burst-y", `${options.burstY}px`);
  }

  document.body.appendChild(particle);
  particle.addEventListener("animationend", () => particle.remove(), { once: true });

  if (prefersReducedMotion) {
    window.setTimeout(() => particle.remove(), 80);
  }
}

window.addEventListener(
  "pointermove",
  (event) => {
    if (prefersReducedMotion || event.pointerType === "touch") {
      return;
    }

    const now = performance.now();
    if (now - lastSparkTime < 18) {
      return;
    }

    lastSparkTime = now;
    for (let index = 0; index < 3; index += 1) {
      const spreadX = Math.random() * 36 - 18;
      const spreadY = Math.random() * 36 - 18;

      makeParticle("cursor-spark", event.clientX + spreadX, event.clientY + spreadY, {
        size: Math.random() > 0.5 ? 10 : 6,
        driftX: Math.random() * 52 - 26,
        driftY: Math.random() * 52 - 26,
      });
    }
  },
  { passive: true },
);

resumeGame();

window.addEventListener(
  "pointerdown",
  (event) => {
    const count = prefersReducedMotion ? 8 : 28;
    const radius = prefersReducedMotion ? 36 : 104;

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count;
      const distance = radius * (0.45 + Math.random() * 0.55);

      makeParticle("cursor-burst", event.clientX, event.clientY, {
        size: index % 3 === 0 ? 12 : 9,
        color: sparkColors[index % sparkColors.length],
        burstX: Math.cos(angle) * distance,
        burstY: Math.sin(angle) * distance,
      });
    }
  },
  { passive: true },
);
