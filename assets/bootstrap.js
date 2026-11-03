window.__deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  window.__deferredInstallPrompt = event;
  window.dispatchEvent(new CustomEvent("pwa-install-ready", { detail: event }));
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// Independent of app.js: a failed module must not leave a blank screen or an
// endless logo. Rendering real content, not a fixed timer, dismisses this cover.
(() => {
  let observer, slowTimer, errorTimer, mounted = false, finished = false;
  const stop = () => { observer?.disconnect(); clearTimeout(slowTimer); clearTimeout(errorTimer); };
  const ready = () => {
    if (finished) return;
    finished = true; stop();
    const loader = document.getElementById("app-loader");
    if (!loader) return;
    loader.classList.add("dismissed");
    setTimeout(() => loader.remove(), 500);
  };
  const message = (title, detail, state) => {
    if (finished) return;
    const loader = document.getElementById("app-loader");
    if (!loader) return;
    loader.dataset.state = state;
    document.getElementById("boot-status").textContent = title;
    const help = document.getElementById("boot-help");
    help.textContent = detail; help.hidden = false;
    document.getElementById("boot-retry").hidden = false;
  };
  const fail = () => message("Your study space hasn’t opened yet.", "Check your connection and reload. Nothing will be deleted from your account.", "error");
  window.SeomtorchBoot = { ready, fail };
  const mount = () => {
    if (mounted || finished) return;
    mounted = true;
    const app = document.getElementById("app");
    document.getElementById("boot-retry")?.addEventListener("click", () => location.reload());
    if (app?.childElementCount) return ready();
    observer = new MutationObserver(() => { if (app?.childElementCount) ready(); });
    if (app) observer.observe(app, { childList: true });
    slowTimer = setTimeout(() => message("Taking a little longer than usual.", navigator.onLine ? "We’re still opening your study space. You can wait a moment or try reloading." : "You appear to be offline. Previously cached content may still open; otherwise reconnect and try again.", "slow"), 8000);
    errorTimer = setTimeout(fail, 30000);
  };
  window.addEventListener("error", event => {
    if (event.target?.tagName === "SCRIPT" && event.target.type === "module") fail();
  }, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
