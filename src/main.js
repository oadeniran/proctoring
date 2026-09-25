import "./style.css";
import { api } from "./api.js";
import { currentView, navigate } from "./store.js";
import { el, clear } from "./util.js";
import { renderRegister } from "./register.js";
import { renderAdmission } from "./admission.js";

const app = document.querySelector("#app");

// ── App shell ──────────────────────────────────────────────────────────
const statusDot = el("span", { class: "status__dot" });
const statusText = el("span", { class: "status__text" }, "connecting…");
const status = el("div", { class: "status", title: "Backend connection" }, statusDot, statusText);

const tabRegister = tab("Registration", "register");
const tabAdmission = tab("Hall admission", "admission");

const header = el(
  "header",
  { class: "topbar" },
  el(
    "div",
    { class: "topbar__brand" },
    brandMark(),
    el(
      "div",
      {},
      el("div", { class: "topbar__title" }, "Examination Proctoring"),
      el("div", { class: "topbar__kicker" }, "Access & Verification")
    )
  ),
  el("nav", { class: "tabs" }, tabRegister, tabAdmission),
  status
);

const main = el("main", { class: "content" });
app.append(header, main);

// ── Routing ──────────────────────────────────────────────────────────
let current = null;
function mount() {
  const view = currentView();
  tabRegister.classList.toggle("is-active", view === "register");
  tabAdmission.classList.toggle("is-active", view === "admission");
  if (current?.__cleanup) current.__cleanup();
  current = view === "admission" ? renderAdmission() : renderRegister();
  clear(main).append(current);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", mount);
if (!location.hash) location.hash = "#/register";
mount();

// ── Health polling ─────────────────────────────────────────────────────
async function poll() {
  try {
    const h = await api.health();
    statusDot.className = "status__dot status__dot--ok";
    const b = h.backends || {};
    statusText.textContent = `store: ${b.repo || "?"}`;
    status.title = Object.entries(b)
      .map(([k, v]) => `${k}: ${v}`)
      .join("  ·  ");
  } catch {
    statusDot.className = "status__dot status__dot--down";
    statusText.textContent = "offline";
    status.title = "Cannot reach the proctoring service";
  }
}
poll();
setInterval(poll, 8000);

// ── bits ────────────────────────────────────────────────────────────
function tab(label, view) {
  return el("button", { class: "tab", onclick: () => navigate(view) }, label);
}

function brandMark() {
  // A simple institutional shield + fingerprint ridge — drawn, not imported.
  const s = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M20 3 5 8v11c0 8.3 6 14.5 15 18 9-3.5 15-9.7 15-18V8L20 3Z" fill="#ffffff" opacity=".14"/>
    <path d="M20 3 5 8v11c0 8.3 6 14.5 15 18 9-3.5 15-9.7 15-18V8L20 3Z" stroke="#ffffff" stroke-width="1.6"/>
    <path d="M14 21c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M16.5 22.5c0-1.9 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M20 22.5v4" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
  return el("span", { class: "brandmark", html: s });
}
