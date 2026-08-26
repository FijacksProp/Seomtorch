const API_URL = (window.SEOMTORCH_CONFIG?.API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status = 0, fields = null) { super(message); this.status = status; this.fields = fields; }
}

async function request(path, { token, method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { method, cache: "no-store", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Token ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch { throw new ApiError("The server could not be reached. Check your connection and try again."); }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const baseMessage = data?.non_field_errors?.[0] || data?.detail || Object.values(data || {}).flat()[0] || "The request could not be completed.";
    const message = data?.reference ? `${baseMessage} Reference: ${data.reference}` : baseMessage;
    throw new ApiError(String(message), response.status, data);
  }
  return data;
}

export const api = {
  register: body => request("/auth/register/", { method: "POST", body }),
  login: body => request("/auth/login/", { method: "POST", body }),
  me: token => request("/auth/me/", { token }),
  changePassword: (token, body) => request("/auth/change-password/", { token, method: "POST", body }),
  logout: token => request("/auth/logout/", { token, method: "POST" }),
  startSession: (token, body) => request("/sessions/", { token, method: "POST", body }),
  completeSession: (token, id) => request(`/sessions/${id}/complete/`, { token, method: "POST" }),
  syncAttempt: (token, body) => request("/attempts/", { token, method: "POST", body }),
  attempts: token => request("/attempts/", { token }),
  progress: token => request("/progress/", { token }),
  bookmarks: token => request("/bookmarks/", { token }),
  addBookmark: (token, question_id) => request("/bookmarks/", { token, method: "POST", body: { question_id } }),
  removeBookmark: (token, question_id) => request("/bookmarks/", { token, method: "DELETE", body: { question_id } }),
  // Question comments
  questionComments: (token, questionId) => request(`/questions/${questionId}/comments/`, { token }),
  addComment: (token, questionId, text) => request(`/questions/${questionId}/comments/`, { token, method: "POST", body: { text } }),
  // Question flagging/reporting
  reportQuestion: (token, questionId, reason, details) => request(`/questions/${questionId}/report/`, { token, method: "POST", body: { reason, details } }),
  // Daily sprint
  dailySprint: token => request("/daily-sprint/", { token, method: "POST" }),
  achievements: token => request("/achievements/", { token }),
  markBadgesSeen: (token, codes) => request("/achievements/", { token, method: "POST", body: { codes } }),
  lookupStudent: (token, publicId) => request(`/students/lookup/?id=${encodeURIComponent(publicId)}`, { token }),
  challenges: token => request("/challenges/", { token }),
  createChallenge: (token, body) => request("/challenges/", { token, method: "POST", body }),
  challenge: (token, id) => request(`/challenges/${id}/`, { token }),
  removeChallenge: (token, id) => request(`/challenges/${id}/`, { token, method: "DELETE" }),
  respondChallenge: (token, id, response) => request(`/challenges/${id}/respond/`, { token, method: "POST", body: { response } }),
  startChallenge: (token, id) => request(`/challenges/${id}/start/`, { token, method: "POST", body: {} }),
};
