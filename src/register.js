import { api } from "./api.js";
import { navigate } from "./store.js";
import { el, clear, toast, initials, createBiometricField } from "./util.js";

const EXAM_DEFAULT = "EXAM-DEMO-2026";

export function renderRegister() {
  let editingId = null;

  const passSlot = el("div", { class: "passslot" }, emptyPass());
  const listBody = el("tbody");

  // ── Fields ────────────────────────────────────────────────────────
  const f = {
    first: input("First name", "Ada"),
    last: input("Surname", "Okafor"),
    exam: input("Examination", EXAM_DEFAULT),
    seat: input("Seat number", "A014"),
  };
  const feePaid = checkbox("Examination fees cleared", true);
  const watch = checkbox("Flag on watchlist (for testing denials)", false);
  const accommodations = input("Accommodations (comma-separated, optional)", "extra time");

  const faceBio = createBiometricField({
    label: "Face image",
    hint: "Camera or upload. Used for face verification at the gate.",
  });
  const fpBio = createBiometricField({
    label: "Fingerprint image",
    hint: "Upload a fingerprint image (a real reader needs a device SDK).",
  });

  const title = el("h2", { class: "form__title" }, "Register a candidate");
  const submitBtn = el("button", { class: "btn btn--primary", type: "submit" }, "Register candidate");
  const newBtn = el(
    "button",
    { class: "btn btn--ghost", type: "button", hidden: "", onclick: () => resetForm() },
    "New candidate"
  );

  const form = el(
    "form",
    { class: "card form", onsubmit: onSubmit },
    title,
    el("div", { class: "grid2" }, field(f.first), field(f.last)),
    el("div", { class: "grid2" }, field(f.exam), field(f.seat)),
    field(accommodations),
    el("div", { class: "checks" }, feePaid.wrap, watch.wrap),
    el("div", { class: "biogrid" }, faceBio.node, fpBio.node),
    el("div", { class: "form__actions" }, submitBtn, newBtn)
  );

  function resetForm() {
    editingId = null;
    for (const k of Object.keys(f)) f[k].value = "";
    f.exam.value = EXAM_DEFAULT;
    feePaid.checked = true;
    watch.checked = false;
    accommodations.value = "";
    faceBio.reset();
    fpBio.reset();
    title.textContent = "Register a candidate";
    submitBtn.textContent = "Register candidate";
    newBtn.hidden = true;
  }

  function loadIntoForm(c) {
    editingId = c.id;
    f.first.value = c.first_name;
    f.last.value = c.last_name;
    f.exam.value = c.exam_id;
    f.seat.value = c.seat_no || "";
    feePaid.checked = c.fee_paid;
    watch.checked = c.blacklisted;
    accommodations.value = (c.accommodations || []).join(", ");
    faceBio.reset();
    fpBio.reset();
    if (c.has_face) faceBio.markOnFile();
    if (c.has_fingerprint) fpBio.markOnFile();
    title.textContent = `Edit ${c.first_name} ${c.last_name}`;
    submitBtn.textContent = "Save changes";
    newBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(e) {
    e.preventDefault();
    const first_name = f.first.value.trim();
    const last_name = f.last.value.trim();
    if (!first_name || !last_name) {
      toast("Enter both a first name and a surname.", "error");
      return;
    }
    const body = {
      first_name,
      last_name,
      exam_id: f.exam.value.trim() || EXAM_DEFAULT,
      seat_no: f.seat.value.trim() || null,
      fee_paid: feePaid.checked,
      blacklisted: watch.checked,
      accommodations: accommodations.value.split(",").map((s) => s.trim()).filter(Boolean),
    };
    // Only send biometrics that were freshly captured.
    if (faceBio.hasData()) {
      body.face_embedding = faceBio.getVector();
      body.photo_b64 = faceBio.getImageB64();
    }
    if (fpBio.hasData()) body.fingerprint_template = fpBio.getVector();

    submitBtn.disabled = true;
    submitBtn.textContent = editingId ? "Saving…" : "Registering…";
    try {
      if (editingId) {
        const c = await api.updateCandidate(editingId, body);
        toast(`${c.first_name} ${c.last_name} updated.`, "success");
        clear(passSlot).append(passSlip(c));
      } else {
        const c = await api.register(body);
        toast(`${c.first_name} ${c.last_name} registered.`, "success");
        clear(passSlot).append(passSlip(c));
      }
      resetForm();
      f.first.focus();
      await refresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingId ? "Save changes" : "Register candidate";
    }
  }

  // ── List controls ─────────────────────────────────────────────────
  const seedBtn = el(
    "button",
    {
      class: "btn btn--ghost btn--sm",
      onclick: async () => {
        seedBtn.disabled = true;
        try {
          const r = await api.seed(24, EXAM_DEFAULT);
          toast(`Loaded ${r.created} sample candidates.`, "success");
          await refresh();
        } catch (err) {
          toast(err.message, "error");
        } finally {
          seedBtn.disabled = false;
        }
      },
    },
    "Load sample candidates"
  );

  const clearBtn = el(
    "button",
    {
      class: "btn btn--danger btn--sm",
      onclick: async () => {
        if (!confirm("Delete ALL candidates? This cannot be undone.")) return;
        try {
          const r = await api.clearCandidates({ confirm: true });
          toast(`Cleared ${r.deleted} candidates.`, "success");
          if (editingId) resetForm();
          await refresh();
        } catch (err) {
          toast(err.message, "error");
        }
      },
    },
    "Clear all"
  );

  async function refresh() {
    try {
      const data = await api.listCandidates({ limit: "5" });
      clear(listBody);
      if (!data.items.length) {
        listBody.append(
          el("tr", {}, el("td", { class: "muted", colspan: "6" }, "No candidates yet. Register one above, or load samples."))
        );
        return;
      }
      for (const c of data.items) listBody.append(row(c, loadIntoForm, refresh));
    } catch (err) {
      toast(err.message, "error");
    }
  }
  refresh();

  return el(
    "section",
    { class: "screen" },
    el(
      "header",
      { class: "screen__head" },
      el("h1", { class: "screen__title" }, "Candidate registration"),
      el("p", { class: "screen__sub" }, "Enrol a candidate, capture their biometrics, and issue an admission pass. Edit or remove records below.")
    ),
    el("div", { class: "cols" }, form, passSlot),
    el(
      "div",
      { class: "card table-card" },
      el(
        "div",
        { class: "table-card__head" },
        el("h2", { class: "h2" }, "Registered candidates"),
        el("div", { class: "table-card__tools" }, seedBtn, clearBtn)
      ),
      el(
        "div",
        { class: "table-wrap" },
        el(
          "table",
          { class: "table" },
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", {}, "Candidate"),
              el("th", {}, "Pass code"),
              el("th", {}, "Seat"),
              el("th", {}, "Biometrics"),
              el("th", {}, "Status"),
              el("th", {}, "")
            )
          ),
          listBody
        )
      )
    )
  );
}

