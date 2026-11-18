const localFrontend = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const useLocalBackend = localFrontend && new URLSearchParams(window.location.search).get("api") === "local";

// Local UI development uses the shared hosted account database by default.
// Add ?api=local when running Django locally on 127.0.0.1:8000.
window.SEOMTORCH_CONFIG = {
  API_URL: useLocalBackend ? "http://127.0.0.1:8000/api" : "https://seomtorch.onrender.com/api"
};
