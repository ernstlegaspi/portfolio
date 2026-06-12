const sidebar = document.querySelector(".sidebar");
const toggle = document.querySelector(".sidebar-toggle");
const viewLinks = document.querySelectorAll("[data-view-target]");
const views = document.querySelectorAll("[data-view]");
const pixelRain = document.querySelector(".pixel-rain");
const rainColors = ["#70ff87", "#ff5b68", "#ffd65a", "#72d7ff", "#f5f5f0"];
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sparkColors = ["#70ff87", "#ff5b68", "#ffd65a", "#72d7ff"];
let lastSparkTime = 0;

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
});

viewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = link.dataset.viewTarget;
    const view = document.querySelector(`[data-view="${target}"]`);

    if (!view) {
      return;
    }

    event.preventDefault();
    views.forEach((item) => {
      item.hidden = item !== view;
    });
    viewLinks.forEach((item) => {
      if (item === link) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  });
});

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
