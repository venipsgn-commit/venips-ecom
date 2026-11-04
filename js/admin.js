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
  const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

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

  async function start() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    // Lien direct vers l'inscription : /admin#inscription
    if (!session) return viewAuth(location.hash === "#inscription" ? "signup" : "login");
    const { data: ok, error } = await sb.rpc("is_admin");
    if (error) return fail(error);
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
    ["dashboard", "📊", "Tableau de bord"], ["commandes", "🧾", "Commandes"], ["produits", "📦", "Produits"], ["clients", "👥", "Clients"],
    ["categories", "🗂️", "Catégories"], ["livraison", "🚚", "Livraison"], ["promos", "🏷️", "Codes promo"]
  ];
  function renderShell() {
    if (!NAV.some((n) => n[0] === tab)) tab = "dashboard";
    root.innerHTML = `
      <div class="admin">
        <nav class="side">
          <div class="brand"><img src="${esc(S.logoImage || "images/logo.jpg")}" alt="${esc(S.name)}"><small>Admin</small></div>
          ${NAV.map(([id, ic, label]) => `<a href="#/${id}" class="${tab === id ? "active" : ""}">${ic} ${label}${id === "commandes" ? `<span class="pill-count" id="new-count" hidden></span>` : ""}</a>`).join("")}
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
    renderTab();
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
    const [orders, products] = await Promise.all([loadOrders(500), loadProducts()]);
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

  /* ---------- Commandes ---------- */
  let orderFilter = { status: "", q: "" };
  async function tabOrders(main) {
    await loadOrders();
    main.innerHTML = `
      <div class="main-head"><h1>Commandes</h1><div class="actions"><button class="btn btn-outline btn-sm" id="refresh">↻ Actualiser</button></div></div>
      <div class="toolbar-admin">
        <input type="search" id="o-q" placeholder="Rechercher n°, nom, téléphone…" value="${esc(orderFilter.q)}">
        <select id="o-status"><option value="">Tous les statuts</option>${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${orderFilter.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div class="table-wrap" id="orders-table"></div>`;
    $("#refresh").addEventListener("click", renderTab);
    $("#o-q").addEventListener("input", (e) => { orderFilter.q = e.target.value; drawOrders(); });
    $("#o-status").addEventListener("change", (e) => { orderFilter.status = e.target.value; drawOrders(); });
    drawOrders();
  }

  function drawOrders() {
    const q = orderFilter.q.trim().toLowerCase();
    const list = cache.orders.filter((o) => (!orderFilter.status || o.status === orderFilter.status)
      && (!q || `${o.id} ${o.customer_name} ${o.customer_phone} ${o.zone_name}`.toLowerCase().includes(q)));
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
    const waMsg = `Bonjour ${o.customer_name.split(" ")[0]}, c'est ${S.name}. Votre commande ${o.id} (${money(o.total)}) est ${(STATUSES[o.status] || "").toLowerCase()}.`;
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
          <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}">WhatsApp client</a>
        </div>
        ${o.gestion_vente_ids && o.gestion_vente_ids.length
          ? `<p class="notice" style="margin-top:10px">✓ Vente enregistrée dans votre logiciel de gestion (vendeur « SITE WEB »).</p>`
          : `<p class="hint" style="margin-top:8px">En passant en « Livrée », la vente est enregistrée automatiquement dans votre logiciel de gestion (vendeur « SITE WEB »).</p>`}
        ${o.status !== "annulee" ? `<p class="hint" style="margin-top:4px">Passer en « Annulée » remet automatiquement les articles en stock${o.status === "livree" ? " et retire la vente du logiciel de gestion" : ""}.</p>` : ""}
      </div>
    </div></td>`;
    tr.after(row);
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

  /* ---------- Produits ---------- */
  let productQ = "";
  async function tabProducts(main) {
    await loadProducts();
    main.innerHTML = `
      <div class="main-head"><h1>Produits</h1><div class="actions"><button class="btn btn-primary btn-sm" id="p-new">+ Nouveau produit</button></div></div>
      <div class="toolbar-admin">
        <input type="search" id="p-q" placeholder="Rechercher un produit, une marque…" value="${esc(productQ)}">
        <select id="p-cat"><option value="">Toutes les catégories</option>${cache.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>
      </div>
      <div class="table-wrap" id="products-table"></div>`;
    $("#p-new").addEventListener("click", () => productForm(null));
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
        <td><b>${esc(p.name)}</b><br><small class="muted">${esc(p.brand)}${p.featured ? " · ⭐ vedette" : ""}${p.badge ? ` · ${esc(p.badge)}` : ""}${p.source_id ? " · 🔄 stock synchronisé" : ""}${p.auto_hidden ? " · ⛔ masqué : stock épuisé (réapparaîtra au réassort)" : !p.active ? " · masqué manuellement" : ""}${p.images && p.images.length ? ` · 🖼️ ${p.images.length + 1} images` : ""}</small></td>
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

  function specsToText(specs) { return Object.entries(specs || {}).map(([k, v]) => `${k} : ${v}`).join("\n"); }
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
          description: f.description.value.trim(), specs: textToSpecs(f.specs.value), position: parseInt(f.position.value, 10) || 0,
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
      if (event === "SIGNED_OUT") { session = null; clearInterval(watchTimer); lastOrderId = undefined; return viewAuth(); }
      if (event === "SIGNED_IN" && (!session || session.user.id !== s.user.id)) start();
    }, 0);
  });

  start();
})();
