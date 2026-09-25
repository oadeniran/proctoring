// Base URL of the API, up to AND INCLUDING the app prefix (/zonyxstudio).
// Local dev needs no env file — it defaults to localhost. A deployment sets
// VITE_API_BASE in its environment (e.g. .env.production) to point at the
// deployed API. Only the /proctoring segment is appended below.
const DEFAULT_BASE = "http://localhost:8008/zonyxstudio";
const BASE = (import.meta.env.VITE_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
const P = `${BASE}/proctoring`;

async function req(path, opts = {}) {
  let res;
  try {
    res = await fetch(P + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
  } catch {
    throw new Error("Cannot reach the proctoring service. Is the API running?");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  health: () => req("/health"),
  register: (body) => req("/candidates", { method: "POST", body: JSON.stringify(body) }),
  listCandidates: (params = {}) =>
    req("/candidates?" + new URLSearchParams(params).toString()),
  getCandidate: (id) => req("/candidates/" + encodeURIComponent(id)),
  updateCandidate: (id, body) =>
    req("/candidates/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(body) }),
  deleteCandidate: (id) =>
    req("/candidates/" + encodeURIComponent(id), { method: "DELETE" }),
  clearCandidates: (params = {}) =>
    req("/candidates?" + new URLSearchParams(params).toString(), { method: "DELETE" }),
  seed: (count, exam_id) =>
    req("/seed", { method: "POST", body: JSON.stringify({ count, exam_id }) }),
  verify: (body) => req("/gate/verify", { method: "POST", body: JSON.stringify(body) }),
  resetPassback: (code) =>
    req("/gate/reset-passback/" + encodeURIComponent(code), { method: "POST" }),
  events: (limit = 25) => req("/gate/events?limit=" + limit),
};