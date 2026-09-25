import { api } from "./api.js";
import { store } from "./store.js";
import { el, clear, toast, reasonLabel, fmtTime, pct, initials, createBiometricField } from "./util.js";

export function renderAdmission() {
  const codeInput = el("input", { class: "input input--code", type: "text", placeholder: "ZNX-XXXXXXXX" });
  if (store.gateCode) codeInput.value = store.gateCode;

  const picker = el(
    "select",
    { class: "input", onchange: (e) => { if (e.target.value) codeInput.value = e.target.value; } },
    el("option", { value: "" }, "Choose a registered candidate…")
  );

  const laneInput = el("input", { class: "input", type: "text", value: "L1" });

  // Scan source: two simulated paths + live capture.
  let source = "genuine"; // genuine | impersonation | live
  const faceBio = createBiometricField({ label: "Face scan", hint: "Camera or upload to match against enrolment." });
  const fpBio = createBiometricField({ label: "Fingerprint scan", hint: "Upload a fingerprint image to match." });
  // const livePanel = el("div", { class: "livebio", hidden: "" }, faceBio.node, fpBio.node);
  const livePanel = el("div", { class: "livebio", hidden: "" }, faceBio.node);

  const sourceSeg = el(
    "div",
    { class: "seg seg--wide" },
    srcBtn("Genuine (simulated)", true, "genuine"),
    srcBtn("Impersonation (simulated)", false, "impersonation"),
    srcBtn("Live capture", false, "live")
  );
  function srcBtn(label, active, value) {
    return el(
      "button",
      {
        type: "button",
        class: "seg__btn" + (active ? " is-active" : ""),
        onclick: (e) => {
          for (const sib of e.target.parentElement.children) sib.classList.remove("is-active");
          e.target.classList.add("is-active");
          source = value;
          livePanel.hidden = value !== "live";
          if (value !== "live") {
            faceBio.stop();
            fpBio.stop();
          }
        },
      },
      label
    );
  }

  const verdictSlot = el("div", { class: "verdictslot" }, idlePanel());
  const feedList = el("ul", { class: "feed" });

  const verifyBtn = el(
    "button",
    {
      class: "btn btn--primary",
      onclick: async () => {
        const code = codeInput.value.trim();
        if (!code) return toast("Enter or choose an admission code first.", "error");

        const body = { code, lane: laneInput.value.trim() || "L1" };
        if (source === "genuine") {
          body.simulate = true;
          body.demo_match = true;
        } else if (source === "impersonation") {
          body.simulate = true;
          body.demo_match = false;
        } //else {
        //   body.simulate = false;
        //   if (fpBio.hasData()) body.fingerprint_scan = fpBio.getVector();
        //   if (faceBio.hasData()) body.face_scan = faceBio.getVector();
        //   if (!fpBio.hasData() && !faceBio.hasData()) {
        //     return toast("Capture a face or fingerprint scan first.", "error");
        //   }
        // }
        else {
          body.simulate = false;
          if (faceBio.hasData()) body.face_scan = faceBio.getVector();
          else return toast("Capture a face scan first.", "error");
        }

        verifyBtn.disabled = true;
        verifyBtn.textContent = "Checking…";
        try {
          const res = await api.verify(body);
          clear(verdictSlot).append(verdictPanel(res, code, loadFeed));
          loadFeed();
        } catch (err) {
          toast(err.message, "error");
        } finally {
          verifyBtn.disabled = false;
          verifyBtn.textContent = "Verify entry";
        }
      },
    },
    "Verify entry"
  );

  // ── data ────────────────────────────────────────────────────────────
  async function loadCandidates() {
    try {
      const data = await api.listCandidates({ limit: "200" });
      clear(picker).append(el("option", { value: "" }, "Choose a registered candidate…"));
      for (const c of data.items)
        picker.append(el("option", { value: c.code }, `${c.first_name} ${c.last_name} — ${c.code}${c.seat_no ? " · " + c.seat_no : ""}`));
    } catch {}
  }
  async function loadFeed() {
    try {
      const data = await api.events(25);
      clear(feedList);
      const events = data.events || [];
      if (!events.length) return feedList.append(el("li", { class: "feed__empty muted" }, "No gate activity yet."));
      for (const ev of events) feedList.append(feedItem(ev));
    } catch {}
  }

  loadCandidates();
  loadFeed();
  const timer = setInterval(loadFeed, 4000);

  const view = el(
    "section",
    { class: "screen" },
    el(
      "header",
      { class: "screen__head" },
      el("h1", { class: "screen__title" }, "Hall admission"),
      el("p", { class: "screen__sub" }, "Scan a candidate's pass at the entrance to verify identity and clear them into the hall.")
    ),
    el(
      "div",
      { class: "gate" },
      el(
        "div",
        { class: "card gate__control" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Registered candidate"), picker),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Admission code (scan or type)"), codeInput),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Lane"), laneInput),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Scan source"), sourceSeg),
        livePanel,
        el("p", { class: "hint" }, "Simulated paths need no hardware. Live capture matches a real face/fingerprint image against enrolment."),
        el("div", { class: "form__actions" }, verifyBtn)
      ),
      el(
        "div",
        { class: "gate__main" },
        verdictSlot,
        el("div", { class: "card feed-card" }, el("h2", { class: "h2" }, "Gate activity"), feedList)
      )
    )
  );

  view.__cleanup = () => {
    clearInterval(timer);
    faceBio.stop();
    fpBio.stop();
  };
  return view;
}

