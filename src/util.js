// Tiny vanilla helpers — no framework, no components. `el` is just a safe
// document.createElement wrapper so user/candidate data goes in via textContent
// (never innerHTML) and event handlers attach inline.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v; // only for trusted static markup
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "dataset") {
      Object.assign(node.dataset, v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

// Human labels for the backend's machine reasons.
const REASON_LABELS = {
  unknown_candidate: "No matching admission record",
  fingerprint_mismatch: "Fingerprint did not match enrolment",
  face_mismatch: "Face did not match enrolment",
  fee_unpaid: "Outstanding examination fees",
  watchlist_block: "Flagged on the watchlist",
  already_entered: "Already checked in (anti-passback)",
  no_biometric_presented: "No biometric captured",
};
export const reasonLabel = (r) => REASON_LABELS[r] || r.replace(/_/g, " ");

export function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const pct = (score) =>
  score == null || score < 0 ? "—" : Math.round(score * 100) + "%";

export function initials(first, last) {
  return ((first?.[0] || "") + (last?.[0] || "")).toUpperCase() || "?";
}

// Lightweight toast for confirmations and errors.
let toastHost;
export function toast(message, kind = "info") {
  if (!toastHost) {
    toastHost = el("div", { class: "toast-host" });
    document.body.append(toastHost);
  }
  const t = el("div", { class: `toast toast--${kind}`, text: message });
  toastHost.append(t);
  setTimeout(() => t.classList.add("toast--in"), 10);
  setTimeout(() => {
    t.classList.remove("toast--in");
    setTimeout(() => t.remove(), 250);
  }, 3200);
}

// ── Biometrics (camera / upload → a comparable vector) ─────────────────
// The browser can't read a real fingerprint reader; it CAN take a camera
// photo or an uploaded image. We turn either into a difference-hash (dHash)
// expressed as a ±1 vector. Cosine of two such vectors (as the backend
// computes it) equals the fraction of agreeing bits — identical image ≈ 1.0,
// different image ≈ 0.5 — so it works with the existing matcher unchanged.
// This is a PLACEHOLDER embedder; swap imageToVector for a real face/finger
// model (e.g. your surveillance InsightFace) without touching anything else.
export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Could not read image"));
    im.src = src;
  });
}

export function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

export async function imageToVector(dataUrl, grid = 16) {
  const img = await loadImage(dataUrl);
  const w = grid + 1;
  const h = grid;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = (x, y) => {
    const i = (y * w + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  const v = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < grid; x++) v.push(gray(x, y) > gray(x + 1, y) ? 1 : -1);
  return v; // length grid*grid, values ±1
}

// A self-contained capture control: shows a preview, a Camera button (inline
// getUserMedia), an Upload button, and a clear link. Exposes getVector() and
// getImageB64() for the caller to send. Used by both enrolment and the gate.
export function createBiometricField({ label, hint, onFile }) {
  let dataUrl = null;
  let vector = null;
  let stream = null;

  const preview = el("div", { class: "bio__preview" });
  const state = el("span", { class: "bio__state muted" }, "none");
  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    style: "display:none",
    onchange: async (e) => {
      const f = e.target.files[0];
      if (f) await set(await fileToDataURL(f));
      e.target.value = "";
    },
  });
  const camPanel = el("div", { class: "bio__cam", hidden: "" });

  async function set(url) {
    dataUrl = url;
    if (url) {
      try {
        vector = await imageToVector(url);
        preview.style.backgroundImage = `url(${url})`;
        preview.classList.add("has");
        state.textContent = "captured";
        state.classList.remove("muted");
        onFile?.();
      } catch (err) {
        toast(err.message, "error");
      }
    } else {
      vector = null;
      preview.style.backgroundImage = "";
      preview.classList.remove("has");
      state.textContent = "none";
      state.classList.add("muted");
    }
  }

  function closeCam() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    camPanel.hidden = true;
    clear(camPanel);
  }

  async function openCam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    } catch (err) {
      toast("Camera unavailable: " + err.message, "error");
      return;
    }
    const video = el("video", { class: "bio__video", autoplay: "", playsinline: "", muted: "" });
    video.srcObject = stream;
    const shoot = el(
      "button",
      {
        type: "button",
        class: "btn btn--primary btn--sm",
        onclick: () => {
          const cv = el("canvas");
          cv.width = video.videoWidth || 320;
          cv.height = video.videoHeight || 240;
          cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
          set(cv.toDataURL("image/jpeg", 0.85));
          closeCam();
        },
      },
      "Capture"
    );
    const cancel = el("button", { type: "button", class: "linkbtn", onclick: closeCam }, "cancel");
    clear(camPanel).append(video, el("div", { class: "bio__camrow" }, shoot, cancel));
    camPanel.hidden = false;
  }

  const node = el(
    "div",
    { class: "bio" },
    el(
      "div",
      { class: "bio__head" },
      el("span", { class: "bio__label" }, label),
      state
    ),
    el(
      "div",
      { class: "bio__row" },
      preview,
      el(
        "div",
        { class: "bio__btns" },
        el("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: openCam }, "Camera"),
        el("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => fileInput.click() }, "Upload"),
        el("button", { type: "button", class: "linkbtn", onclick: () => set(null) }, "clear")
      )
    ),
    hint ? el("p", { class: "bio__hint muted" }, hint) : null,
    camPanel,
    fileInput
  );

  return {
    node,
    getVector: () => vector,
    getImageB64: () => (dataUrl ? dataUrl.split(",")[1] : null),
    hasData: () => !!vector,
    markOnFile: () => {
      if (!vector) {
        state.textContent = "on file";
        state.classList.remove("muted");
      }
    },
    reset: () => {
      closeCam();
      set(null);
    },
    stop: closeCam,
  };
}
