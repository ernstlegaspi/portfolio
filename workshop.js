import { loadPortfolioContent } from "./workshop-content.js";

const stations = {
  profile: { title: "About me", kicker: "THE PROFILE TERMINAL", subtitle: "Ernst Danielle B. Legaspi · Senior Full Stack Developer" },
  rew: { title: "Rew", kicker: "THE STUDY DESK", subtitle: "A little more focus. A better way to study." },
  taskseal: { title: "TaskSeal", kicker: "THE FIELD WORKSTATION", subtitle: "Clear work. A record you can trust." },
  projects: { title: "Projects", kicker: "THE BUILD COLLECTION", subtitle: "Experiments, prototypes, and things brought to life." },
  skills: { title: "Skills", kicker: "THE TOOLS OF THE TRADE", subtitle: "The tools I use to take an idea from sketch to ship." },
};

export async function initWorkshop({ onSwitch = () => {} } = {}) {
  const dialog = document.querySelector("#detail-panel");
  const content = document.querySelector("#detail-content");
  const labels = document.querySelector("#station-labels");
  const stationButtons = [...document.querySelectorAll("[data-station]")];
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionToggle = document.querySelector("#motion-toggle");
  const resetButton = document.querySelector("#reset-view");
  const wallSwitch = document.querySelector("#wall-style-switch");
  const canvas = document.querySelector("#workshop-canvas");
  const stage = document.querySelector("#workshop-stage");
  const listeners = new AbortController();
  const listen = (target, type, callback) => target.addEventListener(type, callback, { signal: listeners.signal });
  let scene;
  let disposed = false;
  let selectedStation = null;
  let selectionVersion = 0;
  let opener = null;
  let pendingFocusTarget = null;
  let motionPaused = motionQuery.matches;
  let companionClicks = 0;

  function updateMotionButton() {
    motionToggle.setAttribute("aria-pressed", String(motionPaused));
    document.querySelector("#motion-label").textContent = motionPaused ? "Resume motion" : "Pause motion";
    motionToggle.querySelector(".motion-icon").textContent = motionPaused ? "▷" : "Ⅱ";
  }

  function restoreStationFocus() {
    if (disposed || !pendingFocusTarget || dialog.open || labels.hidden || pendingFocusTarget.hidden) return;
    pendingFocusTarget.focus({ preventScroll: true });
    pendingFocusTarget = null;
  }

  function switchPortfolio() {
    if (!disposed && !wallSwitch.disabled) onSwitch();
  }

  function positionWallSwitch(position) {
    if (!position?.visible) {
      wallSwitch.classList.remove("is-positioned");
      wallSwitch.style.removeProperty("left");
      wallSwitch.style.removeProperty("top");
      return;
    }
    const halfWidth = wallSwitch.offsetWidth / 2;
    const halfHeight = wallSwitch.offsetHeight / 2;
    const x = Math.max(halfWidth + 12, Math.min(stage.clientWidth - halfWidth - 12, position.x));
    const y = Math.max(halfHeight + 12, Math.min(stage.clientHeight - halfHeight - 12, position.y));
    wallSwitch.style.left = `${x}px`;
    wallSwitch.style.top = `${y}px`;
    wallSwitch.classList.add("is-positioned");
  }

  async function selectStation(id, trigger) {
    if (disposed) return;
    if (id === "portfolio-switch") {
      switchPortfolio();
      return;
    }
    if (id === "companion") {
      companionClicks += 1;
      const greetings = ["A little bounce, just for you.", "Still here. Still cheering you on.", "Okay, you’re officially friends."];
      document.querySelector("#companion-note").textContent = greetings[(companionClicks - 1) % greetings.length];
      return;
    }
    const station = stations[id];
    if (!station) return;
    const version = ++selectionVersion;
    selectedStation = id;
    opener = trigger || labels.querySelector(`[data-station="${id}"]`);
    pendingFocusTarget = null;
    stationButtons.forEach((button) => {
      if (button.dataset.station === id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    document.querySelector("#detail-title").textContent = station.title;
    document.querySelector("#detail-kicker").textContent = station.kicker;
    document.querySelector("#detail-subtitle").textContent = station.subtitle;
    content.textContent = "Opening the details…";
    content.setAttribute("aria-busy", "true");
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    scene?.focusStation(id);
    try {
      const portfolio = await loadPortfolioContent();
      if (disposed || version !== selectionVersion || !dialog.open) return;
      content.replaceChildren(portfolio[id].cloneNode(true));
    } catch (error) {
      if (disposed || version !== selectionVersion || !dialog.open) return;
      const message = document.createElement("p");
      message.textContent = "The details couldn’t load. Please try again.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Try again";
      listen(retry, "click", () => selectStation(id, opener));
      const wrapper = document.createElement("div");
      wrapper.className = "content-error";
      wrapper.append(message, retry);
      content.replaceChildren(wrapper);
      console.error("Portfolio details could not load:", error);
    } finally {
      if (!disposed && version === selectionVersion) content.removeAttribute("aria-busy");
    }
  }

  function showSceneUnavailable(message) {
    if (disposed) return;
    document.body.dataset.sceneState = "unavailable";
    document.querySelector("#scene-notice").hidden = false;
    document.querySelector("#scene-notice-text").textContent = message;
    labels.hidden = false;
    stationButtons.forEach((button) => {
      button.hidden = false;
      button.style.removeProperty("left");
      button.style.removeProperty("top");
      button.style.removeProperty("transform");
    });
    positionWallSwitch(null);
    resetButton.disabled = true;
    motionToggle.disabled = true;
    document.querySelector("#interaction-hint").textContent = "Choose a station to explore";
    restoreStationFocus();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    selectionVersion += 1;
    listeners.abort();
    pendingFocusTarget = null;
    opener = null;
    selectedStation = null;
    if (dialog.open) dialog.close();
    content.removeAttribute("aria-busy");
    scene?.dispose();
    scene = null;
  }

  stationButtons.forEach((button) => listen(button, "click", () => selectStation(button.dataset.station, button)));
  listen(wallSwitch, "click", switchPortfolio);
  listen(document.querySelector("#close-detail"), "click", () => dialog.close());
  listen(dialog, "click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  listen(dialog, "close", () => {
    pendingFocusTarget = opener;
    selectionVersion += 1;
    selectedStation = null;
    content.removeAttribute("aria-busy");
    stationButtons.forEach((button) => button.removeAttribute("aria-current"));
    scene?.resetView();
    restoreStationFocus();
  });
  listen(resetButton, "click", () => scene?.resetView());
  listen(motionToggle, "click", () => {
    motionPaused = !motionPaused;
    scene?.setMotionPaused(motionPaused);
    updateMotionButton();
  });
  listen(motionQuery, "change", (event) => {
    motionPaused = event.matches;
    scene?.setMotionPaused(motionPaused);
    updateMotionButton();
  });
  listen(canvas, "webglcontextlost", (event) => {
    event.preventDefault();
    scene?.dispose();
    scene = null;
    showSceneUnavailable("The room’s display was interrupted. Reload to reopen it, or explore the stations below.");
  });
  updateMotionButton();
  if (window.matchMedia("(pointer: coarse)").matches) {
    document.querySelector("#interaction-hint").textContent = "Drag to look around · Tap a station to explore";
  }

  try {
    const { createWorkshopScene } = await import("./workshop-scene.js?v=20261015-switch");
    if (disposed) return dispose;
    scene = createWorkshopScene({
      canvas,
      onSelect: selectStation,
      reducedMotion: motionPaused,
      onProject: (positions) => {
        if (disposed) return;
        for (const position of positions) {
          if (position.id === "portfolio-switch") {
            positionWallSwitch(position);
            continue;
          }
          const label = labels.querySelector(`[data-station="${position.id}"]`);
          if (!label) continue;
          label.style.left = `${position.x}px`;
          label.style.top = `${position.y}px`;
          label.style.transform = "translate(-50%, -100%)";
          label.hidden = !position.visible;
        }
        restoreStationFocus();
      },
    });
    scene.setMotionPaused(motionPaused);
    if (selectedStation) scene.focusStation(selectedStation);
    document.body.dataset.sceneState = "ready";
    document.querySelector("#scene-notice").hidden = true;
    labels.hidden = false;
    resetButton.disabled = false;
    motionToggle.disabled = false;
  } catch (error) {
    if (!disposed) {
      showSceneUnavailable("This browser couldn’t open the 3D room. You can still explore every station below.");
      console.error("The workshop could not start:", error);
    }
  }

  return dispose;
}
