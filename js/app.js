/* =========================================================
   Conakry Tech – application de la boutique
   ========================================================= */
(function () {
  "use strict";

  const S = window.STORE;
  const PRODUCTS = window.PRODUCTS;
  const CATEGORIES = window.CATEGORIES;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const app = $("#app");

  /* ---------- Utilitaires ---------- */
  const money = (n) => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ") + " " + S.currency;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const catName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || id;
  const discount = (p) => (p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
  const waLink = (text) => `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(text)}`;
  const stars = (r) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem("ct_" + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("ct_" + key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
    }
  };

  let cart = store.get("cart", []).filter((l) => byId(l.id));
  let wish = store.get("wish", []).filter((id) => byId(id));
  let promo = store.get("promo", "");
  let orders = store.get("orders", []);

  /* ---------- Illustrations produits (SVG) ---------- */
  function icon(type, color = "#0b1b3a") {
    const c = color, a = "#ff7a00";
    const shapes = {
      phone: `<rect x="34" y="8" width="52" height="104" rx="10" fill="${c}"/><rect x="39" y="18" width="42" height="80" rx="3" fill="#dbeafe"/><rect x="39" y="18" width="42" height="80" rx="3" fill="url(#g)"/><circle cx="60" cy="105" r="3" fill="#94a3b8"/><rect x="52" y="12" width="16" height="2.5" rx="1.2" fill="#475569"/>`,
      laptop: `<rect x="18" y="20" width="84" height="56" rx="5" fill="${c}"/><rect x="23" y="25" width="74" height="46" rx="2" fill="url(#g)"/><path d="M8 80h104l-8 12H16z" fill="#94a3b8"/><rect x="50" y="82" width="20" height="3" rx="1.5" fill="#64748b"/>`,
      tablet: `<rect x="22" y="14" width="76" height="96" rx="8" fill="${c}"/><rect x="28" y="20" width="64" height="84" rx="3" fill="url(#g)"/>`,
      tv: `<rect x="8" y="18" width="104" height="66" rx="4" fill="${c}"/><rect x="13" y="23" width="94" height="56" rx="2" fill="url(#g)"/><path d="M44 96h32l-4-12H48z" fill="#64748b"/><rect x="36" y="96" width="48" height="4" rx="2" fill="#475569"/>`,
      headphones: `<path d="M24 70V58a36 36 0 0 1 72 0v12" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"/><rect x="16" y="64" width="22" height="38" rx="9" fill="${c}"/><rect x="82" y="64" width="22" height="38" rx="9" fill="${c}"/><rect x="22" y="72" width="10" height="22" rx="4" fill="${a}"/><rect x="88" y="72" width="10" height="22" rx="4" fill="${a}"/>`,
      speaker: `<rect x="20" y="34" width="80" height="52" rx="26" fill="${c}"/><circle cx="46" cy="60" r="14" fill="#1f2937"/><circle cx="74" cy="60" r="14" fill="#1f2937"/><circle cx="46" cy="60" r="6" fill="${a}"/><circle cx="74" cy="60" r="6" fill="${a}"/>`,
      watch: `<rect x="44" y="6" width="32" height="26" rx="6" fill="#475569"/><rect x="44" y="88" width="32" height="26" rx="6" fill="#475569"/><rect x="32" y="28" width="56" height="64" rx="16" fill="${c}"/><rect x="38" y="34" width="44" height="52" rx="11" fill="url(#g)"/><path d="M60 48v14l8 6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      charger: `<rect x="30" y="20" width="60" height="84" rx="12" fill="${c}"/><rect x="40" y="34" width="40" height="8" rx="4" fill="${a}"/><rect x="40" y="48" width="28" height="6" rx="3" fill="#94a3b8"/><path d="M62 62l-10 18h10l-4 16 14-22H62l4-12z" fill="#facc15"/>`,
      solar: `<g transform="rotate(-8 60 60)"><rect x="12" y="30" width="96" height="58" rx="4" fill="#1e3a8a"/><path d="M12 49h96M12 69h96M36 30v58M60 30v58M84 30v58" stroke="#93c5fd" stroke-width="1.5"/></g><circle cx="96" cy="20" r="12" fill="#facc15"/><rect x="56" y="88" width="8" height="22" fill="#64748b"/>`,
      gaming: `<path d="M30 46h60a20 20 0 0 1 19 26l-6 20a10 10 0 0 1-17 4L76 84H44L34 96a10 10 0 0 1-17-4l-6-20a20 20 0 0 1 19-26z" fill="${c}"/><path d="M34 64h16M42 56v16" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="80" cy="60" r="4" fill="${a}"/><circle cx="88" cy="68" r="4" fill="#38bdf8"/>`
    };
    return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e40af"/><stop offset=".55" stop-color="#7c3aed"/><stop offset="1" stop-color="#ff7a00"/></linearGradient></defs>${shapes[type] || shapes.charger}</svg>`;
  }
  const productIcon = (p) => {
    const cat = CATEGORIES.find((c) => c.id === p.category);
    let t = cat ? cat.icon : "charger";
    if (p.category === "audio" && /enceinte|speaker/i.test(p.name)) t = "speaker";
    return icon(t, p.color);
  };
  const media = (p) => (p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : productIcon(p));

  /* ---------- Panier / favoris ---------- */
  function saveCart() { store.set("cart", cart); updateBadges(); renderCartDrawer(); }
  function addToCart(id, qty = 1) {
    const p = byId(id);
    if (!p || p.stock <= 0) return toast("Produit en rupture de stock");
    const line = cart.find((l) => l.id === id);
    const current = line ? line.qty : 0;
    const next = Math.min(current + qty, p.stock);
    if (next === current) return toast(`Stock maximum atteint (${p.stock})`);
    if (line) line.qty = next; else cart.push({ id, qty: next });
    saveCart();
    toast(`✓ ${p.name} ajouté au panier`);
  }
  function setQty(id, qty) {
    const p = byId(id);
    const line = cart.find((l) => l.id === id);
    if (!line || !p) return;
    line.qty = Math.max(1, Math.min(qty, p.stock));
    saveCart();
  }
  function removeFromCart(id) { cart = cart.filter((l) => l.id !== id); saveCart(); }
  function toggleWish(id) {
    const on = wish.includes(id);
    wish = on ? wish.filter((w) => w !== id) : [...wish, id];
    store.set("wish", wish);
    updateBadges();
    toast(on ? "Retiré des favoris" : "♥ Ajouté aux favoris");
    $$(`[data-wish="${id}"]`).forEach((b) => { b.classList.toggle("on", !on); b.textContent = !on ? "♥" : "♡"; });
    if (currentPath() === "/favoris") render();
  }

  function totals(zoneId) {
    const items = cart.map((l) => ({ ...l, p: byId(l.id) })).filter((l) => l.p);
    const subtotal = items.reduce((s, l) => s + l.p.price * l.qty, 0);
    const pct = S.promoCodes[promo] || 0;
    const reduction = Math.round((subtotal * pct) / 100);
    const zone = S.deliveryZones.find((z) => z.id === zoneId);
    const free = S.freeDeliveryFrom > 0 && subtotal - reduction >= S.freeDeliveryFrom && zoneId !== "interieur";
    const delivery = zone ? (free ? 0 : zone.fee) : 0;
    const count = items.reduce((s, l) => s + l.qty, 0);
    return { items, subtotal, pct, reduction, zone, free, delivery, total: subtotal - reduction + delivery, count };
  }

  function updateBadges() {
    const n = cart.reduce((s, l) => s + l.qty, 0);
    const cc = $("#cart-count"), wc = $("#wish-count");
    cc.textContent = n; cc.classList.toggle("zero", n === 0);
    wc.textContent = wish.length; wc.classList.toggle("zero", wish.length === 0);
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ---------- Drawers ---------- */
  function openDrawer(id) {
    closeDrawers();
    $(id).classList.add("open");
    $(id).setAttribute("aria-hidden", "false");
    $("#overlay").classList.add("show");
    document.body.style.overflow = "hidden";
  }
  function closeDrawers() {
    $$(".drawer").forEach((d) => { d.classList.remove("open"); d.setAttribute("aria-hidden", "true"); });
    $("#overlay").classList.remove("show");
    document.body.style.overflow = "";
  }

  function renderCartDrawer() {
    const t = totals();
    const body = $("#cart-drawer-body");
    if (!t.items.length) {
      body.innerHTML = `<div class="empty" style="box-shadow:none"><div class="big">🛒</div><p>Votre panier est vide.</p><a href="#/boutique" class="btn btn-primary" data-close>Découvrir la boutique</a></div>`;
      return;
    }
    body.innerHTML = `
      ${t.items.map(lineHTML).join("")}
      <div class="drawer-foot">
        ${freeDeliveryHTML(t)}
        <div class="sum-row total"><span>Sous-total</span><span>${money(t.subtotal - t.reduction)}</span></div>
        <a href="#/commande" class="btn btn-primary btn-block">Commander</a>
        <a href="#/panier" class="btn btn-outline btn-block">Voir le panier</a>
      </div>`;
  }

  function lineHTML(l) {
    return `<div class="line">
      <a href="#/produit/${l.p.id}" class="thumb">${media(l.p)}</a>
      <div>
        <a href="#/produit/${l.p.id}" class="line-title">${esc(l.p.name)}</a>
        <div class="hint">${money(l.p.price)}</div>
        <div class="line-meta">
          <div class="qty sm"><button data-dec="${l.p.id}" aria-label="Diminuer">−</button><input type="number" value="${l.qty}" min="1" max="${l.p.stock}" data-qty="${l.p.id}" aria-label="Quantité"><button data-inc="${l.p.id}" aria-label="Augmenter">+</button></div>
          <button class="remove" data-remove="${l.p.id}">Supprimer</button>
        </div>
      </div>
      <div class="line-price">${money(l.p.price * l.qty)}</div>
    </div>`;
  }

  function freeDeliveryHTML(t) {
    if (!S.freeDeliveryFrom) return "";
    const net = t.subtotal - t.reduction;
    const left = S.freeDeliveryFrom - net;
    const pct = Math.min(100, (net / S.freeDeliveryFrom) * 100);
    return `<div><div class="hint">${left > 0 ? `Plus que <b>${money(left)}</b> pour la livraison gratuite 🚚` : `🎉 Livraison gratuite à Conakry débloquée !`}</div><div class="progress"><div style="width:${pct}%"></div></div></div>`;
  }

  /* ---------- Composants ---------- */
  function cardHTML(p) {
    const off = discount(p);
    const on = wish.includes(p.id);
    return `<article class="card">
      <a href="#/produit/${p.id}" class="card-media" aria-label="${esc(p.name)}">
        ${media(p)}
        ${p.stock <= 0 ? `<span class="badge out">Rupture</span>` : p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
        ${off ? `<span class="badge off">-${off}%</span>` : ""}
      </a>
      <button class="wish ${on ? "on" : ""}" data-wish="${p.id}" aria-label="Ajouter aux favoris">${on ? "♥" : "♡"}</button>
      <div class="card-body">
        <div class="card-brand">${esc(p.brand)}</div>
        <a href="#/produit/${p.id}" class="card-title">${esc(p.name)}</a>
        <div class="stars">${stars(p.rating)}<small>(${p.reviews})</small></div>
        <div class="price"><strong>${money(p.price)}</strong>${p.oldPrice ? `<s>${money(p.oldPrice)}</s>` : ""}</div>
        <button class="btn btn-dark" data-add="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>${p.stock <= 0 ? "Indisponible" : "Ajouter au panier"}</button>
      </div>
    </article>`;
  }

  const crumbs = (items) => `<div class="crumbs"><a href="#/">Accueil</a>${items.map(([label, href]) => ` › ${href ? `<a href="${href}">${esc(label)}</a>` : esc(label)}`).join("")}</div>`;

  /* ---------- Pages ---------- */
  function pageHome() {
    const featured = PRODUCTS.filter((p) => p.featured).slice(0, 8);
    const deals = PRODUCTS.filter((p) => discount(p) > 0).sort((a, b) => discount(b) - discount(a)).slice(0, 4);
    const best = [...PRODUCTS].sort((a, b) => b.reviews - a.reviews).slice(0, 4);
    const tile = (id) => { const p = byId(id); return p ? `<a href="#/produit/${p.id}" class="tile">${productIcon(p)}<strong>${esc(p.name)}</strong><span>${money(p.price)}</span></a>` : ""; };
    document.title = `${S.name} – Smartphones, ordinateurs et électronique en Guinée`;
    return `
      <section class="hero">
        <div class="container hero-inner">
          <div>
            <h1>La technologie qu'il vous faut, <em>livrée à Conakry</em>.</h1>
            <p>Smartphones, ordinateurs, TV, audio et kits solaires de marques reconnues. Produits garantis, prix justes, paiement à la livraison ou par Mobile Money.</p>
            <div class="hero-actions">
              <a href="#/boutique" class="btn btn-primary">Voir la boutique</a>
              <a href="${waLink(`Bonjour ${S.name}, j'ai une question sur vos produits.`)}" target="_blank" rel="noopener" class="btn btn-wa">Commander sur WhatsApp</a>
            </div>
          </div>
          <div class="hero-visual">${tile("iphone-13-128")}${tile("macbook-air-m1")}${tile("jbl-flip-6")}${tile("kit-solaire-300")}</div>
        </div>
      </section>
      <div class="container">
        <div class="trust">
          <div class="trust-item"><span class="ic">🚚</span><div><strong>Livraison rapide</strong><small>Le jour même à Conakry</small></div></div>
          <div class="trust-item"><span class="ic">💵</span><div><strong>Paiement à la livraison</strong><small>Ou Orange Money / MoMo</small></div></div>
          <div class="trust-item"><span class="ic">🛡️</span><div><strong>Produits garantis</strong><small>Jusqu'à 12 mois</small></div></div>
          <div class="trust-item"><span class="ic">💬</span><div><strong>Service client</strong><small>Sur WhatsApp 7j/7</small></div></div>
        </div>
      </div>

      <section class="section"><div class="container">
        <div class="section-head"><div><h2>Nos catégories</h2><p>Tout l'univers high-tech au même endroit</p></div></div>
        <div class="cats">${CATEGORIES.map((c) => `<a href="#/boutique?cat=${c.id}" class="cat-card"><div class="cat-ic">${icon(c.icon)}</div><span>${esc(c.name)}</span></a>`).join("")}</div>
      </div></section>

      <section class="section" style="padding-top:0"><div class="container">
        <div class="section-head"><div><h2>Produits vedettes</h2><p>Sélectionnés pour vous</p></div><a href="#/boutique" class="link">Tout voir →</a></div>
        <div class="grid">${featured.map(cardHTML).join("")}</div>
      </div></section>

      <section class="section" style="padding-top:0"><div class="container banner">
        <div class="b1"><h3>Jusqu'à -${Math.max(...PRODUCTS.map(discount))}% sur une sélection</h3><p>Smartphones, TV et accessoires à prix cassés. Stocks limités !</p><a href="#/boutique?promo=1" class="btn">Voir les promos</a></div>
        <div class="b2"><h3>Fini les coupures ⚡</h3><p>Kits solaires et onduleurs pour la maison et la boutique.</p><a href="#/boutique?cat=energie" class="btn">Découvrir</a></div>
      </div></section>

      <section class="section" style="padding-top:0"><div class="container">
        <div class="section-head"><div><h2>🔥 Meilleures offres</h2><p>Les plus grosses réductions du moment</p></div><a href="#/boutique?promo=1" class="link">Toutes les promos →</a></div>
        <div class="grid">${deals.map(cardHTML).join("")}</div>
      </div></section>

      <section class="section" style="padding-top:0"><div class="container">
        <div class="section-head"><div><h2>Les plus populaires</h2><p>Les choix préférés de nos clients</p></div></div>
        <div class="grid">${best.map(cardHTML).join("")}</div>
      </div></section>`;
  }

  function pageShop(params) {
    const q = (params.get("q") || "").trim();
    const cat = params.get("cat") || "";
    const brands = (params.get("brand") || "").split(",").filter(Boolean);
    const min = Number(params.get("min")) || 0;
    const max = Number(params.get("max")) || 0;
    const onlyPromo = params.get("promo") === "1";
    const onlyStock = params.get("stock") === "1";
    const sort = params.get("sort") || "pertinence";

    const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const terms = norm(q).split(/\s+/).filter(Boolean);
    let list = PRODUCTS.filter((p) => {
      const hay = norm(`${p.name} ${p.brand} ${catName(p.category)} ${p.description}`);
      return (!cat || p.category === cat)
        && (!brands.length || brands.includes(p.brand))
        && (!min || p.price >= min)
        && (!max || p.price <= max)
        && (!onlyPromo || discount(p) > 0)
        && (!onlyStock || p.stock > 0)
        && terms.every((t) => hay.includes(t));
    });
    const sorters = {
      "prix-asc": (a, b) => a.price - b.price,
      "prix-desc": (a, b) => b.price - a.price,
      "note": (a, b) => b.rating - a.rating,
      "promo": (a, b) => discount(b) - discount(a),
      "pertinence": (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.reviews - a.reviews
    };
    list.sort(sorters[sort] || sorters.pertinence);

    const scope = cat ? PRODUCTS.filter((p) => p.category === cat) : PRODUCTS;
    const allBrands = [...new Set(scope.map((p) => p.brand))].sort();
    const title = q ? `Résultats pour « ${esc(q)} »` : cat ? esc(catName(cat)) : onlyPromo ? "Promotions" : "Tous nos produits";
    document.title = `${q ? "Recherche" : cat ? catName(cat) : "Boutique"} – ${S.name}`;

    return `
      <div class="container page-head">${crumbs([["Boutique", cat || q ? "#/boutique" : null], ...(cat ? [[catName(cat)]] : [])])}<h1>${title}</h1></div>
      <div class="container shop">
        <aside class="filters" id="filters">
          <h4>Catégories</h4>
          <label><input type="radio" name="cat" value="" ${!cat ? "checked" : ""}> Toutes</label>
          ${CATEGORIES.map((c) => `<label><input type="radio" name="cat" value="${c.id}" ${cat === c.id ? "checked" : ""}> ${esc(c.name)} <small class="hint">(${PRODUCTS.filter((p) => p.category === c.id).length})</small></label>`).join("")}
          <h4>Marques</h4>
          ${allBrands.map((b) => `<label><input type="checkbox" name="brand" value="${esc(b)}" ${brands.includes(b) ? "checked" : ""}> ${esc(b)}</label>`).join("")}
          <h4>Prix (GNF)</h4>
          <div class="price-row"><input type="number" name="min" placeholder="Min" value="${min || ""}" min="0" step="10000"><input type="number" name="max" placeholder="Max" value="${max || ""}" min="0" step="10000"></div>
          <h4>Disponibilité</h4>
          <label><input type="checkbox" name="promo" ${onlyPromo ? "checked" : ""}> En promotion</label>
          <label><input type="checkbox" name="stock" ${onlyStock ? "checked" : ""}> En stock uniquement</label>
          <a href="#/boutique" class="btn btn-outline btn-block" style="margin-top:14px">Réinitialiser</a>
        </aside>
        <div>
          <div class="toolbar">
            <button class="btn btn-outline filter-toggle" id="filter-toggle">⚙︎ Filtres</button>
            <span class="hint">${list.length} produit${list.length > 1 ? "s" : ""}</span>
            <select id="sort" aria-label="Trier">
              <option value="pertinence" ${sort === "pertinence" ? "selected" : ""}>Trier : pertinence</option>
              <option value="prix-asc" ${sort === "prix-asc" ? "selected" : ""}>Prix croissant</option>
              <option value="prix-desc" ${sort === "prix-desc" ? "selected" : ""}>Prix décroissant</option>
              <option value="note" ${sort === "note" ? "selected" : ""}>Mieux notés</option>
              <option value="promo" ${sort === "promo" ? "selected" : ""}>Plus grosses remises</option>
            </select>
          </div>
          ${list.length ? `<div class="grid">${list.map(cardHTML).join("")}</div>` : `<div class="empty"><div class="big">🔍</div><h3>Aucun produit trouvé</h3><p class="hint">Essayez d'autres mots-clés ou retirez des filtres.</p><p><a href="${waLink(`Bonjour, je cherche : ${q || "un produit"}. Est-ce disponible ?`)}" target="_blank" rel="noopener" class="btn btn-wa">Demander sur WhatsApp</a></p></div>`}
        </div>
      </div>`;
  }

  function pageProduct(id) {
    const p = byId(id);
    if (!p) return pageNotFound();
    const off = discount(p);
    const on = wish.includes(p.id);
    const related = PRODUCTS.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
    const stockHTML = p.stock <= 0 ? `<div class="stock no">✕ Rupture de stock</div>` : p.stock <= 5 ? `<div class="stock low">⚠ Plus que ${p.stock} en stock – commandez vite</div>` : `<div class="stock ok">✓ En stock, prêt à être livré</div>`;
    document.title = `${p.name} – ${S.name}`;
    return `
      <div class="container page-head">${crumbs([["Boutique", "#/boutique"], [catName(p.category), `#/boutique?cat=${p.category}`], [p.name]])}</div>
      <div class="container product">
        <div class="product-media">${media(p)}${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}</div>
        <div class="product-info">
          <div class="card-brand">${esc(p.brand)}</div>
          <h1>${esc(p.name)}</h1>
          <div class="stars">${stars(p.rating)}<small>${p.rating}/5 · ${p.reviews} avis</small></div>
          <div class="price" style="margin-top:12px"><strong>${money(p.price)}</strong>${p.oldPrice ? `<s>${money(p.oldPrice)}</s><span class="saving">-${off}% · Économisez ${money(p.oldPrice - p.price)}</span>` : ""}</div>
          ${stockHTML}
          <p>${esc(p.description)}</p>
          ${p.stock > 0 ? `
          <div class="buy-row">
            <div class="qty"><button data-pdec aria-label="Diminuer">−</button><input type="number" id="pqty" value="1" min="1" max="${p.stock}" aria-label="Quantité"><button data-pinc aria-label="Augmenter">+</button></div>
            <button class="btn btn-primary" data-padd="${p.id}">🛒 Ajouter au panier</button>
          </div>
          <div class="buy-row" style="margin-top:0">
            <button class="btn btn-dark" data-pbuy="${p.id}">Acheter maintenant</button>
            <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name}, je suis intéressé(e) par : ${p.name} (${money(p.price)}). Est-il disponible ?`)}">WhatsApp</a>
          </div>` : `<a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="${waLink(`Bonjour, quand le produit ${p.name} sera-t-il de nouveau disponible ?`)}">Être prévenu du retour en stock</a>`}
          <button class="btn btn-outline btn-block" data-wish="${p.id}" style="margin-bottom:16px">${on ? "♥ Dans vos favoris" : "♡ Ajouter aux favoris"}</button>
          <div class="perks">
            <div>🚚 Livraison à Conakry le jour même · dès ${money(Math.min(...S.deliveryZones.filter((z) => z.fee > 0).map((z) => z.fee)))}</div>
            <div>💵 Paiement à la livraison, Orange Money ou MTN MoMo</div>
            <div>🛡️ Garantie : ${esc(p.specs["Garantie"] || "selon produit")}</div>
            <div>🔄 Échange sous 7 jours en cas de défaut</div>
          </div>
        </div>
      </div>
      <section class="container" style="padding-bottom:32px">
        <h2>Caractéristiques</h2>
        <table class="specs">${Object.entries(p.specs).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}<tr><th>Marque</th><td>${esc(p.brand)}</td></tr><tr><th>Catégorie</th><td>${esc(catName(p.category))}</td></tr></table>
      </section>
      ${related.length ? `<section class="section" style="padding-top:8px"><div class="container"><div class="section-head"><h2>Vous aimerez aussi</h2></div><div class="grid">${related.map(cardHTML).join("")}</div></div></section>` : ""}`;
  }

  function pageCart() {
    const t = totals();
    document.title = `Panier – ${S.name}`;
    if (!t.items.length) {
      return `<div class="container page-head"><h1>Mon panier</h1></div><div class="container" style="padding-bottom:48px"><div class="empty"><div class="big">🛒</div><h3>Votre panier est vide</h3><p class="hint">Ajoutez des produits pour passer commande.</p><a href="#/boutique" class="btn btn-primary">Continuer mes achats</a></div></div>`;
    }
    return `
      <div class="container page-head">${crumbs([["Panier"]])}<h1>Mon panier (${t.count})</h1></div>
      <div class="container cart-layout">
        <div class="panel">${t.items.map(lineHTML).join("")}<a href="#/boutique" class="link" style="display:inline-block;margin-top:12px">← Continuer mes achats</a></div>
        <div class="panel" style="align-self:start">
          <h3>Récapitulatif</h3>
          ${summaryHTML(t)}
          ${promoHTML()}
          ${freeDeliveryHTML(t)}
          <a href="#/commande" class="btn btn-primary btn-block" style="margin-top:12px">Passer la commande</a>
          <p class="hint" style="text-align:center">Frais de livraison calculés à l'étape suivante</p>
        </div>
      </div>`;
  }

  function summaryHTML(t, withDelivery) {
    return `
      <div class="sum-row"><span>Sous-total (${t.count} article${t.count > 1 ? "s" : ""})</span><span>${money(t.subtotal)}</span></div>
      ${t.reduction ? `<div class="sum-row"><span>Code ${esc(promo)} (-${t.pct}%)</span><span class="green">-${money(t.reduction)}</span></div>` : ""}
      ${withDelivery ? `<div class="sum-row"><span>Livraison${t.zone ? ` · ${esc(t.zone.name)}` : ""}</span><span>${!t.zone ? "—" : t.delivery === 0 ? `<span class="green">Gratuite</span>` : money(t.delivery)}</span></div>` : ""}
      <div class="sum-row total"><span>Total</span><span>${money(withDelivery ? t.total : t.subtotal - t.reduction)}</span></div>`;
  }

  function promoHTML() {
    return promo
      ? `<div class="promo"><span class="hint" style="flex:1">Code <b>${esc(promo)}</b> appliqué</span><button class="btn btn-outline" data-promo-remove style="padding:8px 12px">Retirer</button></div>`
      : `<form class="promo" data-promo-form><input name="code" placeholder="Code promo" aria-label="Code promo"><button class="btn btn-outline" style="padding:8px 14px">Appliquer</button></form>`;
  }

  function pageCheckout() {
    const draft = store.get("customer", {});
    const t = totals(draft.zone);
    document.title = `Commande – ${S.name}`;
    if (!t.items.length) { location.hash = "#/panier"; return ""; }
    return `
      <div class="container page-head">${crumbs([["Panier", "#/panier"], ["Commande"]])}<h1>Finaliser ma commande</h1></div>
      <form class="container cart-layout" id="checkout" novalidate>
        <div class="panel">
          <h3 class="steps-title"><b>1</b> Vos coordonnées</h3>
          <div class="form-grid">
            <div class="field"><label for="f-name">Nom complet *</label><input id="f-name" name="name" autocomplete="name" value="${esc(draft.name)}" required><span class="err"></span></div>
            <div class="field"><label for="f-phone">Téléphone *</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" placeholder="6XX XX XX XX" value="${esc(draft.phone)}" required><span class="err"></span></div>
            <div class="field full"><label for="f-email">Email (facultatif)</label><input id="f-email" name="email" type="email" autocomplete="email" value="${esc(draft.email)}"><span class="err"></span></div>
          </div>

          <h3 class="steps-title"><b>2</b> Livraison</h3>
          <div class="form-grid">
            <div class="field full"><label for="f-zone">Zone de livraison *</label>
              <select id="f-zone" name="zone" required><option value="">— Choisir votre zone —</option>${S.deliveryZones.map((z) => `<option value="${z.id}" ${draft.zone === z.id ? "selected" : ""}>${esc(z.name)} · ${z.fee ? money(z.fee) : "Gratuit"} · ${esc(z.delay)}</option>`).join("")}</select><span class="err"></span></div>
            <div class="field full"><label for="f-address">Quartier / adresse précise *</label><input id="f-address" name="address" placeholder="Ex. : Kipé, près de la pharmacie…" value="${esc(draft.address)}" required><span class="err"></span></div>
            <div class="field full"><label for="f-notes">Instructions (facultatif)</label><textarea id="f-notes" name="notes" rows="2" placeholder="Heure de livraison souhaitée, repère…">${esc(draft.notes)}</textarea></div>
          </div>

          <h3 class="steps-title"><b>3</b> Mode de paiement</h3>
          <div class="options">${S.payments.map((m, i) => `<label class="option"><input type="radio" name="payment" value="${m.id}" ${(draft.payment ? draft.payment === m.id : i === 0) ? "checked" : ""}><div><strong>${esc(m.name)}</strong><small>${esc(m.desc)}${m.id === "orange" ? ` <b>N° : ${esc(S.orangeMoneyNumber)}</b>` : m.id === "mtn" ? ` <b>N° : ${esc(S.mtnMoneyNumber)}</b>` : ""}</small></div></label>`).join("")}</div>
        </div>

        <div class="panel" style="align-self:start">
          <h3>Votre commande</h3>
          ${t.items.map((l) => `<div class="sum-row"><span>${l.qty} × ${esc(l.p.name)}</span><span>${money(l.p.price * l.qty)}</span></div>`).join("")}
          <hr style="border:0;border-top:1px solid var(--line);margin:10px 0">
          <div id="checkout-summary">${summaryHTML(t, true)}</div>
          ${promoHTML()}
          <button type="submit" class="btn btn-wa btn-block" style="margin-top:8px">✓ Confirmer et envoyer sur WhatsApp</button>
          <p class="hint" style="text-align:center;margin-bottom:0">Votre commande sera envoyée à notre équipe sur WhatsApp pour confirmation. Aucun paiement en ligne n'est demandé.</p>
        </div>
      </form>`;
  }

  function orderMessage(o) {
    const lines = [
      `🛒 *NOUVELLE COMMANDE ${o.id}*`,
      `Boutique : ${S.name}`,
      "",
      ...o.items.map((i) => `• ${i.qty} × ${i.name} — ${money(i.price * i.qty)}`),
      "",
      `Sous-total : ${money(o.subtotal)}`,
      ...(o.reduction ? [`Réduction (${o.promo}) : -${money(o.reduction)}`] : []),
      `Livraison (${o.zone}) : ${o.delivery ? money(o.delivery) : "Gratuite"}`,
      `*TOTAL : ${money(o.total)}*`,
      "",
      `👤 ${o.customer.name}`,
      `📞 ${o.customer.phone}`,
      ...(o.customer.email ? [`✉️ ${o.customer.email}`] : []),
      `📍 ${o.customer.address} (${o.zone})`,
      ...(o.customer.notes ? [`📝 ${o.customer.notes}`] : []),
      `💳 Paiement : ${o.payment}`
    ];
    return lines.join("\n");
  }

  function submitCheckout(form) {
    const data = Object.fromEntries(new FormData(form));
    $$(".field", form).forEach((f) => { f.classList.remove("invalid"); const e = $(".err", f); if (e) e.textContent = ""; });
    const errors = {};
    if (!data.name || data.name.trim().length < 3) errors.name = "Veuillez indiquer votre nom complet.";
    const digits = (data.phone || "").replace(/\D/g, "").replace(/^(00)?224/, "");
    if (!/^6\d{8}$/.test(digits)) errors.phone = "Numéro guinéen invalide (9 chiffres, commence par 6).";
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = "Adresse email invalide.";
    if (!data.zone) errors.zone = "Choisissez une zone de livraison.";
    if (!data.address || data.address.trim().length < 3) errors.address = "Indiquez votre quartier ou adresse.";
    const keys = Object.keys(errors);
    if (keys.length) {
      keys.forEach((k) => { const el = form.elements[k]; const f = el && el.closest(".field"); if (f) { f.classList.add("invalid"); $(".err", f).textContent = errors[k]; } });
      form.elements[keys[0]].focus();
      return toast("Veuillez corriger les champs en rouge");
    }

    const t = totals(data.zone);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const id = `CT-${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const pay = S.payments.find((m) => m.id === data.payment) || S.payments[0];
    const order = {
      id, date: now.toISOString(),
      items: t.items.map((l) => ({ id: l.p.id, name: l.p.name, price: l.p.price, qty: l.qty })),
      subtotal: t.subtotal, reduction: t.reduction, promo, delivery: t.delivery, total: t.total,
      zone: t.zone.name, payment: pay.name, paymentId: pay.id,
      customer: { name: data.name.trim(), phone: "+224 " + digits.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4"), email: (data.email || "").trim(), address: data.address.trim(), notes: (data.notes || "").trim() }
    };
    orders = [order, ...orders].slice(0, 50);
    store.set("orders", orders);
    cart = []; promo = "";
    store.set("promo", "");
    saveCart();
    window.open(waLink(orderMessage(order)), "_blank", "noopener");
    location.hash = `#/merci/${id}`;
  }

  function pageThanks(id) {
    const o = orders.find((x) => x.id === id);
    if (!o) return pageNotFound();
    document.title = `Commande ${o.id} – ${S.name}`;
    const payInfo = o.paymentId === "orange" ? `<p>💳 Envoyez <b>${money(o.total)}</b> par Orange Money au <b>${esc(S.orangeMoneyNumber)}</b> puis partagez la capture sur WhatsApp.</p>`
      : o.paymentId === "mtn" ? `<p>💳 Envoyez <b>${money(o.total)}</b> par MTN MoMo au <b>${esc(S.mtnMoneyNumber)}</b> puis partagez la capture sur WhatsApp.</p>`
      : `<p>💵 Préparez <b>${money(o.total)}</b> en espèces pour la livraison.</p>`;
    return `<div class="container"><div class="panel success">
      <div class="check">✓</div>
      <h1>Merci ${esc(o.customer.name.split(" ")[0])} !</h1>
      <p>Votre commande <b>${o.id}</b> a été enregistrée. Si WhatsApp ne s'est pas ouvert, cliquez sur le bouton ci-dessous pour nous l'envoyer — nous la confirmerons rapidement.</p>
      <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(orderMessage(o))}">Envoyer ma commande sur WhatsApp</a>
      <div class="order-box">
        ${o.items.map((i) => `<div class="sum-row"><span>${i.qty} × ${esc(i.name)}</span><span>${money(i.price * i.qty)}</span></div>`).join("")}
        <div class="sum-row"><span>Livraison (${esc(o.zone)})</span><span>${o.delivery ? money(o.delivery) : "Gratuite"}</span></div>
        <div class="sum-row total"><span>Total</span><span>${money(o.total)}</span></div>
        ${payInfo}
      </div>
      <a href="#/boutique" class="btn btn-outline">Continuer mes achats</a> <a href="#/mes-commandes" class="btn btn-outline">Mes commandes</a>
    </div></div>`;
  }

  function pageOrders() {
    document.title = `Mes commandes – ${S.name}`;
    return `<div class="container page-head">${crumbs([["Mes commandes"]])}<h1>Mes commandes</h1></div>
      <div class="container" style="padding-bottom:48px"><div class="panel orders">
        ${orders.length ? orders.map((o) => `<div class="order">
          <div class="order-head"><span>${o.id}</span><span>${new Date(o.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span></div>
          <p class="hint" style="margin:6px 0">${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join(" · ")}</p>
          <div class="order-head"><span>${money(o.total)} · ${esc(o.payment)}</span><a class="link" target="_blank" rel="noopener" href="${waLink(`Bonjour, je souhaite suivre ma commande ${o.id}.`)}">Suivre sur WhatsApp →</a></div>
        </div>`).join("") : `<div class="empty" style="box-shadow:none"><div class="big">📦</div><p>Aucune commande passée depuis cet appareil.</p><a href="#/boutique" class="btn btn-primary">Commencer mes achats</a></div>`}
      </div></div>`;
  }

  function pageWish() {
    const list = wish.map(byId).filter(Boolean);
    document.title = `Favoris – ${S.name}`;
    return `<div class="container page-head">${crumbs([["Favoris"]])}<h1>Mes favoris</h1></div>
      <div class="container" style="padding-bottom:48px">${list.length ? `<div class="grid">${list.map(cardHTML).join("")}</div>` : `<div class="empty"><div class="big">♡</div><h3>Aucun favori pour le moment</h3><p class="hint">Cliquez sur ♡ pour garder un produit de côté.</p><a href="#/boutique" class="btn btn-primary">Parcourir la boutique</a></div>`}</div>`;
  }

  const content = (title, html) => { document.title = `${title} – ${S.name}`; return `<div class="container page-head">${crumbs([[title]])}<h1>${title}</h1></div><div class="container"><div class="prose">${html}</div></div>`; };

  function pageAbout() {
    return content("À propos", `
      <h2>Qui sommes-nous ?</h2>
      <p><b>${esc(S.name)}</b> est une boutique d'électronique basée à Conakry. Notre mission : rendre la technologie de qualité accessible à tous les Guinéens, avec des prix justes, des produits authentiques et un service client proche de vous.</p>
      <h2>Nos engagements</h2>
      <ul>
        <li><b>Produits authentiques et testés</b> avant chaque livraison.</li>
        <li><b>Garantie</b> jusqu'à 12 mois selon les produits.</li>
        <li><b>Livraison rapide</b> dans toutes les communes de Conakry et expédition vers l'intérieur du pays.</li>
        <li><b>Paiement flexible</b> : à la livraison, Orange Money ou MTN Mobile Money.</li>
        <li><b>Service après-vente</b> réactif sur WhatsApp.</li>
      </ul>
      <p><a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name} !`)}">Discuter avec nous</a></p>`);
  }

  function pageDelivery() {
    return content("Livraison & retours", `
      <h2>Zones et tarifs de livraison</h2>
      <table class="zones"><tr><th>Zone</th><th>Frais</th><th>Délai</th></tr>${S.deliveryZones.map((z) => `<tr><td>${esc(z.name)}</td><td>${z.fee ? money(z.fee) : "Gratuit"}</td><td>${esc(z.delay)}</td></tr>`).join("")}</table>
      ${S.freeDeliveryFrom ? `<p>🎉 <b>Livraison gratuite</b> pour toute commande à partir de <b>${money(S.freeDeliveryFrom)}</b> (hors intérieur du pays).</p>` : ""}
      <h2>Comment ça marche ?</h2>
      <ol><li>Vous passez commande sur le site.</li><li>Notre équipe vous contacte sur WhatsApp pour confirmer.</li><li>Le livreur vous appelle avant d'arriver.</li><li>Vous vérifiez le produit puis vous payez (si paiement à la livraison).</li></ol>
      <h2>Retours et échanges</h2>
      <p>Vous disposez de <b>7 jours</b> après réception pour signaler un défaut. Le produit doit être dans son emballage d'origine avec tous ses accessoires. Après vérification, nous procédons à l'échange ou à la réparation sous garantie.</p>`);
  }

  function pageFAQ() {
    const qa = [
      ["Comment passer une commande ?", "Ajoutez vos produits au panier, cliquez sur « Commander », remplissez vos coordonnées puis confirmez. La commande est envoyée à notre équipe sur WhatsApp qui vous recontacte rapidement."],
      ["Quels sont les moyens de paiement ?", `Paiement en espèces à la livraison, Orange Money (${S.orangeMoneyNumber}) ou MTN Mobile Money (${S.mtnMoneyNumber}).`],
      ["Combien de temps prend la livraison ?", "Le jour même pour la plupart des communes de Conakry si la commande est confirmée avant 16h. 2 à 5 jours pour l'intérieur du pays."],
      ["Vos produits sont-ils garantis ?", "Oui. Chaque produit a une garantie indiquée sur sa fiche (6 à 12 mois). Les produits sont testés avant livraison."],
      ["Puis-je venir en boutique ?", `Oui, choisissez « Retrait en boutique » lors de la commande. Horaires : ${S.hours}.`],
      ["Le produit que je cherche n'est pas sur le site ?", "Écrivez-nous sur WhatsApp : nous pouvons le commander pour vous."],
      ["Comment utiliser un code promo ?", "Saisissez votre code dans le panier ou à l'étape de commande puis cliquez sur « Appliquer »."]
    ];
    return content("Questions fréquentes", `<div class="faq">${qa.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`);
  }

  function pageContact() {
    document.title = `Contact – ${S.name}`;
    return `<div class="container page-head">${crumbs([["Contact"]])}<h1>Contactez-nous</h1></div>
      <div class="container contact-grid" style="padding-bottom:48px">
        <div class="panel info-list">
          <div><span class="ic">💬</span><div><b>WhatsApp</b><br><a class="link" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name} !`)}">${esc(S.phoneDisplay)}</a></div></div>
          <div><span class="ic">📞</span><div><b>Téléphone</b><br><a href="tel:+${S.whatsapp}">${esc(S.phoneDisplay)}</a></div></div>
          <div><span class="ic">✉️</span><div><b>Email</b><br><a href="mailto:${esc(S.email)}">${esc(S.email)}</a></div></div>
          <div><span class="ic">📍</span><div><b>Adresse</b><br>${esc(S.address)}</div></div>
          <div><span class="ic">🕘</span><div><b>Horaires</b><br>${esc(S.hours)}</div></div>
        </div>
        <form class="panel" id="contact-form">
          <h3>Envoyez-nous un message</h3>
          <div class="form-grid">
            <div class="field"><label for="c-name">Nom</label><input id="c-name" name="name" required></div>
            <div class="field"><label for="c-phone">Téléphone</label><input id="c-phone" name="phone" type="tel"></div>
            <div class="field full"><label for="c-msg">Message</label><textarea id="c-msg" name="message" rows="5" required></textarea></div>
          </div>
          <button class="btn btn-wa btn-block" style="margin-top:14px">Envoyer via WhatsApp</button>
        </form>
      </div>`;
  }

  function pageTerms() {
    return content("Conditions générales de vente", `
      <h2>1. Objet</h2><p>Les présentes conditions régissent les ventes réalisées par ${esc(S.name)} via ce site auprès de clients situés en République de Guinée.</p>
      <h2>2. Prix</h2><p>Les prix sont indiqués en francs guinéens (GNF), toutes taxes comprises. Les frais de livraison sont indiqués avant la confirmation de la commande. ${esc(S.name)} se réserve le droit de modifier ses prix à tout moment ; le prix appliqué est celui en vigueur au moment de la commande.</p>
      <h2>3. Commande</h2><p>La commande est définitive après confirmation par notre équipe (par WhatsApp ou téléphone). En cas d'indisponibilité, le client est informé et peut choisir un autre produit ou annuler.</p>
      <h2>4. Paiement</h2><p>Le paiement s'effectue à la livraison en espèces, ou par Orange Money / MTN Mobile Money. Pour les envois vers l'intérieur du pays, un paiement préalable peut être demandé.</p>
      <h2>5. Livraison</h2><p>Les délais sont donnés à titre indicatif. Le client vérifie le produit à la réception.</p>
      <h2>6. Garantie et retours</h2><p>Les produits bénéficient de la garantie indiquée sur leur fiche. Tout défaut doit être signalé dans les 7 jours suivant la réception. La garantie ne couvre pas la casse, l'oxydation ou une mauvaise utilisation.</p>
      <h2>7. Données personnelles</h2><p>Les informations saisies servent uniquement au traitement de votre commande et ne sont jamais revendues.</p>`);
  }

  function pageNotFound() {
    document.title = `Page introuvable – ${S.name}`;
    return `<div class="container" style="padding:48px 16px"><div class="empty"><div class="big">🤔</div><h2>Page introuvable</h2><p class="hint">Le lien est peut-être incorrect ou le produit n'existe plus.</p><a href="#/" class="btn btn-primary">Retour à l'accueil</a></div></div>`;
  }

  /* ---------- Routeur ---------- */
  function currentPath() { return (location.hash.slice(1) || "/").split("?")[0]; }
  function render() {
    const raw = location.hash.slice(1) || "/";
    const [path, query] = raw.split("?");
    const params = new URLSearchParams(query || "");
    const parts = path.split("/").filter(Boolean);
    let html;
    switch (parts[0]) {
      case undefined: html = pageHome(); break;
      case "boutique": html = pageShop(params); break;
      case "produit": html = pageProduct(decodeURIComponent(parts[1] || "")); break;
      case "panier": html = pageCart(); break;
      case "commande": html = pageCheckout(); break;
      case "merci": html = pageThanks(decodeURIComponent(parts[1] || "")); break;
      case "mes-commandes": html = pageOrders(); break;
      case "favoris": html = pageWish(); break;
      case "a-propos": html = pageAbout(); break;
      case "livraison": html = pageDelivery(); break;
      case "faq": html = pageFAQ(); break;
      case "contact": html = pageContact(); break;
      case "cgv": html = pageTerms(); break;
      default: html = pageNotFound();
    }
    app.innerHTML = html;
    $("#search-input").value = params.get("q") || "";
    $$("#catnav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + raw));
    closeDrawers();
  }

  function navigateShop(mutate) {
    const [, query] = (location.hash.slice(1) || "/").split("?");
    const params = new URLSearchParams(currentPath() === "/boutique" ? query || "" : "");
    mutate(params);
    [...params.keys()].forEach((k) => { if (!params.get(k)) params.delete(k); });
    const qs = params.toString();
    location.hash = "#/boutique" + (qs ? "?" + qs : "");
  }

  /* ---------- Événements ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-add],[data-wish],[data-inc],[data-dec],[data-remove],[data-padd],[data-pbuy],[data-pinc],[data-pdec],[data-close],[data-promo-remove],#filter-toggle");
    if (!el) return;
    const d = el.dataset;
    if (d.add) addToCart(d.add);
    else if (d.wish) { e.preventDefault(); toggleWish(d.wish); if (currentPath().startsWith("/produit")) el.textContent = wish.includes(d.wish) ? "♥ Dans vos favoris" : "♡ Ajouter aux favoris"; }
    else if (d.inc) { const l = cart.find((x) => x.id === d.inc); setQty(d.inc, l.qty + 1); refreshCartViews(); }
    else if (d.dec) { const l = cart.find((x) => x.id === d.dec); setQty(d.dec, l.qty - 1); refreshCartViews(); }
    else if (d.remove) { removeFromCart(d.remove); refreshCartViews(); toast("Produit retiré du panier"); }
    else if ("pinc" in d || "pdec" in d) { const i = $("#pqty"); i.value = Math.max(1, Math.min(Number(i.max), Number(i.value) + ("pinc" in d ? 1 : -1))); }
    else if (d.padd) addToCart(d.padd, Math.max(1, Number($("#pqty").value) || 1));
    else if (d.pbuy) { addToCart(d.pbuy, Math.max(1, Number($("#pqty").value) || 1)); location.hash = "#/commande"; }
    else if ("promoRemove" in d) { promo = ""; store.set("promo", ""); refreshCartViews(); }
    else if (el.id === "filter-toggle") $("#filters").classList.toggle("open");
    else if ("close" in d) closeDrawers();
  });

  function refreshCartViews() {
    const p = currentPath();
    if (p === "/panier") render();
    else if (p === "/commande") {
      const form = $("#checkout");
      if (form) store.set("customer", Object.fromEntries(new FormData(form)));
      render();
    }
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.qty) { setQty(t.dataset.qty, Number(t.value) || 1); refreshCartViews(); return; }
    if (t.id === "sort") return navigateShop((p) => p.set("sort", t.value));
    if (t.closest("#filters")) {
      const f = $("#filters");
      return navigateShop((p) => {
        p.set("cat", ($("input[name=cat]:checked", f) || {}).value || "");
        if (t.name === "cat") p.delete("brand");
        else p.set("brand", $$("input[name=brand]:checked", f).map((i) => i.value).join(","));
        p.set("min", $("input[name=min]", f).value);
        p.set("max", $("input[name=max]", f).value);
        p.set("promo", $("input[name=promo]", f).checked ? "1" : "");
        p.set("stock", $("input[name=stock]", f).checked ? "1" : "");
      });
    }
    const form = t.closest("#checkout");
    if (form) {
      store.set("customer", Object.fromEntries(new FormData(form)));
      if (t.name === "zone") $("#checkout-summary").innerHTML = summaryHTML(totals(t.value), true);
    }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.id === "search-form") {
      e.preventDefault();
      const q = $("#search-input").value.trim();
      location.hash = "#/boutique" + (q ? "?q=" + encodeURIComponent(q) : "");
    } else if (f.matches("[data-promo-form]")) {
      e.preventDefault();
      const code = f.elements.code.value.trim().toUpperCase();
      if (S.promoCodes[code]) { promo = code; store.set("promo", code); toast(`Code ${code} appliqué : -${S.promoCodes[code]}%`); refreshCartViews(); }
      else toast("Code promo invalide");
    } else if (f.id === "checkout") {
      e.preventDefault();
      submitCheckout(f);
    } else if (f.id === "contact-form") {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      window.open(waLink(`Bonjour ${S.name},\n\n${d.message}\n\n— ${d.name}${d.phone ? " (" + d.phone + ")" : ""}`), "_blank", "noopener");
      f.reset();
      toast("Ouverture de WhatsApp…");
    }
  });

  $("#cart-btn").addEventListener("click", () => { renderCartDrawer(); openDrawer("#cart-drawer"); });
  $("#menu-btn").addEventListener("click", () => openDrawer("#mobile-menu"));
  $("#overlay").addEventListener("click", closeDrawers);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawers(); });
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

  /* ---------- Gabarit (header, footer) ---------- */
  function renderShell() {
    const [first, ...rest] = S.name.split(" ");
    const logo = `<span class="logo-mark">${esc(S.logoText)}</span><span>${esc(first)}${rest.length ? ` <span class="accent">${esc(rest.join(" "))}</span>` : ""}</span>`;
    $("#logo").innerHTML = logo;
    $("#topbar-phone").textContent = `📞 ${S.phoneDisplay} · ${S.hours.split("·")[0].trim()}`;
    $("#catnav").innerHTML = `<div class="catnav-inner"><a href="#/boutique">Tout</a><a href="#/boutique?promo=1">🔥 Promos</a>${CATEGORIES.map((c) => `<a href="#/boutique?cat=${c.id}">${esc(c.name)}</a>`).join("")}</div>`;
    $("#mobile-menu-body").innerHTML = [
      ["#/", "🏠 Accueil"], ["#/boutique", "🛍️ Boutique"], ["#/boutique?promo=1", "🔥 Promotions"],
      ...CATEGORIES.map((c) => [`#/boutique?cat=${c.id}`, `　${c.name}`]),
      ["#/favoris", "♡ Mes favoris"], ["#/mes-commandes", "📦 Mes commandes"], ["#/livraison", "🚚 Livraison"], ["#/faq", "❓ FAQ"], ["#/contact", "💬 Contact"]
    ].map(([h, l]) => `<a class="mm-link" href="${h}">${esc(l)}</a>`).join("");
    $("#wa-float").href = waLink(`Bonjour ${S.name} !`);
    const socials = Object.entries(S.socials).filter(([, v]) => v);
    $("#footer").innerHTML = `
      <div><a href="#/" class="logo">${logo}</a><p>${esc(S.tagline)}.</p><p>📍 ${esc(S.address)}</p><p>📞 ${esc(S.phoneDisplay)}</p>
        <div class="pay-badges"><span>Orange Money</span><span>MTN MoMo</span><span>Espèces</span></div></div>
      <div><h4>Boutique</h4>${CATEGORIES.slice(0, 6).map((c) => `<a href="#/boutique?cat=${c.id}">${esc(c.name)}</a>`).join("")}<a href="#/boutique?promo=1">Promotions</a></div>
      <div><h4>Aide</h4><a href="#/livraison">Livraison & retours</a><a href="#/faq">FAQ</a><a href="#/mes-commandes">Suivre ma commande</a><a href="#/contact">Contact</a><a href="#/cgv">CGV</a><a href="#/a-propos">À propos</a></div>
      <div><h4>Besoin d'aide ?</h4><p>Notre équipe vous répond sur WhatsApp.</p><a class="btn btn-wa" style="display:inline-flex;color:#fff" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name} !`)}">Écrire sur WhatsApp</a>
        ${socials.length ? `<p style="margin-top:12px">${socials.map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener" style="display:inline;margin-right:10px">${k}</a>`).join("")}</p>` : ""}</div>`;
    $("#footer-bottom").innerHTML = `<span>© ${new Date().getFullYear()} ${esc(S.name)}. Tous droits réservés.</span><span>${esc(S.hours)}</span>`;
  }

  renderShell();
  updateBadges();
  renderCartDrawer();
  render();
})();