// ── field builders ──────────────────────────────────────────────────
function input(label, placeholder) {
  const i = el("input", { class: "input", type: "text", placeholder });
  i._label = label;
  return i;
}
function field(i) {
  return el("label", { class: "field" }, el("span", { class: "field__label" }, i._label), i);
}
function checkbox(label, checked) {
  const box = el("input", { type: "checkbox" });
  box.checked = checked;
  const wrap = el("label", { class: "check" }, box, el("span", {}, label));
  return Object.assign(box, { wrap });
}

// ── admission pass ──────────────────────────────────────────────────
function emptyPass() {
  return el(
    "div",
    { class: "card pass pass--empty" },
    el("p", { class: "muted" }, "The admission pass appears here once a candidate is saved.")
  );
}
function passSlip(c) {
  const printBtn = el("button", { class: "btn btn--ghost btn--sm", onclick: () => window.print() }, "Print pass");
  const gateBtn = el(
    "button",
    { class: "btn btn--primary btn--sm", onclick: () => navigate("admission", { code: c.code }) },
    "Verify at gate"
  );
  return el(
    "div",
    { class: "card pass" },
    el(
      "div",
      { class: "pass__top" },
      el("div", { class: "pass__seal" }, "PASS"),
      el("div", {}, el("div", { class: "pass__exam" }, c.exam_id), el("div", { class: "pass__name" }, `${c.first_name} ${c.last_name}`))
    ),
    el("div", { class: "pass__perf" }),
    el(
      "div",
      { class: "pass__body" },
      el("div", { class: "pass__codelabel" }, "Admission code"),
      el("div", { class: "pass__code" }, c.code),
      el(
        "div",
        { class: "pass__meta" },
        meta("Seat", c.seat_no || "—"),
        meta("Fees", c.fee_paid ? "Cleared" : "Outstanding"),
        meta("Biometrics", biometricSummary(c))
      )
    ),
    el("div", { class: "pass__actions" }, printBtn, gateBtn)
  );
}
function meta(k, v) {
  return el("div", { class: "pass__metaitem" }, el("span", {}, k), el("strong", {}, v));
}
function biometricSummary(c) {
  const parts = [];
  if (c.has_fingerprint) parts.push("fingerprint");
  if (c.has_face) parts.push("face");
  return parts.length ? parts.join(" + ") : "none";
}

// ── table row ───────────────────────────────────────────────────────
function row(c, onEdit, onChange) {
  const feeChip = el("span", { class: "chip " + (c.fee_paid ? "chip--ok" : "chip--warn") }, c.fee_paid ? "Cleared" : "Outstanding");
  const statusChip = c.blacklisted
    ? el("span", { class: "chip chip--bad" }, "Watchlisted")
    : el("span", { class: "chip chip--neutral" }, "Enrolled");

  const bio = el("div", { class: "biochips" });
  bio.append(dot(c.has_fingerprint, "FP"), dot(c.has_face, "Face"));

  const delBtn = el(
    "button",
    {
      class: "linkbtn linkbtn--danger",
      onclick: async () => {
        if (!confirm(`Delete ${c.first_name} ${c.last_name}?`)) return;
        try {
          await api.deleteCandidate(c.id);
          toast("Candidate deleted.", "success");
          await onChange();
        } catch (err) {
          toast(err.message, "error");
        }
      },
    },
    "Delete"
  );

  return el(
    "tr",
    {},
    el("td", {}, el("div", { class: "who" }, el("span", { class: "avatar avatar--sm" }, initials(c.first_name, c.last_name)), `${c.first_name} ${c.last_name}`)),
    el("td", {}, el("code", { class: "code" }, c.code)),
    el("td", {}, c.seat_no || "—"),
    el("td", {}, bio),
    el("td", {}, feeChip, " ", statusChip),
    el(
      "td",
      { class: "cell-action" },
      el(
        "div",
        { class: "rowacts" },
        el("button", { class: "linkbtn", onclick: () => onEdit(c) }, "Edit"),
        el("button", { class: "linkbtn", onclick: () => navigate("admission", { code: c.code }) }, "Gate"),
        delBtn
      )
    )
  );
}
function dot(on, label) {
  return el("span", { class: "biochip " + (on ? "biochip--on" : "biochip--off") }, label);
}
