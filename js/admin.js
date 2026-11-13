/* =========================================================
   Venips – espace administrateur (Supabase)
   ========================================================= */
(function () {
  "use strict";

  const S = window.STORE;
  const sb = window.supabase.createClient(S.supabaseUrl, S.supabaseKey);
  const root = document.getElementById("admin");
  const $ = (sel, r = document) => r.querySelector(sel);
  const $$ = (sel, r = document) => Array.from(r.querySelectorAll(sel));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR").replace(/ | /g, " ") + " GNF";
  const fmtDate = (d) => new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

  const STATUSES = {
    nouvelle: "Nouvelle", confirmee: "Confirmée", en_livraison: "En livraison", livree: "Livrée", annulee: "Annulée"
  };
  const ICONS = ["phone", "laptop", "tablet", "tv", "headphones", "speaker", "watch", "charger", "solar", "gaming"];

  let session = null;
  let tab = "dashboard";
  let cache = { products: [], categories: [], orders: [] };
  let refreshTimer = null;

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg, isError) {
    const t = $("#toast");
    t.textContent = msg;
    t.style.background = isError ? "#b91c1c" : "";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), isError ? 5000 : 2600);
  }
  const fail = (error, prefix = "Erreur") => { console.error(error); toast(`${prefix} : ${error.message || error}`, true); };

  /* ---------- Connexion ---------- */
  function viewAuth(mode = "login", message = "") {
    stopRefresh();
    root.innerHTML = `
      <div class="auth-wrap"><div class="auth-card">
        <div class="logo-box"><img src="${esc(S.logoImage || "images/logo.jpg")}" alt="${esc(S.name)}"></div>
        <h1>${mode === "login" ? "Espace administrateur" : "Créer le compte administrateur"}</h1>
        <p class="hint" style="margin:0">${mode === "login" ? "Connectez-vous pour gérer la boutique." : "Choisissez l'email et le mot de passe qui serviront à gérer la boutique."}</p>
        ${message}
        <div id="google-slot"></div>
        <form id="auth-form">
          <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" name="email" autocomplete="email" required></div>
          <div class="field"><label for="a-pass">Mot de passe</label><input id="a-pass" type="password" name="password" minlength="8" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required>
            ${mode === "signup" ? `<small class="hint">8 caractères minimum.</small>` : ""}</div>
          <button class="btn btn-primary btn-block">${mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
        </form>
        <div class="auth-switch">${mode === "login"
          ? `Première connexion ? <button data-auth="signup">Créer le compte</button><br><button data-auth="reset" style="margin-top:8px">Mot de passe oublié ?</button>`
          : `Déjà un compte ? <button data-auth="login">Se connecter</button>`}</div>
        <p class="auth-switch"><a href="./" class="link">← Retour à la boutique</a></p>
      </div></div>`;
    // Bouton Google, seulement s'il est activé dans Supabase
    fetch(`${S.supabaseUrl}/auth/v1/settings`, { headers: { apikey: S.supabaseKey } })
      .then((r) => r.json())
      .then((d) => {
        const slot = $("#google-slot");
        if (!slot || !(d.external && d.external.google)) return;
        slot.innerHTML = `<button type="button" class="btn-google" id="google-btn" style="margin-top:16px"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg><span>Continuer avec Google</span></button><div class="or-sep"><span>ou avec votre email</span></div>`;
        $("#google-btn").addEventListener("click", async () => {
          const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
          if (error) fail(error, "Connexion Google indisponible");
        });
      })
      .catch(() => { /* pas de bouton Google */ });
    $("#auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, btn = $("button", f);
      const email = f.email.value.trim(), password = f.password.value;
      btn.disabled = true;
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        btn.disabled = false;
        if (error) return viewAuth("login", `<div class="notice err" style="margin-top:14px">Email ou mot de passe incorrect${error.message.includes("confirm") ? " (email pas encore confirmé)" : ""}.</div>`);
      } else {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split("#")[0] } });
        btn.disabled = false;
        if (error) return viewAuth("signup", `<div class="notice err" style="margin-top:14px">${esc(error.message)}</div>`);
        if (!data.session) return viewAuth("login", `<div class="notice" style="margin-top:14px">Compte créé ✓ Ouvrez l'email de confirmation envoyé à <b>${esc(email)}</b>, cliquez sur le lien, puis connectez-vous ici.</div>`);
      }
    });
    $$("[data-auth]").forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.auth !== "reset") return viewAuth(b.dataset.auth);
      const email = $("#a-email").value.trim();
      if (!email) return toast("Saisissez d'abord votre email", true);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
      if (error) return fail(error);
      viewAuth("login", `<div class="notice" style="margin-top:14px">Un lien de réinitialisation a été envoyé à <b>${esc(email)}</b>.</div>`);
    }));
  }

  function viewPasswordReset() {
    root.innerHTML = `
      <div class="auth-wrap"><div class="auth-card">
        <div class="logo-box"><img src="${esc(S.logoImage || "images/logo.jpg")}" alt="${esc(S.name)}"></div>
        <h1>Nouveau mot de passe</h1>
        <form id="reset-form">
          <div class="field"><label for="r-pass">Nouveau mot de passe</label><input id="r-pass" type="password" name="password" minlength="8" autocomplete="new-password" required></div>
          <button class="btn btn-primary btn-block">Enregistrer</button>
        </form>
      </div></div>`;
    $("#reset-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: e.target.password.value });
      if (error) return fail(error);
      toast("Mot de passe modifié ✓");
      start();
    });
  }

  /* ---------- Double vérification (TOTP) ---------- */
  async function viewMfa() {
    stopRefresh();
    const { data: f, error } = await sb.auth.mfa.listFactors();
    if (error) return fail(error);
    const verified = (f.all || []).find((x) => x.factor_type === "totp" && x.status === "verified");
    const card = (inner) => {
      root.innerHTML = `<div class="auth-wrap"><div class="auth-card">
        <div class="logo-box"><img src="${esc(S.logoImage || "images/logo.jpg")}" alt="${esc(S.name)}"></div>${inner}
        <p class="auth-switch"><button id="mfa-logout">Se déconnecter</button></p></div></div>`;
      $("#mfa-logout").addEventListener("click", () => sb.auth.signOut());
    };
    const codeForm = (label) => `<form id="mfa-form" autocomplete="off">
        <div class="field"><label for="mfa-code">${label}</label>
          <input id="mfa-code" class="otp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="123456" autocomplete="one-time-code" required></div>
        <button class="btn btn-primary btn-block">Valider</button>
        <div id="mfa-msg"></div>
      </form>`;
    const bindCode = (factorId) => {
      const input = $("#mfa-code");
      input.focus();
      input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 6); });
      $("#mfa-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = $("#mfa-form button");
        btn.disabled = true; btn.textContent = "Vérification…";
        const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId, code: input.value });
        if (err) {
          btn.disabled = false; btn.textContent = "Valider";
          $("#mfa-msg").innerHTML = `<div class="notice err">Code incorrect ou expiré. Vérifiez que l'heure de votre téléphone est automatique et réessayez avec le nouveau code.</div>`;
          input.select();
          return;
        }
        toast("Accès vérifié ✓");
        start();
      });
    };

    if (verified) {
      card(`<h1>Vérification en 2 étapes</h1>
        <p class="hint" style="margin:0">Ouvrez votre application d'authentification (Google Authenticator…) et saisissez le code à 6 chiffres affiché pour <b>Venips admin</b>.</p>
        ${codeForm("Code à 6 chiffres")}`);
      return bindCode(verified.id);
    }

    // Première fois : on supprime les essais non terminés puis on crée le QR code
    for (const x of (f.all || []).filter((x) => x.status !== "verified")) await sb.auth.mfa.unenroll({ factorId: x.id });
    const { data: en, error: enErr } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Venips admin " + new Date().toISOString().slice(0, 10) });
    if (enErr) return fail(enErr);
    card(`<h1>Protégez votre espace admin</h1>
      <p class="hint" style="margin:0 0 12px">Une seule fois : après votre mot de passe, l'admin demandera un code à 6 chiffres donné par votre téléphone. Un pirate qui volerait votre mot de passe ne pourra pas entrer.</p>
      <ol class="mfa-steps">
        <li>Installez <b>Google Authenticator</b> (ou Microsoft Authenticator) sur votre téléphone.</li>
        <li>Dans l'application, appuyez sur <b>+</b> puis <b>Scanner un code QR</b> :</li>
      </ol>
      <div class="mfa-qr"><img src="${en.totp.qr_code}" alt="Code QR à scanner"></div>
      <details class="mfa-secret"><summary>Impossible de scanner ? Saisir la clé à la main</summary><code>${esc(en.totp.secret)}</code></details>
      <p class="notice warn" style="margin:12px 0 0;font-size:13px">Gardez cette clé en lieu sûr (photo, papier) : elle permet de réinstaller l'accès sur un nouveau téléphone.</p>
      ${codeForm("3. Saisissez le code affiché par l'application")}`);
    bindCode(en.id);
  }

  /* ---------- Accès refusé : on fait comme si la page n'existait pas ---------- */
  function viewNotFound() {
    stopRefresh();
    document.title = "Page introuvable – " + S.name;
    root.innerHTML = `<div class="auth-wrap"><div class="auth-card" style="text-align:center">
      <div class="logo-box"><img src="${esc(S.logoImage || "images/logo.jpg")}" alt="${esc(S.name)}"></div>
      <h1>Page introuvable</h1>
      <p class="hint">La page que vous cherchez n'existe pas ou a été déplacée.</p>
      <a href="/" class="btn btn-primary btn-block">Retour à la boutique</a>
    </div></div>`;
  }

  async function start() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    // Pas connecté : la page « n'existe pas ». L'administrateur se connecte depuis la boutique (Mon compte).
    if (!session) return viewNotFound();
    // Compte administrateur ? (indépendamment de la double vérification)
    let { data: ok, error } = await sb.rpc("admin_account");
    if (error) ({ data: ok, error } = await sb.rpc("is_admin"));   // avant activation côté base
    if (error) return fail(error);
    if (ok) {
      // Double vérification obligatoire : code à 6 chiffres de l'application d'authentification
      const { data: aal, error: aalErr } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalErr) return fail(aalErr);
      if (aal.currentLevel !== "aal2") return viewMfa();
    }
    if (!ok) return viewNotFound();
    document.title = "Administration – " + S.name;
    if (!ok) {
      root.innerHTML = `
        <div class="auth-wrap"><div class="auth-card">
          <div class="logo-box"><img src="${esc(S.logoImage || "images/logo.jpg")}" alt="${esc(S.name)}"></div>
          <h1>Compte client</h1>
          <div class="notice warn" style="margin:14px 0"><b>${esc(session.user.email)}</b> est un compte client : il permet de commander et de suivre ses commandes sur la boutique, mais pas de gérer le site.<br><br>Si c'est votre compte personnel d'administration, communiquez cet identifiant pour l'activer :<br><code style="word-break:break-all">${esc(session.user.id)}</code></div>
          <a href="./#/compte" class="btn btn-primary btn-block" style="margin-bottom:10px">Aller à mon compte client</a>
          <button class="btn btn-outline btn-block" id="logout">Se déconnecter</button>
        </div></div>`;
      $("#logout").addEventListener("click", () => sb.auth.signOut());
      return;
    }
    tab = (location.hash.slice(2) || "dashboard").split("/")[0];
    renderShell();
  }

  /* ---------- Gabarit ---------- */
  const NAV = [
    ["dashboard", "📊", "Tableau de bord"], ["stats", "📈", "Statistiques"], ["commandes", "🧾", "Commandes"], ["produits", "📦", "Produits"], ["clients", "👥", "Clients"],
    ["demandes", "📨", "Demandes"], ["avis", "⭐", "Avis clients"],
    ["categories", "🗂️", "Catégories"], ["livraison", "🚚", "Livraison"], ["promos", "🏷️", "Codes promo"]
  ];
  function renderShell() {
    if (!NAV.some((n) => n[0] === tab)) tab = "dashboard";
    root.innerHTML = `
      <div class="admin">
        <nav class="side">
          <div class="brand"><img src="${esc(S.logoImage || "images/logo.jpg")}" alt="${esc(S.name)}"><small>Admin</small></div>
          ${NAV.map(([id, ic, label]) => `<a href="#/${id}" class="${tab === id ? "active" : ""}">${ic} ${label}${id === "commandes" ? `<span class="pill-count" id="new-count" hidden></span>` : id === "demandes" ? `<span class="pill-count" id="req-count" hidden></span>` : id === "avis" ? `<span class="pill-count" id="rev-count" hidden></span>` : ""}</a>`).join("")}
          <div class="spacer"></div>
          <button id="alerts-btn" title="Son et notification à chaque nouvelle commande">🔕 Activer les alertes</button>
          <a href="./" target="_blank" rel="noopener">🛍️ Voir la boutique</a>
          <button id="logout">🚪 Déconnexion</button>
          <div class="who">${esc(session.user.email)}</div>
        </nav>
        <main class="main" id="main"><div class="loading-block"><div class="spinner dark" aria-hidden="true"></div><span>Chargement…</span></div></main>
      </div>`;
    $("#logout").addEventListener("click", async () => { await sb.auth.signOut(); });
    $("#alerts-btn").addEventListener("click", enableAlerts);
    drawAlertsBtn();
    startOrderWatch();
    autoEndFlash().catch(() => {}).finally(renderTab);
  }

  /* ---------- Alertes nouvelle commande ---------- */
  let lastOrderId;          // dernière commande connue (undefined = pas encore lue)
  let unseen = 0;
  let watchTimer = null;
  let audioCtx = null;
  const baseTitle = document.title;
  const alertsOn = () => { try { return localStorage.getItem("venips_alerts") === "1"; } catch { return false; } };

  function drawAlertsBtn() {
    const b = $("#alerts-btn");
    if (b) b.textContent = alertsOn() ? "🔔 Alertes activées" : "🔕 Activer les alertes";
  }

  async function enableAlerts() {
    const on = !alertsOn();
    try { localStorage.setItem("venips_alerts", on ? "1" : "0"); } catch { /* stockage indisponible */ }
    if (on) {
      try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); await audioCtx.resume(); } catch { /* pas de son */ }
      if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
      beep();
      toast(window.Notification && Notification.permission === "granted"
        ? "Alertes activées : son + notification à chaque nouvelle commande"
        : "Alertes activées (son). Autorisez les notifications du navigateur pour être prévenu aussi hors de l'onglet.");
    } else toast("Alertes désactivées");
    drawAlertsBtn();
  }

  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18, 0.36].forEach((t, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = [880, 1108, 1320][i];
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.16);
        o.connect(g).connect(audioCtx.destination);
        o.start(audioCtx.currentTime + t);
        o.stop(audioCtx.currentTime + t + 0.17);
      });
    } catch { /* pas de son */ }
  }

  async function checkNewOrders() {
    const { data, error } = await sb.from("orders").select("id,customer_name,total,created_at").order("created_at", { ascending: false }).limit(10);
    if (error || !data) return;
    const latest = data[0] ? data[0].id : null;
    if (lastOrderId === undefined) { lastOrderId = latest; return; }
    if (latest && latest !== lastOrderId) {
      const idx = data.findIndex((o) => o.id === lastOrderId);
      const fresh = idx === -1 ? data : data.slice(0, idx);
      lastOrderId = latest;
      unseen += fresh.length;
      document.title = `(${unseen}) Nouvelle commande – ${baseTitle}`;
      const o = fresh[0];
      toast(`🛒 Nouvelle commande ${o.id} – ${o.customer_name} – ${money(o.total)}`);
      if (alertsOn()) {
        beep();
        if ("Notification" in window && Notification.permission === "granted") {
          const n = new Notification(`🛒 Nouvelle commande ${S.name}`, { body: `${o.customer_name} – ${money(o.total)}`, tag: "venips-order", renotify: true });
          n.onclick = () => { window.focus(); location.hash = "#/commandes"; n.close(); };
        }
      }
      updateNewCount();
      if ((tab === "dashboard" || tab === "commandes") && !$(".modal-bg") && !$(".order-detail")) renderTab();
    }
  }

  function startOrderWatch() {
    clearInterval(watchTimer);
    checkNewOrders();
    watchTimer = setInterval(checkNewOrders, 20000);
  }

  // Revenir sur l'onglet efface le compteur du titre
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && unseen) { unseen = 0; document.title = baseTitle; }
  });

  function stopRefresh() { clearInterval(refreshTimer); refreshTimer = null; }

  async function updateNewCount() {
    const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "nouvelle");
    const el = $("#new-count");
    if (el) { el.hidden = !count; el.textContent = count || ""; }
    const [rq, rv] = await Promise.all([
      sb.from("requests").select("id", { count: "exact", head: true }).eq("status", "nouvelle").neq("type", "alerte"),
      sb.from("reviews").select("id", { count: "exact", head: true }).eq("status", "en_attente")
    ]);
    [["#req-count", rq.count], ["#rev-count", rv.count]].forEach(([sel, n]) => { const b = $(sel); if (b) { b.hidden = !n; b.textContent = n || ""; } });
  }

  async function renderTab() {
    stopRefresh();
    const main = $("#main");
    if (!main) return;
    $$(".side a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#/${tab}`));
    main.innerHTML = `<div class="loading-block"><div class="spinner dark" aria-hidden="true"></div><span>Chargement…</span></div>`;
    updateNewCount();
    try {
      if (tab === "dashboard") await tabDashboard(main);
      else if (tab === "commandes") await tabOrders(main);
      else if (tab === "produits") await tabProducts(main);
      else if (tab === "clients") await tabClients(main);
      else if (tab === "categories") await tabCrud(main, CRUD.categories);
      else if (tab === "livraison") await tabDelivery(main);
      else if (tab === "promos") await tabCrud(main, CRUD.promos);
      else if (tab === "demandes") await tabRequests(main);
      else if (tab === "stats") await tabStats(main);
      else if (tab === "avis") await tabReviews(main);
    } catch (e) { fail(e, "Chargement impossible"); }
    if (tab === "dashboard" || tab === "commandes") {
      refreshTimer = setInterval(() => { if (!$(".modal-bg") && !$(".order-detail")) renderTab(); }, 60000);
    }
  }

  /* ---------- Données ---------- */
  async function loadOrders(limit = 300) {
    const { data, error } = await sb.from("orders").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (cache.orders = data);
  }
  async function loadProducts() {
    const [p, c] = await Promise.all([
      sb.from("products").select("*").order("position").order("created_at"),
      sb.from("categories").select("*").order("position")
    ]);
    if (p.error) throw p.error;
    if (c.error) throw c.error;
    cache.categories = c.data;
    return (cache.products = p.data);
  }

  /* ---------- Tableau de bord ---------- */
  async function tabDashboard(main) {
    const [orders, products, rq, rv] = await Promise.all([loadOrders(500), loadProducts(),
      sb.from("requests").select("id", { count: "exact", head: true }).eq("status", "nouvelle").neq("type", "alerte"),
      sb.from("reviews").select("id", { count: "exact", head: true }).eq("status", "en_attente")]);
    const now = new Date();
    const today = now.toDateString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const valid = orders.filter((o) => o.status !== "annulee");
    const todayOrders = valid.filter((o) => new Date(o.created_at).toDateString() === today);
    const monthOrders = valid.filter((o) => new Date(o.created_at) >= monthStart);
    const newOnes = orders.filter((o) => o.status === "nouvelle");
    const low = products.filter((p) => p.active && p.stock <= 3).sort((a, b) => a.stock - b.stock);
    main.innerHTML = `
      <div class="main-head"><h1>Tableau de bord</h1><div class="actions"><button class="btn btn-outline btn-sm" id="refresh">↻ Actualiser</button></div></div>
      <div class="stats">
        <div class="stat ${newOnes.length ? "alert" : ""}"><small>Commandes à traiter</small><strong>${newOnes.length}</strong></div>
        <div class="stat"><small>Commandes aujourd'hui</small><strong>${todayOrders.length}</strong></div>
        <div class="stat"><small>Chiffre d'affaires du mois</small><strong>${money(monthOrders.reduce((s, o) => s + Number(o.total), 0))}</strong></div>
        <div class="stat ${low.length ? "alert" : ""}"><small>Produits en stock faible</small><strong>${low.length}</strong></div>
      </div>
      ${rq.count || rv.count ? `<div class="notice" style="margin-bottom:16px">${rq.count ? `📨 <a class="link" href="#/demandes"><b>${rq.count}</b> demande${rq.count > 1 ? "s" : ""} à traiter</a> (devis, réparation, reprise)` : ""}${rq.count && rv.count ? " · " : ""}${rv.count ? `⭐ <a class="link" href="#/avis"><b>${rv.count}</b> avis à vérifier</a>` : ""}</div>` : ""}
      <div class="two-cols">
        <div class="box"><h3>Dernières commandes</h3>
          ${orders.length ? `<div class="table-wrap" style="box-shadow:none"><table class="data"><tr><th>N°</th><th>Client</th><th>Total</th><th>Statut</th></tr>
            ${orders.slice(0, 8).map((o) => `<tr class="clickable" data-go="commandes"><td><b>${esc(o.id)}</b><br><small class="muted">${fmtDate(o.created_at)}</small></td><td>${esc(o.customer_name)}</td><td class="num">${money(o.total)}</td><td><span class="status ${o.status}">${STATUSES[o.status]}</span></td></tr>`).join("")}
          </table></div>` : `<p class="hint">Aucune commande pour le moment. Elles apparaîtront ici dès qu'un client commandera sur le site.</p>`}
        </div>
        <div class="box"><h3>Stock à surveiller</h3>
          ${low.length ? low.slice(0, 10).map((p) => `<div class="sum-row"><span>${esc(p.name)}</span><span class="${p.stock === 0 ? "stock-out" : "stock-low"}">${p.stock === 0 ? "Rupture" : p.stock + " restant" + (p.stock > 1 ? "s" : "")}</span></div>`).join("") : `<p class="hint">Tous les produits ont un stock suffisant 👍</p>`}
        </div>
      </div>`;
    $("#refresh").addEventListener("click", renderTab);
    $$("[data-go]").forEach((r) => r.addEventListener("click", () => { location.hash = `#/${r.dataset.go}`; }));
  }

  /* ---------- Statistiques ---------- */
  let statsPeriod = "30";
  async function tabStats(main) {
    const orders = await loadOrders(2000);
    const PERIODS = { "7": "7 derniers jours", "30": "30 derniers jours", "90": "3 derniers mois", "365": "12 derniers mois", "all": "Depuis le début" };
    main.innerHTML = `
      <div class="main-head"><h1>Statistiques</h1><div class="actions">
        <select id="st-period" class="btn btn-outline btn-sm">${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}" ${statsPeriod === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div></div>
      <div id="st-body"></div>`;
    $("#st-period").addEventListener("change", (e) => { statsPeriod = e.target.value; draw(); });
    const bars = (rows, fmt = money) => {
      const max = Math.max(1, ...rows.map((r) => r[1]));
      return rows.length ? rows.map(([label, v, extra]) => `<div class="hbar"><span class="hbar-l" title="${esc(label)}">${esc(label)}</span><span class="hbar-t"><i style="width:${Math.max(2, (v / max) * 100)}%"></i></span><b>${fmt(v)}</b>${extra ? `<small class="muted">${extra}</small>` : ""}</div>`).join("") : `<p class="hint">Pas encore de données.</p>`;
    };
    const draw = () => {
      const days = statsPeriod === "all" ? 100000 : Number(statsPeriod);
      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - days + 1);
      const inP = orders.filter((o) => new Date(o.created_at) >= from);
      const valid = inP.filter((o) => o.status !== "annulee");
      const delivered = inP.filter((o) => o.status === "livree");
      const sum = (l) => l.reduce((a, o) => a + Number(o.total), 0);
      const avg = valid.length ? sum(valid) / valid.length : 0;
      const cancelRate = inP.length ? Math.round((inP.filter((o) => o.status === "annulee").length / inP.length) * 100) : 0;
      // Courbe : par jour (≤ 31 jours) sinon par mois
      const byMonth = days > 31;
      const buckets = new Map();
      const first = statsPeriod === "all" && orders.length ? new Date(orders[orders.length - 1].created_at) : from;
      const cur = new Date(first); cur.setHours(0, 0, 0, 0); if (byMonth) cur.setDate(1);
      const end = new Date();
      while (cur <= end && buckets.size < 400) {
        buckets.set(byMonth ? `${cur.getFullYear()}-${cur.getMonth()}` : cur.toDateString(), { label: byMonth ? cur.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }) : cur.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), v: 0, n: 0 });
        if (byMonth) cur.setMonth(cur.getMonth() + 1); else cur.setDate(cur.getDate() + 1);
      }
      valid.forEach((o) => {
        const d = new Date(o.created_at);
        const b = buckets.get(byMonth ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString());
        if (b) { b.v += Number(o.total); b.n += 1; }
      });
      const series = [...buckets.values()];
      const maxV = Math.max(1, ...series.map((b) => b.v));
      const W = 720, H = 200, bw = W / Math.max(1, series.length);
      const every = Math.ceil(series.length / 12);
      const chart = `<svg viewBox="0 0 ${W} ${H + 24}" class="st-chart" role="img" aria-label="Chiffre d'affaires">
        ${[0.25, 0.5, 0.75, 1].map((f) => `<line x1="0" x2="${W}" y1="${H - f * H}" y2="${H - f * H}" class="grid"/>`).join("")}
        ${series.map((b, i) => `<rect x="${i * bw + bw * 0.15}" y="${H - (b.v / maxV) * H}" width="${bw * 0.7}" height="${Math.max(b.v ? 2 : 0, (b.v / maxV) * H)}" rx="3"><title>${b.label} : ${money(b.v)} (${b.n} commande${b.n > 1 ? "s" : ""})</title></rect>`).join("")}
        ${series.map((b, i) => (i % every === 0 ? `<text x="${i * bw + bw / 2}" y="${H + 16}" text-anchor="middle">${b.label}</text>` : "")).join("")}
      </svg>`;
      // Produits, zones, paiements
      const prod = new Map();
      valid.forEach((o) => (o.items || []).forEach((i) => {
        const k = i.name; const r = prod.get(k) || { q: 0, v: 0 };
        r.q += Number(i.qty); r.v += Number(i.price) * Number(i.qty); prod.set(k, r);
      }));
      const topProd = [...prod.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 10).map(([k, r]) => [k, r.v, `${r.q} vendu${r.q > 1 ? "s" : ""}`]);
      const group = (key) => { const m = new Map(); valid.forEach((o) => { const k = o[key] || "—"; const r = m.get(k) || { v: 0, n: 0 }; r.v += Number(o.total); r.n++; m.set(k, r); }); return [...m.entries()].sort((a, b) => b[1].v - a[1].v).map(([k, r]) => [k, r.v, `${r.n} cde${r.n > 1 ? "s" : ""}`]); };
      const phones = new Map(); valid.forEach((o) => phones.set(o.customer_phone, (phones.get(o.customer_phone) || 0) + 1));
      const returning = [...phones.values()].filter((n) => n > 1).length;
      const statusCount = Object.keys(STATUSES).map((k) => [STATUSES[k], inP.filter((o) => o.status === k).length]);
      $("#st-body").innerHTML = `
        <div class="stats">
          <div class="stat"><small>Chiffre d'affaires (hors annulées)</small><strong>${money(sum(valid))}</strong></div>
          <div class="stat"><small>Encaissé (livrées)</small><strong>${money(sum(delivered))}</strong></div>
          <div class="stat"><small>Commandes</small><strong>${valid.length}</strong></div>
          <div class="stat"><small>Panier moyen</small><strong>${money(avg)}</strong></div>
        </div>
        <div class="box" style="margin-bottom:16px"><h3>Chiffre d'affaires par ${byMonth ? "mois" : "jour"}</h3>${valid.length ? chart : `<p class="hint">Aucune commande sur cette période.</p>`}</div>
        <div class="two-cols">
          <div class="box"><h3>Produits les plus vendus</h3>${bars(topProd)}</div>
          <div class="box"><h3>Clients</h3>
            <div class="sum-row"><span>Clients différents</span><b>${phones.size}</b></div>
            <div class="sum-row"><span>Clients revenus commander</span><b>${returning}${phones.size ? ` (${Math.round((returning / phones.size) * 100)} %)` : ""}</b></div>
            <div class="sum-row"><span>Taux d'annulation</span><b>${cancelRate} %</b></div>
            <h3 style="margin-top:18px">Commandes par statut</h3>${bars(statusCount, (n) => String(n))}
          </div>
          <div class="box"><h3>Ventes par zone de livraison</h3>${bars(group("zone_name"))}</div>
          <div class="box"><h3>Moyens de paiement</h3>${bars(group("payment"))}</div>
        </div>`;
    };
    draw();
  }

  /* ---------- Commandes ---------- */
  let orderFilter = { status: "", q: "" };
  async function tabOrders(main) {
    await loadOrders();
    main.innerHTML = `
      <div class="main-head"><h1>Commandes</h1><div class="actions"><button class="btn btn-outline btn-sm" id="export-csv">⬇︎ Export Excel</button><button class="btn btn-outline btn-sm" id="refresh">↻ Actualiser</button></div></div>
      <div class="toolbar-admin">
        <input type="search" id="o-q" placeholder="Rechercher n°, nom, téléphone…" value="${esc(orderFilter.q)}">
        <select id="o-status"><option value="">Tous les statuts</option>${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${orderFilter.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div class="table-wrap" id="orders-table"></div>`;
    $("#refresh").addEventListener("click", renderTab);
    $("#o-q").addEventListener("input", (e) => { orderFilter.q = e.target.value; drawOrders(); });
    $("#o-status").addEventListener("change", (e) => { orderFilter.status = e.target.value; drawOrders(); });
    $("#export-csv").addEventListener("click", exportOrdersCSV);
    drawOrders();
  }

  // Liste filtrée (mêmes filtres que le tableau)
  function filteredOrders() {
    const q = orderFilter.q.trim().toLowerCase();
    return cache.orders.filter((o) => (!orderFilter.status || o.status === orderFilter.status)
      && (!q || `${o.id} ${o.customer_name} ${o.customer_phone} ${o.zone_name}`.toLowerCase().includes(q)));
  }

  // Export CSV lisible par Excel (séparateur « ; », accents conservés)
  function exportOrdersCSV() {
    const list = filteredOrders();
    if (!list.length) return toast("Aucune commande à exporter", true);
    const cell = (v) => { const t = String(v ?? ""); return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const head = ["N°", "Date", "Statut", "Client", "Téléphone", "Email", "Zone", "Adresse", "Paiement", "Articles", "Quantité", "Sous-total", "Réduction", "Code promo", "Livraison", "Total", "Note interne"];
    const rows = list.map((o) => [
      o.id, new Date(o.created_at).toLocaleString("fr-FR"), STATUSES[o.status] || o.status, o.customer_name, o.customer_phone, o.customer_email, o.zone_name, o.address, o.payment,
      (o.items || []).map((i) => `${i.qty} x ${i.name}`).join(" | "), (o.items || []).reduce((a, i) => a + Number(i.qty), 0),
      Math.round(o.subtotal), Math.round(o.reduction || 0), o.promo_code || "", Math.round(o.delivery), Math.round(o.total), o.admin_note || ""
    ]);
    const csv = "\ufeff" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `commandes-venips-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`${list.length} commande${list.length > 1 ? "s" : ""} exportée${list.length > 1 ? "s" : ""}`);
  }

  function drawOrders() {
    const q = orderFilter.q.trim().toLowerCase();
    const list = filteredOrders();
    const wrap = $("#orders-table");
    if (!list.length) { wrap.innerHTML = `<p class="hint" style="padding:20px">Aucune commande${q || orderFilter.status ? " ne correspond à ces filtres" : " pour le moment"}.</p>`; return; }
    wrap.innerHTML = `<table class="data">
      <tr><th>N°</th><th>Date</th><th>Client</th><th>Zone</th><th>Paiement</th><th style="text-align:right">Total</th><th>Statut</th></tr>
      ${list.map((o) => `
        <tr class="clickable" data-order="${esc(o.id)}">
          <td><b>${esc(o.id)}</b></td><td>${fmtDate(o.created_at)}</td>
          <td>${esc(o.customer_name)}<br><small class="muted">${esc(o.customer_phone)}</small></td>
          <td>${esc(o.zone_name)}</td><td>${esc(o.payment)}</td>
          <td class="num"><b>${money(o.total)}</b></td>
          <td><span class="status ${o.status}">${STATUSES[o.status]}</span></td>
        </tr>`).join("")}
    </table>`;
    $$("[data-order]", wrap).forEach((tr) => tr.addEventListener("click", () => toggleOrder(tr)));
  }

  function toggleOrder(tr) {
    const next = tr.nextElementSibling;
    if (next && next.classList.contains("order-detail")) { next.remove(); return; }
    $$(".order-detail").forEach((d) => d.remove());
    const o = cache.orders.find((x) => x.id === tr.dataset.order);
    const phone = o.customer_phone.replace(/\D/g, "");
    const waUrl = (st) => `https://wa.me/${phone}?text=${encodeURIComponent(waTemplate(o, st))}`;
    const row = document.createElement("tr");
    row.className = "order-detail";
    row.innerHTML = `<td colspan="7"><div class="order-grid">
      <div>
        <h4>Articles</h4>
        ${o.items.map((i) => `<div class="sum-row"><span>${i.qty} × ${esc(i.name)}</span><span>${money(i.price * i.qty)}</span></div>`).join("")}
        <div class="sum-row"><span>Sous-total</span><span>${money(o.subtotal)}</span></div>
        ${Number(o.reduction) ? `<div class="sum-row"><span>Code ${esc(o.promo_code)}</span><span>-${money(o.reduction)}</span></div>` : ""}
        <div class="sum-row"><span>Livraison</span><span>${Number(o.delivery) ? money(o.delivery) : "Gratuite"}</span></div>
        <div class="sum-row total"><span>Total</span><span>${money(o.total)}</span></div>
      </div>
      <div>
        <h4>Client</h4>
        <p><b>${esc(o.customer_name)}</b> <small class="muted">${o.user_id ? "· compte client" : "· sans compte"}</small></p>
        <p>📞 <a class="link" href="tel:${esc(o.customer_phone.replace(/\s/g, ""))}">${esc(o.customer_phone)}</a></p>
        ${o.customer_email ? `<p>✉️ ${esc(o.customer_email)}</p>` : ""}
        <p>📍 ${esc(o.address)} (${esc(o.zone_name)})</p>
        ${o.notes ? `<p>📝 ${esc(o.notes)}</p>` : ""}
        <p>💳 ${esc(o.payment)}</p>
        <h4 style="margin-top:14px">Statut</h4>
        <select id="d-status" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;margin-bottom:10px">${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <h4>Note interne</h4>
        <textarea id="d-note" placeholder="Visible uniquement par l'équipe">${esc(o.admin_note || "")}</textarea>
        <div class="row-actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="d-save">Enregistrer</button>
          <a class="btn btn-wa btn-sm" id="d-wa" target="_blank" rel="noopener" href="${waUrl(o.status)}">WhatsApp : message « ${STATUSES[o.status]} »</a>
          <button class="btn btn-outline btn-sm" id="d-invoice">🧾 ${o.status === "livree" ? "Facture" : "Bon de commande"}</button>
        </div>
        <p class="hint" style="margin:6px 0 0">Le message WhatsApp s'adapte au statut choisi ci-dessus.</p>
        ${o.gestion_vente_ids && o.gestion_vente_ids.length
          ? `<p class="notice" style="margin-top:10px">✓ Vente enregistrée dans votre logiciel de gestion (vendeur « SITE WEB »).</p>`
          : `<p class="hint" style="margin-top:8px">En passant en « Livrée », la vente est enregistrée automatiquement dans votre logiciel de gestion (vendeur « SITE WEB »).</p>`}
        ${o.status !== "annulee" ? `<p class="hint" style="margin-top:4px">Passer en « Annulée » remet automatiquement les articles en stock${o.status === "livree" ? " et retire la vente du logiciel de gestion" : ""}.</p>` : ""}
      </div>
    </div></td>`;
    tr.after(row);
    $("#d-status", row).addEventListener("change", (e) => {
      const a = $("#d-wa", row);
      a.href = waUrl(e.target.value);
      a.textContent = `WhatsApp : message « ${STATUSES[e.target.value]} »`;
    });
    $("#d-invoice", row).addEventListener("click", () => window.VenipsInvoice && window.VenipsInvoice.open(o));
    $("#d-save", row).addEventListener("click", async () => {
      const status = $("#d-status", row).value, admin_note = $("#d-note", row).value.trim() || null;
      const { data, error } = await sb.from("orders").update({ status, admin_note }).eq("id", o.id).select().single();
      if (error) return fail(error);
      const { data: fresh } = await sb.from("orders").select("*").eq("id", o.id).single();
      Object.assign(o, fresh || data);
      toast(`Commande ${o.id} : ${STATUSES[status]}${status === "livree" && o.gestion_vente_ids && o.gestion_vente_ids.length ? " — vente enregistrée dans le logiciel de gestion" : ""}`);
      drawOrders();
      updateNewCount();
    });
  }

  // Messages WhatsApp prêts à envoyer, selon l'étape de la commande
  function waTemplate(o, st) {
    const first = String(o.customer_name || "").split(" ")[0];
    const items = (o.items || []).map((i) => `• ${i.qty} × ${i.name}`).join("\n");
    const pay = /orange|mtn|momo|mobile/i.test(o.payment || "") ? `\nPaiement : ${o.payment}${S.orangeMoneyNumber && /orange/i.test(o.payment) ? ` au ${S.orangeMoneyNumber}` : ""}${S.mtnMoneyNumber && /mtn|momo/i.test(o.payment) ? ` au ${S.mtnMoneyNumber}` : ""}. Merci d'indiquer « ${o.id} » en motif.` : `\nPaiement : ${o.payment || "à la livraison"}.`;
    switch (st) {
      case "nouvelle": return `Bonjour ${first}, c'est ${S.name} 👋\nNous avons bien reçu votre commande ${o.id} :\n${items}\nTotal : ${money(o.total)}.\nNous vous recontactons très vite pour confirmer la livraison.`;
      case "confirmee": return `Bonjour ${first}, votre commande ${o.id} est confirmée ✅\n${items}\nTotal : ${money(o.total)}.${pay}\nLivraison prévue : ${o.zone_name || "Conakry"}. Nous vous appelons avant de passer.`;
      case "en_livraison": return `Bonjour ${first}, votre commande ${o.id} est en route 🚚\nNotre livreur vous appelle au ${o.customer_phone} dès qu'il arrive à : ${o.address}.\nMontant à prévoir : ${money(o.total)}.`;
      case "livree": return `Bonjour ${first}, merci pour votre achat chez ${S.name} 🙏\nVotre commande ${o.id} est livrée. Votre facture est disponible dans « Mon compte » sur ${location.host}.\nSatisfait ? Laissez-nous un avis sur le produit, cela nous aide beaucoup. Pour toute question ou garantie, écrivez-nous ici.`;
      case "annulee": return `Bonjour ${first}, votre commande ${o.id} a été annulée. Si c'est une erreur ou si vous souhaitez un autre produit, répondez à ce message : nous sommes là pour vous aider.`;
      default: return `Bonjour ${first}, c'est ${S.name}. À propos de votre commande ${o.id}…`;
    }
  }

  /* ---------- Demandes : devis, réparation, reprise, alertes de retour en stock ---------- */
  const REQ_TYPES = { devis: "🏢 Devis entreprise", reparation: "🔧 Réparation", reprise: "♻️ Reprise", alerte: "🔔 Alerte stock" };
  const REQ_STATUS = { nouvelle: "Nouvelle", en_cours: "En cours", traitee: "Traitée", annulee: "Annulée" };
  let reqFilter = { type: "", status: "nouvelle" };
  let reqCache = [];
  async function tabRequests(main) {
    const [{ data, error }] = await Promise.all([
      sb.from("requests").select("*").order("created_at", { ascending: false }).limit(500),
      cache.products.length ? Promise.resolve() : loadProducts()
    ]);
    if (error) throw error;
    reqCache = data;
    const count = (t) => data.filter((r) => r.type === t && r.status === "nouvelle").length;
    main.innerHTML = `
      <div class="main-head"><h1>Demandes</h1><div class="actions"><button class="btn btn-outline btn-sm" id="refresh">↻ Actualiser</button></div></div>
      <div class="toolbar-admin">
        <select id="r-type"><option value="">Tous les types</option>${Object.entries(REQ_TYPES).map(([k, v]) => `<option value="${k}" ${reqFilter.type === k ? "selected" : ""}>${v}${count(k) ? ` (${count(k)})` : ""}</option>`).join("")}</select>
        <select id="r-status"><option value="">Tous les statuts</option>${Object.entries(REQ_STATUS).map(([k, v]) => `<option value="${k}" ${reqFilter.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div id="req-list"></div>`;
    $("#refresh").addEventListener("click", renderTab);
    $("#r-type").addEventListener("change", (e) => { reqFilter.type = e.target.value; drawRequests(); });
    $("#r-status").addEventListener("change", (e) => { reqFilter.status = e.target.value; drawRequests(); });
    drawRequests();
  }
  function drawRequests() {
    const wrap = $("#req-list");
    const list = reqCache.filter((r) => (!reqFilter.type || r.type === reqFilter.type) && (!reqFilter.status || r.status === reqFilter.status));
    if (!list.length) { wrap.innerHTML = `<div class="box"><p class="hint" style="margin:0">Aucune demande${reqFilter.type || reqFilter.status ? " avec ces filtres" : ""}. Les demandes de devis, réparation, reprise et les alertes « retour en stock » arrivent ici.</p></div>`; return; }
    const prod = (id) => cache.products.find((p) => p.id === id);
    wrap.innerHTML = list.map((r) => {
      const p = r.product_id ? prod(r.product_id) : null;
      const phone = String(r.phone || "").replace(/\D/g, "");
      const first = String(r.name || "").split(" ")[0];
      const back = p && p.active && p.stock > 0;
      const msg = r.type === "alerte"
        ? `Bonjour ${first}, bonne nouvelle : « ${p ? p.name : "le produit"} » est de nouveau disponible chez ${S.name} ! ${p ? `${money(p.price)} — ${location.origin}/#/produit/${p.id}` : ""}`
        : `Bonjour ${first}, c'est ${S.name}. Nous avons bien reçu votre demande D-${r.id} (${(REQ_TYPES[r.type] || "").replace(/^\S+\s/, "").toLowerCase()}).`;
      return `<div class="box req" data-req="${r.id}">
        <div class="req-head"><b>${REQ_TYPES[r.type] || r.type}</b><span class="muted">D-${r.id} · ${fmtDate(r.created_at)}</span><span class="status req-${r.status}">${REQ_STATUS[r.status]}</span></div>
        <p style="margin:6px 0"><b>${esc(r.name)}</b> · <a class="link" href="tel:${esc(String(r.phone).replace(/\s/g, ""))}">${esc(r.phone)}</a>${r.email ? ` · ${esc(r.email)}` : ""}${r.user_id ? ` <small class="muted">· compte client</small>` : ""}</p>
        ${p ? `<p style="margin:6px 0">Produit : <b>${esc(p.name)}</b> ${back ? `<span class="stock-ok">✓ de nouveau en stock (${p.stock})</span>` : `<span class="stock-out">toujours épuisé</span>`}</p>` : ""}
        ${r.details && Object.keys(r.details).length ? `<div class="req-details">${Object.entries(r.details).map(([k, v]) => `<div><small>${esc(k)}</small><span>${esc(v)}</span></div>`).join("")}</div>` : ""}
        ${r.message ? `<p class="req-msg">${esc(r.message)}</p>` : ""}
        <div class="req-actions">
          <select data-rstatus>${Object.entries(REQ_STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
          <input data-rnote placeholder="Note interne" value="${esc(r.admin_note || "")}">
          <button class="btn btn-primary btn-sm" data-rsave>Enregistrer</button>
          <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}">${r.type === "alerte" ? "Prévenir sur WhatsApp" : "Répondre sur WhatsApp"}</a>
        </div>
      </div>`;
    }).join("");
    $$("[data-rsave]", wrap).forEach((b) => b.addEventListener("click", async () => {
      const box = b.closest("[data-req]");
      const id = Number(box.dataset.req);
      const status = $("[data-rstatus]", box).value, admin_note = $("[data-rnote]", box).value.trim() || null;
      const { error } = await sb.from("requests").update({ status, admin_note }).eq("id", id);
      if (error) return fail(error);
      Object.assign(reqCache.find((r) => r.id === id), { status, admin_note });
      toast(`Demande D-${id} : ${REQ_STATUS[status]}`);
      drawRequests();
      updateNewCount();
    }));
  }

  /* ---------- Avis clients (modération) ---------- */
  let revFilter = "en_attente";
  async function tabReviews(main) {
    const [{ data, error }] = await Promise.all([
      sb.from("reviews").select("*").order("created_at", { ascending: false }).limit(500),
      cache.products.length ? Promise.resolve() : loadProducts()
    ]);
    if (error) throw error;
    const LABEL = { en_attente: "À vérifier", publie: "Publiés", refuse: "Refusés" };
    main.innerHTML = `
      <div class="main-head"><h1>Avis clients</h1></div>
      <div class="toolbar-admin"><select id="v-status">${Object.entries(LABEL).map(([k, v]) => `<option value="${k}" ${revFilter === k ? "selected" : ""}>${v} (${data.filter((r) => r.status === k).length})</option>`).join("")}</select></div>
      <p class="hint" style="margin-top:0">Seuls les clients ayant reçu le produit (commande « Livrée ») peuvent laisser un avis. Un avis n'apparaît sur la boutique qu'après publication.</p>
      <div id="rev-list"></div>`;
    const draw = () => {
      const list = data.filter((r) => r.status === revFilter);
      const name = (id) => (cache.products.find((p) => p.id === id) || {}).name || id;
      $("#rev-list").innerHTML = list.length ? list.map((r) => `<div class="box req" data-rev="${r.id}">
        <div class="req-head"><b style="color:#f59e0b">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</b><span>${esc(r.author)}</span><span class="muted">${fmtDate(r.created_at)}</span></div>
        <p style="margin:6px 0"><small class="muted">Produit :</small> <a class="link" href="./#/produit/${esc(r.product_id)}" target="_blank" rel="noopener">${esc(name(r.product_id))}</a></p>
        ${r.comment ? `<p class="req-msg">${esc(r.comment)}</p>` : `<p class="hint">(note sans commentaire)</p>`}
        <div class="req-actions">
          ${r.status !== "publie" ? `<button class="btn btn-primary btn-sm" data-vset="publie">✓ Publier</button>` : ""}
          ${r.status !== "refuse" ? `<button class="btn btn-outline btn-sm" data-vset="refuse">Refuser</button>` : ""}
          <button class="btn btn-outline btn-sm" data-vdel style="color:#b91c1c">Supprimer</button>
        </div></div>`).join("") : `<div class="box"><p class="hint" style="margin:0">Aucun avis ici.</p></div>`;
      $$("[data-vset]").forEach((b) => b.addEventListener("click", async () => {
        const id = b.closest("[data-rev]").dataset.rev, status = b.dataset.vset;
        const { error: e } = await sb.from("reviews").update({ status }).eq("id", id);
        if (e) return fail(e);
        data.find((r) => String(r.id) === id).status = status;
        toast(status === "publie" ? "Avis publié sur la boutique" : "Avis refusé");
        draw(); updateNewCount();
      }));
      $$("[data-vdel]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("Supprimer définitivement cet avis ?")) return;
        const id = b.closest("[data-rev]").dataset.rev;
        const { error: e } = await sb.from("reviews").delete().eq("id", id);
        if (e) return fail(e);
        data.splice(data.findIndex((r) => String(r.id) === id), 1);
        toast("Avis supprimé");
        draw(); updateNewCount();
      }));
    };
    $("#v-status").addEventListener("change", (e) => { revFilter = e.target.value; draw(); });
    draw();
  }

  /* ---------- Vente flash ---------- */
  const FLASH = "Vente flash";
  async function getFlashUntil() {
    const { data } = await sb.from("shop_settings").select("value").eq("key", "flash_until").maybeSingle();
    return data ? (Number(data.value) || 0) * 1000 : 0;
  }
  // Remet les prix d'origine des produits en vente flash
  async function endFlash(silent) {
    const list = cache.products.length ? cache.products : await loadProducts();
    const flash = list.filter((p) => p.badge === FLASH && Number(p.old_price) > 0);
    for (const p of flash) {
      const row = { price: Number(p.old_price), old_price: null, badge: null };
      const { error } = await sb.from("products").update(row).eq("id", p.id);
      if (error) return fail(error);
      Object.assign(p, row);
    }
    await sb.from("shop_settings").upsert({ key: "flash_until", value: 0 });
    if (!silent || flash.length) toast(`Vente flash terminée : ${flash.length} prix remis comme avant`);
    if (tab === "produits") { drawFlashInfo(); drawProducts(); }
  }
  // À l'ouverture de l'admin : si la vente flash est finie, on remet les prix
  async function autoEndFlash() {
    const until = await getFlashUntil();
    if (until && until < Date.now()) await endFlash(true);
  }
  async function drawFlashInfo() {
    const box = $("#flash-info");
    if (!box) return;
    const until = await getFlashUntil();
    const n = cache.products.filter((p) => p.badge === FLASH).length;
    box.innerHTML = until > Date.now() && n
      ? `<div class="notice" style="margin-bottom:14px">⚡ <b>Vente flash en cours</b> sur ${n} produit${n > 1 ? "s" : ""}, jusqu'au ${new Date(until).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. Les prix d'origine seront remis automatiquement à la fin. <button class="btn btn-outline btn-sm" id="flash-end" style="margin-left:8px">Arrêter maintenant</button></div>`
      : "";
    const b = $("#flash-end");
    if (b) b.addEventListener("click", () => { if (confirm("Arrêter la vente flash et remettre les prix d'origine ?")) endFlash(); });
  }
  async function flashForm() {
    const until = await getFlashUntil();
    const live = until > Date.now();
    const def = new Date(live ? until : Date.now() + 48 * 3600000);
    const local = new Date(def.getTime() - def.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const list = cache.products.filter((p) => p.active && p.stock > 0);
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<form class="modal" id="flash-form" novalidate>
      <div class="modal-head"><h2>⚡ Vente flash</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button></div>
      <div class="modal-body">
        <p class="hint" style="margin-top:0">Cochez les produits et indiquez leur prix flash. Le site affiche un compte à rebours et les prix d'origine sont remis automatiquement à la fin.</p>
        <div class="field"><label for="fl-end">Fin de la vente flash</label><input id="fl-end" type="datetime-local" value="${local}" required></div>
        <div class="field" style="margin-top:10px"><label>Réduction rapide</label><div class="toolbar-admin" style="margin:0"><button type="button" class="btn btn-outline btn-sm" data-pct="5">-5 %</button><button type="button" class="btn btn-outline btn-sm" data-pct="10">-10 %</button><button type="button" class="btn btn-outline btn-sm" data-pct="15">-15 %</button><small class="hint" style="align-self:center">appliquée aux produits cochés</small></div></div>
        <input type="search" id="fl-q" placeholder="Filtrer les produits…" style="width:100%;margin:12px 0 6px;padding:9px 12px;border:1px solid var(--line);border-radius:10px">
        <div class="flash-list">${list.map((p) => {
          const on = p.badge === FLASH;
          const base = on && p.old_price ? Number(p.old_price) : Number(p.price);
          return `<label class="flash-row" data-name="${esc((p.name + " " + p.brand).toLowerCase())}">
            <input type="checkbox" data-fid="${esc(p.id)}" ${on ? "checked" : ""}>
            <span class="fr-name">${esc(p.name)}<small class="muted">Prix normal : ${money(base)}</small></span>
            <input type="number" min="0" step="1000" data-fprice="${esc(p.id)}" data-base="${base}" value="${on ? Number(p.price) : ""}" placeholder="Prix flash">
          </label>`;
        }).join("")}</div>
      </div>
      <div class="modal-foot">${live ? `<button type="button" class="btn btn-outline" id="fl-stop" style="margin-right:auto">Arrêter la vente</button>` : ""}<button type="button" class="btn btn-outline" data-close>Annuler</button><button class="btn btn-primary" id="fl-save">Lancer la vente flash</button></div>
    </form>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    $$("[data-close]", bg).forEach((b) => b.addEventListener("click", close));
    bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
    $("#fl-q", bg).addEventListener("input", (e) => { const q = e.target.value.toLowerCase(); $$(".flash-row", bg).forEach((r) => { r.hidden = q && !r.dataset.name.includes(q); }); });
    $$("[data-pct]", bg).forEach((b) => b.addEventListener("click", () => {
      $$("[data-fid]:checked", bg).forEach((c) => { const i = $(`[data-fprice="${CSS.escape(c.dataset.fid)}"]`, bg); i.value = Math.round((Number(i.dataset.base) * (1 - Number(b.dataset.pct) / 100)) / 1000) * 1000; });
    }));
    $$("[data-fprice]", bg).forEach((i) => i.addEventListener("input", () => { if (i.value) $(`[data-fid="${CSS.escape(i.dataset.fprice)}"]`, bg).checked = true; }));
    const stop = $("#fl-stop", bg);
    if (stop) stop.addEventListener("click", async () => { close(); await endFlash(); });
    $("#flash-form", bg).addEventListener("submit", async (e) => {
      e.preventDefault();
      const end = new Date($("#fl-end", bg).value).getTime();
      if (!(end > Date.now() + 60000)) return toast("Choisissez une date de fin dans le futur", true);
      const chosen = $$("[data-fid]", bg).map((c) => {
        const p = cache.products.find((x) => x.id === c.dataset.fid);
        const i = $(`[data-fprice="${CSS.escape(c.dataset.fid)}"]`, bg);
        return { p, on: c.checked, base: Number(i.dataset.base), price: parseInt(i.value, 10) };
      });
      const bad = chosen.find((x) => x.on && !(x.price > 0 && x.price < x.base));
      if (bad) return toast(`Prix flash invalide pour « ${bad.p.name} » (il doit être inférieur au prix normal)`, true);
      if (!chosen.some((x) => x.on)) return toast("Cochez au moins un produit", true);
      const btn = $("#fl-save", bg); btn.disabled = true; btn.textContent = "Enregistrement…";
      for (const x of chosen) {
        const wasFlash = x.p.badge === FLASH;
        let row = null;
        if (x.on) row = { price: x.price, old_price: x.base, badge: FLASH };
        else if (wasFlash) row = { price: x.base, old_price: null, badge: null };
        if (!row) continue;
        const { error } = await sb.from("products").update(row).eq("id", x.p.id);
        if (error) { btn.disabled = false; btn.textContent = "Lancer la vente flash"; return fail(error); }
        Object.assign(x.p, row);
      }
      const { error } = await sb.from("shop_settings").upsert({ key: "flash_until", value: Math.round(end / 1000) });
      if (error) return fail(error);
      close();
      toast(`⚡ Vente flash lancée sur ${chosen.filter((x) => x.on).length} produit(s)`);
      drawFlashInfo();
      drawProducts();
    });
  }

  /* ---------- Produits ---------- */
  let productQ = "";
  let waiting = {};   // produit -> nombre de clients qui attendent le retour en stock
  async function tabProducts(main) {
    const [, al] = await Promise.all([loadProducts(), sb.from("requests").select("product_id").eq("type", "alerte").eq("status", "nouvelle")]);
    waiting = {};
    ((al && al.data) || []).forEach((r) => { waiting[r.product_id] = (waiting[r.product_id] || 0) + 1; });
    main.innerHTML = `
      <div class="main-head"><h1>Produits</h1><div class="actions"><button class="btn btn-outline btn-sm" id="p-flash">⚡ Vente flash</button><button class="btn btn-primary btn-sm" id="p-new">+ Nouveau produit</button></div></div>
      <div id="flash-info"></div>
      <div class="toolbar-admin">
        <input type="search" id="p-q" placeholder="Rechercher un produit, une marque…" value="${esc(productQ)}">
        <select id="p-cat"><option value="">Toutes les catégories</option>${cache.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>
      </div>
      <div class="table-wrap" id="products-table"></div>`;
    $("#p-new").addEventListener("click", () => productForm(null));
    $("#p-flash").addEventListener("click", flashForm);
    drawFlashInfo();
    $("#p-q").addEventListener("input", (e) => { productQ = e.target.value; drawProducts(); });
    $("#p-cat").addEventListener("change", drawProducts);
    drawProducts();
  }

  function drawProducts() {
    const q = productQ.trim().toLowerCase(), cat = $("#p-cat").value;
    const catName = (id) => (cache.categories.find((c) => c.id === id) || {}).name || id;
    const list = cache.products.filter((p) => (!cat || p.category_id === cat) && (!q || `${p.name} ${p.brand}`.toLowerCase().includes(q)));
    const wrap = $("#products-table");
    if (!list.length) { wrap.innerHTML = `<p class="hint" style="padding:20px">Aucun produit.</p>`; return; }
    wrap.innerHTML = `<table class="data">
      <tr><th></th><th>Produit</th><th>Catégorie</th><th style="text-align:right">Prix</th><th>Stock</th><th>En ligne</th><th></th></tr>
      ${list.map((p) => `<tr data-id="${esc(p.id)}">
        <td><div class="thumb-sm">${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "📦"}</div></td>
        <td><b>${esc(p.name)}</b><br><small class="muted">${esc(p.brand)}${p.featured ? " · ⭐ vedette" : ""}${p.badge ? ` · ${esc(p.badge)}` : ""}${p.source_id ? " · 🔄 stock synchronisé" : ""}${p.auto_hidden ? " · ⛔ masqué : stock épuisé (réapparaîtra au réassort)" : !p.active ? " · masqué manuellement" : ""}${p.images && p.images.length ? ` · 🖼️ ${p.images.length + 1} images` : ""}${waiting[p.id] ? ` · <a class="link" href="#/demandes" title="Voir les demandes">🔔 ${waiting[p.id]} client${waiting[p.id] > 1 ? "s" : ""} attend${waiting[p.id] > 1 ? "ent" : ""} le retour</a>` : ""}</small></td>
        <td>${esc(catName(p.category_id))}</td>
        <td style="width:150px"><input type="number" min="0" step="1000" value="${p.price}" data-price aria-label="Prix de vente">${p.old_price ? `<small class="muted"><s>${money(p.old_price)}</s></small>` : ""}</td>
        <td style="width:110px"><input type="number" min="0" value="${p.stock}" data-stock class="${p.stock === 0 ? "stock-out" : p.stock <= 3 ? "stock-low" : ""}" aria-label="Stock" title="${p.source_id ? "Mis à jour automatiquement par le logiciel de gestion" : ""}"></td>
        <td><label class="check" title="${p.stock <= 0 ? "Stock épuisé : le produit est masqué automatiquement" : ""}"><input type="checkbox" data-active ${p.active ? "checked" : ""}></label></td>
        <td><div class="row-actions"><button class="btn btn-outline btn-sm" data-edit>Modifier</button><button class="btn btn-danger btn-sm" data-del>Supprimer</button></div></td>
      </tr>`).join("")}
    </table>`;
    $$("tr[data-id]", wrap).forEach((tr) => {
      const p = cache.products.find((x) => x.id === tr.dataset.id);
      $("[data-edit]", tr).addEventListener("click", () => productForm(p));
      $("[data-del]", tr).addEventListener("click", async () => {
        if (!confirm(`Supprimer définitivement « ${p.name} » ?\n\nAstuce : décochez plutôt « En ligne » pour le masquer sans le perdre.`)) return;
        const { error } = await sb.from("products").delete().eq("id", p.id);
        if (error) return fail(error);
        cache.products = cache.products.filter((x) => x.id !== p.id);
        toast("Produit supprimé");
        drawProducts();
      });
      $("[data-price]", tr).addEventListener("change", async (e) => {
        const price = Math.max(0, parseInt(e.target.value, 10) || 0);
        const { error } = await sb.from("products").update({ price }).eq("id", p.id);
        if (error) { e.target.value = p.price; return fail(error); }
        p.price = price;
        toast(`Prix de « ${p.name} » : ${money(price)}`);
      });
      $("[data-stock]", tr).addEventListener("change", async (e) => {
        const stock = Math.max(0, parseInt(e.target.value, 10) || 0);
        const { error } = await sb.from("products").update({ stock }).eq("id", p.id);
        if (error) return fail(error);
        const { data: fresh } = await sb.from("products").select("*").eq("id", p.id).single();
        Object.assign(p, fresh || { stock });
        toast(`Stock de « ${p.name} » : ${stock}${p.auto_hidden ? " — produit masqué (stock épuisé)" : ""}`);
        drawProducts();
      });
      $("[data-active]", tr).addEventListener("change", async (e) => {
        const { error } = await sb.from("products").update({ active: e.target.checked }).eq("id", p.id);
        if (error) { e.target.checked = !e.target.checked; return fail(error); }
        const { data: fresh } = await sb.from("products").select("*").eq("id", p.id).single();
        Object.assign(p, fresh || { active: e.target.checked });
        toast(p.active ? "Produit visible sur le site" : p.stock <= 0 ? "Stock épuisé : le produit reste masqué tant qu'il n'y a pas de stock" : "Produit masqué du site");
        drawProducts();
      });
    });
  }

  // Accepte un lien direct, un lien Google Images (imgres?imgurl=…) ou un lien de partage Google Drive
  function normalizeImageUrl(raw) {
    const u = String(raw || "").trim();
    if (!u) return "";
    let url;
    try { url = new URL(u); } catch { return ""; }
    if (!/^https?:$/.test(url.protocol)) return "";
    const imgurl = url.searchParams.get("imgurl");
    if (/(^|\.)google\.[a-z.]+$/.test(url.hostname) && imgurl) return normalizeImageUrl(imgurl);
    const drive = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/);
    if (drive) return `https://lh3.googleusercontent.com/d/${drive[1]}=w1200`;
    return url.href;
  }
  function imageLinks(text) {
    return [...new Set(String(text).split(/[\s,]+/).map(normalizeImageUrl).filter(Boolean))].slice(0, 10);
  }

  const COND_KEYS = ["État", "Batterie", "Autonomie"];
  const GRADES = ["Neuf", "Reconditionné Grade A", "Reconditionné Grade B", "Reconditionné Grade C", "Occasion"];
  function specsToText(specs) { return Object.entries(specs || {}).filter(([k]) => !COND_KEYS.includes(k)).map(([k, v]) => `${k} : ${v}`).join("\n"); }
  function withCondition(specs, f) {
    COND_KEYS.forEach((k) => delete specs[k]);
    if (f.etat.value) specs["État"] = f.etat.value;
    const b = parseInt(f.batt.value, 10);
    if (b >= 1 && b <= 100) specs["Batterie"] = `${b} %`;
    if (f.autonomie.value.trim()) specs["Autonomie"] = f.autonomie.value.trim();
    return specs;
  }
  function textToSpecs(text) {
    const out = {};
    text.split("\n").forEach((line) => {
      const i = line.indexOf(":");
      if (i > 0) { const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim(); if (k && v) out[k] = v; }
    });
    return out;
  }

  function productForm(p) {
    const isNew = !p;
    p = p || { id: "", name: "", brand: "", category_id: (cache.categories[0] || {}).id, price: "", old_price: "", stock: 1, featured: false, active: true, badge: "", description: "", specs: { Garantie: "12 mois" }, color: "#0f014c", image_url: "", position: cache.products.length + 1 };
    const allImages = [p.image_url, ...(p.images || [])].filter(Boolean);
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <form class="modal" id="pf" novalidate>
        <div class="modal-head"><h2>${isNew ? "Nouveau produit" : "Modifier le produit"}</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button></div>
        <div class="modal-body"><div class="form-grid">
          ${p.source_id ? `<div class="field full"><div class="notice">🔄 <b>Stock synchronisé</b> avec votre logiciel de gestion : il se met à jour tout seul à chaque vente, annulation ou réassort. Le <b>prix de vente du site</b> reste celui que vous fixez ici.</div></div>` : ""}
          <div class="field full"><label for="pf-links">Images du produit <small class="hint">— collez un ou plusieurs liens (un par ligne). La première est l'image principale.</small></label>
            <textarea id="pf-links" name="links" rows="3" placeholder="https://… (lien d'image Google, Google Drive ou autre site)">${esc(allImages.join("\n"))}</textarea>
            <small class="hint">Google Images : clic droit sur l'image → « Copier l'adresse de l'image ». Google Drive : partagez le fichier en « Tous les utilisateurs disposant du lien », puis copiez le lien.</small>
            <div class="img-pick" id="pf-gallery" style="flex-wrap:wrap;margin-top:6px"></div></div>
          <div class="field full"><label for="pf-file">… ou envoyer une photo depuis l'ordinateur / le téléphone</label>
            <input type="file" id="pf-file" accept="image/jpeg,image/png,image/webp">
            <small class="hint">JPG, PNG ou WebP, 5 Mo maximum. Elle sera ajoutée en première position.</small></div>
          <div class="field full"><label for="pf-name">Nom du produit *</label><input id="pf-name" name="name" value="${esc(p.name)}" required></div>
          <div class="field"><label for="pf-brand">Marque</label><input id="pf-brand" name="brand" value="${esc(p.brand)}"></div>
          <div class="field"><label for="pf-cat">Catégorie *</label><select id="pf-cat" name="category_id">${cache.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === p.category_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
          <div class="field"><label for="pf-price">Prix (GNF) *</label><input id="pf-price" name="price" type="number" min="0" step="1000" value="${esc(p.price)}" required></div>
          <div class="field"><label for="pf-old">Ancien prix (GNF) <small class="hint">pour afficher une promo</small></label><input id="pf-old" name="old_price" type="number" min="0" step="1000" value="${esc(p.old_price || "")}"></div>
          <div class="field"><label for="pf-stock">Stock *</label><input id="pf-stock" name="stock" type="number" min="0" value="${esc(p.stock)}" required></div>
          <div class="field"><label for="pf-badge">Badge <small class="hint">ex. Promo, Nouveau</small></label><input id="pf-badge" name="badge" value="${esc(p.badge || "")}" maxlength="20"></div>
          <div class="field full"><label for="pf-desc">Description</label><textarea id="pf-desc" name="description" rows="3">${esc(p.description)}</textarea></div>
          <div class="field"><label for="pf-etat">État de l'appareil</label><select id="pf-etat" name="etat"><option value="">— Non précisé —</option>${GRADES.map((g) => `<option ${(p.specs || {})["État"] === g ? "selected" : ""}>${g}</option>`).join("")}</select></div>
          <div class="field"><label for="pf-batt">Santé batterie (%) <small class="hint">ordinateurs</small></label><input id="pf-batt" name="batt" type="number" min="1" max="100" value="${esc(String((p.specs || {})["Batterie"] || "").replace(/\D/g, ""))}"></div>
          <div class="field full"><label for="pf-auto">Autonomie constatée <small class="hint">facultatif, ex. « 4 à 5 heures »</small></label><input id="pf-auto" name="autonomie" maxlength="40" value="${esc((p.specs || {})["Autonomie"] || "")}"></div>
          <div class="field full"><label for="pf-specs">Caractéristiques <small class="hint">une par ligne, format « Nom : valeur »</small></label><textarea id="pf-specs" name="specs" rows="5">${esc(specsToText(p.specs))}</textarea></div>
          <div class="field"><label for="pf-pos">Ordre d'affichage</label><input id="pf-pos" name="position" type="number" value="${esc(p.position)}"></div>
          <div class="field"><label for="pf-color">Couleur de l'illustration <small class="hint">si pas de photo</small></label><input id="pf-color" name="color" type="color" value="${esc(p.color || "#0f014c")}" style="height:44px;padding:4px"></div>
          <div class="field"><label class="check"><input type="checkbox" name="featured" ${p.featured ? "checked" : ""}> Produit vedette (page d'accueil)</label></div>
          <div class="field"><label class="check"><input type="checkbox" name="active" ${p.active ? "checked" : ""}> Visible sur le site</label></div>
        </div></div>
        <div class="modal-foot"><button type="button" class="btn btn-outline" data-close>Annuler</button><button class="btn btn-primary" id="pf-save">${isNew ? "Ajouter le produit" : "Enregistrer"}</button></div>
      </form>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    $$("[data-close]", bg).forEach((b) => b.addEventListener("click", close));
    bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
    const drawGallery = () => {
      const file = $("#pf-file", bg).files[0];
      const urls = [...(file ? [URL.createObjectURL(file)] : []), ...imageLinks($("#pf-links", bg).value)];
      $("#pf-gallery", bg).innerHTML = urls.length
        ? urls.map((u, i) => `<div class="preview" style="width:76px;height:76px" title="${i === 0 ? "Image principale" : ""}"><img src="${esc(u)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('⚠️ lien invalide'))"></div>`).join("")
        : `<span class="hint">Aucune image : une illustration sera affichée.</span>`;
    };
    $("#pf-links", bg).addEventListener("input", drawGallery);
    $("#pf-file", bg).addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (f && f.size > 5 * 1024 * 1024) { e.target.value = ""; toast("Image trop lourde (5 Mo maximum)", true); }
      drawGallery();
    });
    drawGallery();

    $("#pf", bg).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, btn = $("#pf-save", bg);
      const name = f.name.value.trim(), price = parseInt(f.price.value, 10), stock = parseInt(f.stock.value, 10);
      if (name.length < 2) return toast("Indiquez le nom du produit", true);
      if (!(price >= 0)) return toast("Indiquez un prix valide", true);
      if (!(stock >= 0)) return toast("Indiquez un stock valide", true);
      if (!f.category_id.value) return toast("Créez d'abord une catégorie", true);
      const oldPrice = parseInt(f.old_price.value, 10);
      let id = p.id;
      if (isNew) {
        id = slug(name) || "produit";
        if (cache.products.some((x) => x.id === id)) id += "-" + Date.now().toString(36).slice(-4);
      }
      btn.disabled = true;
      btn.textContent = "Enregistrement…";
      try {
        const links = imageLinks(f.links.value);
        if (f.links.value.trim() && !links.length) throw new Error("Lien d'image invalide (il doit commencer par https://)");
        const file = $("#pf-file", bg).files[0];
        if (file) {
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
          const path = `${id}-${Date.now()}.${ext}`;
          const up = await sb.storage.from("produits").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
          if (up.error) throw up.error;
          links.unshift(sb.storage.from("produits").getPublicUrl(path).data.publicUrl);
        }
        const row = {
          id, name, brand: f.brand.value.trim(), category_id: f.category_id.value, price,
          old_price: oldPrice > price ? oldPrice : null, stock, badge: f.badge.value.trim() || null,
          description: f.description.value.trim(), specs: withCondition(textToSpecs(f.specs.value), f), position: parseInt(f.position.value, 10) || 0,
          color: f.color.value, featured: f.featured.checked, active: f.active.checked, auto_hidden: false,
          image_url: links[0] || null, images: links.slice(1)
        };
        const { data, error } = isNew
          ? await sb.from("products").insert(row).select().single()
          : await sb.from("products").update(row).eq("id", p.id).select().single();
        if (error) throw error;
        if (isNew) cache.products.push(data); else Object.assign(p, data);
        toast(isNew ? "Produit ajouté ✓" : "Produit enregistré ✓");
        close();
        drawProducts();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = isNew ? "Ajouter le produit" : "Enregistrer";
        fail(err, "Enregistrement impossible");
      }
    });
    $("#pf-name", bg).focus();
  }

  /* ---------- Clients ---------- */
  async function tabClients(main) {
    const [profiles, admins, orders] = await Promise.all([
      sb.from("customer_profiles").select("*").order("created_at", { ascending: false }),
      sb.from("admins").select("user_id"),
      loadOrders(1000)
    ]);
    if (profiles.error) throw profiles.error;
    const adminIds = new Set((admins.data || []).map((a) => a.user_id));
    const stats = {};
    orders.filter((o) => o.user_id && o.status !== "annulee").forEach((o) => {
      const s = (stats[o.user_id] = stats[o.user_id] || { n: 0, total: 0, last: null });
      s.n += 1; s.total += Number(o.total);
      if (!s.last || o.created_at > s.last) s.last = o.created_at;
    });
    const customers = profiles.data.filter((p) => !adminIds.has(p.user_id));
    const guests = orders.filter((o) => !o.user_id).length;
    main.innerHTML = `
      <div class="main-head"><h1>Clients</h1></div>
      <div class="stats" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><small>Comptes clients</small><strong>${customers.length}</strong></div>
        <div class="stat"><small>Commandes avec compte</small><strong>${orders.length - guests}</strong></div>
        <div class="stat"><small>Commandes sans compte</small><strong>${guests}</strong></div>
      </div>
      <p class="hint" style="margin-top:0">Les comptes clients servent uniquement à commander et suivre ses commandes. Votre compte personnel (administrateur) n'apparaît pas dans cette liste.</p>
      <div class="toolbar-admin"><input type="search" id="c-q" placeholder="Rechercher un nom, un téléphone, un email…"></div>
      <div class="table-wrap" id="clients-table"></div>`;
    const draw = () => {
      const q = $("#c-q").value.trim().toLowerCase();
      const list = customers.filter((p) => !q || `${p.full_name} ${p.phone} ${p.email}`.toLowerCase().includes(q));
      $("#clients-table").innerHTML = list.length ? `<table class="data">
        <tr><th>Client</th><th>Téléphone</th><th>Adresse</th><th>Inscrit le</th><th style="text-align:right">Commandes</th><th style="text-align:right">Total dépensé</th><th></th></tr>
        ${list.map((p) => { const s = stats[p.user_id] || { n: 0, total: 0 }; const phone = (p.phone || "").replace(/\D/g, ""); return `<tr>
          <td><b>${esc(p.full_name || "—")}</b><br><small class="muted">${esc(p.email)}</small></td>
          <td>${esc(p.phone || "—")}</td>
          <td>${esc(p.address || "—")}</td>
          <td>${new Date(p.created_at).toLocaleDateString("fr-FR")}</td>
          <td class="num">${s.n}</td><td class="num">${money(s.total)}</td>
          <td>${phone ? `<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/${phone}">WhatsApp</a>` : ""}</td>
        </tr>`; }).join("")}</table>`
        : `<p class="hint" style="padding:20px">${q ? "Aucun client ne correspond." : "Aucun compte client pour le moment. Les clients peuvent s'inscrire depuis « Mon compte » sur la boutique."}</p>`;
    };
    $("#c-q").addEventListener("input", draw);
    draw();
  }

  /* ---------- Tables simples (catégories, zones, promos) ---------- */
  const CRUD = {
    categories: {
      title: "Catégories", table: "categories", key: "id", order: "position",
      intro: "Les catégories apparaissent dans le menu de la boutique. Une catégorie qui contient encore des produits ne peut pas être supprimée.",
      cols: [
        { f: "id", label: "Identifiant", type: "text", lockExisting: true, placeholder: "ex. cameras" },
        { f: "name", label: "Nom", type: "text" },
        { f: "icon", label: "Icône", type: "select", options: ICONS },
        { f: "position", label: "Ordre", type: "number" }
      ],
      blank: () => ({ id: "", name: "", icon: "charger", position: 99 })
    },
    zones: {
      title: "Zones de livraison", table: "delivery_zones", key: "id", order: "position",
      cols: [
        { f: "id", label: "Identifiant", type: "text", lockExisting: true, placeholder: "ex. kipe" },
        { f: "name", label: "Nom", type: "text" },
        { f: "fee", label: "Frais (GNF)", type: "number" },
        { f: "delay", label: "Délai", type: "text" },
        { f: "free_eligible", label: "Livr. gratuite possible", type: "checkbox" },
        { f: "active", label: "Active", type: "checkbox" },
        { f: "position", label: "Ordre", type: "number" }
      ],
      blank: () => ({ id: "", name: "", fee: 0, delay: "Le jour même", free_eligible: true, active: true, position: 99 })
    },
    promos: {
      title: "Codes promo", table: "promo_codes", key: "code", order: "code",
      intro: "Les clients saisissent ces codes dans leur panier. La réduction est recalculée par le serveur à chaque commande.",
      cols: [
        { f: "code", label: "Code", type: "text", lockExisting: true, upper: true, placeholder: "ex. NOEL15" },
        { f: "percent", label: "Réduction (%)", type: "number" },
        { f: "active", label: "Actif", type: "checkbox" }
      ],
      blank: () => ({ code: "", percent: 10, active: true })
    }
  };

  function cellInput(col, value, isNew) {
    const locked = col.lockExisting && !isNew;
    if (col.type === "checkbox") return `<label class="check"><input type="checkbox" data-f="${col.f}" ${value ? "checked" : ""}></label>`;
    if (col.type === "select") return `<select data-f="${col.f}">${col.options.map((o) => `<option ${o === value ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    if (locked) return `<b>${esc(value)}</b>`;
    return `<input type="${col.type}" data-f="${col.f}" value="${esc(value ?? "")}" placeholder="${esc(col.placeholder || "")}">`;
  }

  async function crudSection(container, cfg) {
    const { data, error } = await sb.from(cfg.table).select("*").order(cfg.order);
    if (error) throw error;
    const rows = data;
    const draw = () => {
      container.innerHTML = `
        ${cfg.intro ? `<p class="hint" style="margin-top:0">${cfg.intro}</p>` : ""}
        <div class="table-wrap"><table class="data">
          <tr>${cfg.cols.map((c) => `<th>${c.label}</th>`).join("")}<th></th></tr>
          ${rows.map((r, i) => `<tr data-i="${i}">${cfg.cols.map((c) => `<td>${cellInput(c, r[c.f], r.__new)}</td>`).join("")}
            <td><div class="row-actions"><button class="btn btn-primary btn-sm" data-save>${r.__new ? "Ajouter" : "Enregistrer"}</button><button class="btn btn-danger btn-sm" data-del>${r.__new ? "Annuler" : "Supprimer"}</button></div></td></tr>`).join("")}
        </table></div>
        <button class="btn btn-outline btn-sm" data-add style="margin-top:12px">+ Ajouter</button>`;
      $("[data-add]", container).addEventListener("click", () => { rows.push({ ...cfg.blank(), __new: true }); draw(); });
      $$("tr[data-i]", container).forEach((tr) => {
        const r = rows[+tr.dataset.i];
        $("[data-save]", tr).addEventListener("click", async () => {
          const row = {};
          cfg.cols.forEach((c) => {
            const el = $(`[data-f="${c.f}"]`, tr);
            if (!el) { row[c.f] = r[c.f]; return; }
            let v = c.type === "checkbox" ? el.checked : c.type === "number" ? Number(el.value) || 0 : el.value.trim();
            if (c.upper) v = v.toUpperCase().replace(/\s+/g, "");
            if (c.lockExisting && c.type === "text" && !c.upper) v = slug(v);
            row[c.f] = v;
          });
          if (!row[cfg.key]) return toast("Remplissez l'identifiant", true);
          const req = r.__new
            ? sb.from(cfg.table).insert(row).select().single()
            : sb.from(cfg.table).update(row).eq(cfg.key, r[cfg.key]).select().single();
          const { data: saved, error: err } = await req;
          if (err) return fail(err, err.code === "23505" ? "Cet identifiant existe déjà" : "Enregistrement impossible");
          rows[+tr.dataset.i] = saved;
          toast("Enregistré ✓");
          draw();
        });
        $("[data-del]", tr).addEventListener("click", async () => {
          if (r.__new) { rows.splice(+tr.dataset.i, 1); return draw(); }
          if (!confirm(`Supprimer « ${r.name || r[cfg.key]} » ?`)) return;
          const { error: err } = await sb.from(cfg.table).delete().eq(cfg.key, r[cfg.key]);
          if (err) return fail(err, err.code === "23503" ? "Encore utilisé par des produits" : "Suppression impossible");
          rows.splice(+tr.dataset.i, 1);
          toast("Supprimé");
          draw();
        });
      });
    };
    draw();
  }

  async function tabCrud(main, cfg) {
    main.innerHTML = `<div class="main-head"><h1>${cfg.title}</h1></div><div id="crud"></div>`;
    await crudSection($("#crud"), cfg);
  }

  async function tabDelivery(main) {
    const { data } = await sb.from("shop_settings").select("*").eq("key", "free_delivery_from").maybeSingle();
    const free = data ? Number(data.value) || 0 : 0;
    main.innerHTML = `
      <div class="main-head"><h1>Livraison</h1></div>
      <div class="box" style="margin-bottom:16px">
        <h3>Livraison gratuite</h3>
        <form id="free-form" class="toolbar-admin" style="align-items:center;margin:0">
          <label for="free-from">Offerte à partir de</label>
          <input id="free-from" type="number" min="0" step="10000" value="${free}" style="max-width:180px"> <span>GNF</span>
          <button class="btn btn-primary btn-sm">Enregistrer</button>
        </form>
        <p class="hint" style="margin-bottom:0">Mettez 0 pour désactiver. Ne s'applique qu'aux zones cochées « Livr. gratuite possible ».</p>
      </div>
      <h3>Zones et tarifs</h3>
      <div id="crud"></div>`;
    $("#free-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = Math.max(0, parseInt($("#free-from").value, 10) || 0);
      const { error } = await sb.from("shop_settings").upsert({ key: "free_delivery_from", value });
      if (error) return fail(error);
      toast(value ? `Livraison gratuite dès ${money(value)}` : "Livraison gratuite désactivée");
    });
    await crudSection($("#crud"), CRUD.zones);
  }

  /* ---------- Démarrage ---------- */
  window.addEventListener("hashchange", () => {
    if (!session || !$("#main")) return;
    tab = (location.hash.slice(2) || "dashboard").split("/")[0];
    renderTab();
  });

  sb.auth.onAuthStateChange((event, s) => {
    // Pas d'appel Supabase directement dans ce rappel (recommandation de la librairie)
    setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") return viewPasswordReset();
      if (event === "SIGNED_OUT") { session = null; clearInterval(watchTimer); lastOrderId = undefined; location.href = "/#/compte"; return; }
      if (event === "SIGNED_IN" && (!session || session.user.id !== s.user.id)) start();
    }, 0);
  });

  start();
})();