// ── panels ──────────────────────────────────────────────────────────
function idlePanel() {
  return el(
    "div",
    { class: "card verdict verdict--idle" },
    el("div", { class: "verdict__glyph" }, gateGlyph()),
    el("p", { class: "muted" }, "Awaiting a scan. The entry decision will show here.")
  );
}

function verdictPanel(res, code, onReset) {
  const admitted = res.admitted;
  const c = res.candidate;
  const head = el(
    "div",
    { class: "verdict__head" },
    el("div", { class: "verdict__badge" }, admitted ? checkGlyph() : crossGlyph()),
    el("div", {}, el("div", { class: "verdict__word" }, admitted ? "Admit" : "Deny"), el("div", { class: "verdict__sub" }, admitted ? "Cleared into the hall" : "Entry refused")),
    el("div", { class: "verdict__lat" }, `${res.latency_ms} ms`)
  );

  const idCard = c
    ? el(
        "div",
        { class: "idcard" },
        el("span", { class: "avatar" }, initials(c.first_name, c.last_name)),
        el("div", {}, el("div", { class: "idcard__name" }, `${c.first_name} ${c.last_name}`), el("div", { class: "idcard__meta" }, `${c.exam_id} · Seat ${c.seat_no || "—"}`), el("code", { class: "code code--sm" }, c.code))
      )
    : el("div", { class: "idcard idcard--unknown" }, el("span", { class: "avatar avatar--bad" }, "?"), el("div", {}, el("div", { class: "idcard__name" }, "Unrecognised pass"), el("code", { class: "code code--sm" }, code)));

  const scores = el("div", { class: "scores" });
  // if (res.scores && "fingerprint" in res.scores) scores.append(meter("Fingerprint", res.scores.fingerprint));
  if (res.scores && "face" in res.scores) scores.append(meter("Face", res.scores.face));

  const body = el("div", { class: "verdict__body" }, idCard, scores);

  if (!admitted && res.reasons?.length) {
    const list = el("ul", { class: "reasons" });
    for (const r of res.reasons) list.append(el("li", {}, el("span", { class: "reasons__dot" }), reasonLabel(r)));
    body.append(list);

    if (res.reasons.includes("already_entered")) {
      const resetBtn = el(
        "button",
        {
          class: "btn btn--ghost btn--sm",
          onclick: async () => {
            resetBtn.disabled = true;
            try {
              await api.resetPassback(code);
              toast("Anti-passback cleared. The candidate may re-enter.", "success");
              onReset();
            } catch (err) {
              toast(err.message, "error");
            } finally {
              resetBtn.disabled = false;
            }
          },
        },
        "Authorise re-entry"
      );
      body.append(el("div", { class: "verdict__resolve" }, el("span", { class: "muted" }, "Invigilator override"), resetBtn));
    }
  }

  return el("div", { class: `card verdict verdict--${admitted ? "ok" : "no"}` }, head, body);
}

function meter(label, score) {
  const value = score == null || score < 0 ? 0 : score;
  const fill = el("span", { class: "meter__fill" });
  fill.style.width = Math.round(value * 100) + "%";
  return el("div", { class: "meter" }, el("div", { class: "meter__row" }, el("span", {}, label), el("strong", {}, pct(score))), el("div", { class: "meter__track" }, fill));
}

function feedItem(ev) {
  const kind = ev.topic === "gate.admitted" ? "ok" : ev.topic === "gate.denied" ? "no" : "neutral";
  const label =
    ev.topic === "gate.admitted" ? "Admitted"
    : ev.topic === "gate.denied" ? "Denied"
    : ev.topic === "gate.passback_reset" ? "Re-entry authorised"
    : ev.topic === "candidate.registered" ? "Registered"
    : ev.topic;
  const detail = ev.reasons && ev.reasons.length ? ev.reasons.split(",").map(reasonLabel).join(", ") : ev.seat_no ? "Seat " + ev.seat_no : "";
  return el(
    "li",
    { class: "feed__item" },
    el("span", { class: `feed__dot feed__dot--${kind}` }),
    el("div", { class: "feed__text" }, el("div", { class: "feed__line" }, el("strong", {}, label), ev.code ? el("code", { class: "code code--xs" }, ev.code) : ""), detail ? el("div", { class: "feed__detail muted" }, detail) : ""),
    el("time", { class: "feed__time muted" }, fmtTime(ev.ts))
  );
}

// ── glyphs ──────────────────────────────────────────────────────────
function svg(path, extra = "") {
  const s = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${path}</svg>`;
  return el("span", { class: "glyph", html: s });
}
const checkGlyph = () => svg('<path d="M20 6 9 17l-5-5"/>');
const crossGlyph = () => svg('<path d="M18 6 6 18M6 6l12 12"/>');
const gateGlyph = () => svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>', 'class="glyph glyph--lg"');
