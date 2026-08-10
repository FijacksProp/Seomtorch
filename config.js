window.SEOMTORCH_CONFIG = {
  API_URL: ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8000/api"
    : "https://seomtorch.onrender.com/api"
};
