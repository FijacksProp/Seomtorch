window.__deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  window.__deferredInstallPrompt = event;
  window.dispatchEvent(new CustomEvent("pwa-install-ready", { detail: event }));
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

const startLoaderFailsafe = () => {
  window.__seomtorchLoaderFailsafe = window.setTimeout(() => {
    const loader = document.getElementById("app-loader");
    if (!loader) return;
    loader.classList.add("dismissed");
    window.setTimeout(() => loader.remove(), 700);
  }, 5000);
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startLoaderFailsafe, { once: true });
else startLoaderFailsafe();
