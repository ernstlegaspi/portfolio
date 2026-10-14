const choices = [...document.querySelectorAll("[data-portfolio-choice]")];
const entry = document.querySelector(".entry");
const status = document.querySelector("#portfolio-status");
const entryStyles = document.querySelector("#entry-styles");
const templates = [...document.querySelectorAll("body > template")];
const theme = document.querySelector('meta[name="theme-color"]');
const modes = {
  normal: {
    stylesheet: "./styles.css?v=20261015-switch",
    load: () => import("./main.js?v=20261015-switch"),
    initialize: (module, options) => module.initNormalPortfolio(options),
    other: "workshop",
    title: "Ernst Legaspi - Portfolio",
    theme: "#050505",
  },
  workshop: {
    stylesheet: "./workshop.css?v=20261015-switch",
    load: () => import("./workshop.js?v=20261015-switch"),
    initialize: (module, options) => module.initWorkshop(options),
    other: "normal",
    title: "Ernst Legaspi - 3D Portfolio",
    theme: "#101713",
  },
};
const stylesheets = new Map();
let activeMode = "entry";
let activeStyles = entryStyles;
let disposeView = null;
let opening = false;

function loadStylesheet(href) {
  if (stylesheets.has(href)) return stylesheets.get(href);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    // Load the next view without changing the view currently on screen.
    link.media = "not all";
    link.addEventListener("load", () => resolve(link), { once: true });
    link.addEventListener("error", () => {
      link.remove();
      stylesheets.delete(href);
      reject(new Error(`Unable to load portfolio styles: ${href}`));
    }, { once: true });
    document.head.append(link);
  });
  stylesheets.set(href, promise);
  return promise;
}

function setBusy(busy) {
  document.querySelectorAll("[data-portfolio-choice], [data-portfolio-switch]").forEach((button) => {
    button.disabled = busy;
  });
  const main = document.querySelector("main");
  if (busy) main?.setAttribute("aria-busy", "true");
  else main?.removeAttribute("aria-busy");
}

function activateStyles(stylesheet) {
  activeStyles.disabled = true;
  activeStyles.media = "not all";
  stylesheet.disabled = false;
  stylesheet.media = "all";
  activeStyles = stylesheet;
}

function showChooser() {
  disposeView?.();
  disposeView = null;
  activateStyles(entryStyles);
  document.body.replaceChildren(entry, status, ...templates);
  document.body.dataset.portfolio = "entry";
  delete document.body.dataset.sceneState;
  document.title = "Ernst Legaspi - Portfolio";
  theme.content = "#090d0b";
  activeMode = "entry";
}

async function openPortfolio(mode) {
  if (opening || !modes[mode] || mode === activeMode) return;
  opening = true;
  const trigger = document.activeElement;
  let mounted = false;
  setBusy(true);
  status.textContent = activeMode === "entry" ? "Opening your portfolio…" : "Switching portfolio…";

  try {
    const settings = modes[mode];
    const [styles, script] = await Promise.allSettled([
      loadStylesheet(settings.stylesheet),
      settings.load(),
    ]);
    if (styles.status === "rejected") throw styles.reason;
    if (script.status === "rejected") throw script.reason;
    const template = document.querySelector(`#${mode}-template`);
    const view = template.content.cloneNode(true);

    // Stop the old view before replacing its DOM or starting any new animation.
    disposeView?.();
    disposeView = null;
    document.body.replaceChildren(view, status, ...templates);
    mounted = true;
    document.body.dataset.portfolio = mode;
    delete document.body.dataset.sceneState;
    activateStyles(styles.value);
    document.title = settings.title;
    theme.content = settings.theme;
    window.scrollTo(0, 0);
    setBusy(true);
    const main = document.querySelector("main");
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    disposeView = await settings.initialize(script.value, {
      onSwitch: () => openPortfolio(settings.other),
    });
    activeMode = mode;
    status.textContent = "";
  } catch (error) {
    // Preparation failures leave the working portfolio intact. If mounting
    // fails, the chooser remains a usable way to retry either experience.
    if (mounted) showChooser();
    status.textContent = "Couldn’t switch portfolios. Please try again.";
    console.error("The selected portfolio could not open:", error);
  } finally {
    opening = false;
    setBusy(false);
    if (status.textContent) {
      const focusTarget = trigger?.isConnected ? trigger : choices[0];
      focusTarget?.focus({ preventScroll: true });
    }
  }
}

choices.forEach((button) => {
  button.addEventListener("click", () => openPortfolio(button.dataset.portfolioChoice));
});

window.addEventListener("pagehide", (event) => {
  if (!event.persisted) disposeView?.();
});
