if (location.pathname === "/privacy" || location.hash === "#/privacy") document.body.classList.add("priv");
(() => {
  const $ = (id) => document.getElementById(id);
  const msg = (t, ok) => { $("msg").textContent = t || ""; $("msg").className = "msg" + (ok ? " ok" : ""); };
  const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }));
  fetch("/auth/methods").then((r) => r.json()).then((m) => {
    if (!m.email) return;
    $("or").hidden = false; $("f1").hidden = false;
  }).catch(() => {});
  $("f1").addEventListener("submit", async (e) => {
    e.preventDefault(); msg(""); $("send").disabled = true;
    const r = await post("/auth/email/start", { email: $("email").value });
    $("send").disabled = false;
    if (!r.ok) return msg(r.error || "Could not send the code.");
    $("f1").hidden = true; $("f2").hidden = false; $("code").focus();
    msg("We sent a 6-digit code to " + $("email").value.trim() + ".", true);
  });
  $("f2").addEventListener("submit", async (e) => {
    e.preventDefault(); msg(""); $("check").disabled = true;
    const r = await post("/auth/email/verify", { email: $("email").value, code: $("code").value });
    if (r.ok) return location.replace("/");
    $("check").disabled = false; $("code").select(); msg(r.error || "That code did not work.");
  });
  $("back").addEventListener("click", () => { $("f2").hidden = true; $("f1").hidden = false; $("code").value = ""; msg(""); $("email").focus(); });
})();
