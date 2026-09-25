// Minimal cross-screen state + hash navigation. No router library.
export const store = { gateCode: "" };

export function currentView() {
  const v = location.hash.replace(/^#\/?/, "");
  return v === "admission" ? "admission" : "register";
}

export function navigate(view, opts = {}) {
  if (opts.code != null) store.gateCode = opts.code;
  location.hash = "#/" + view;
}
