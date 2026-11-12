/* =========================================================
   Venips – application de la boutique
   ========================================================= */
(function () {
  "use strict";

  const S = window.STORE;
  // Catalogue de secours (js/products.js), remplacé par la base Supabase dès qu'elle répond
  let PRODUCTS = window.PRODUCTS.filter((p) => p.stock > 0).map((p, i) => ({ ...p, position: i }));
  let CATEGORIES = window.CATEGORIES;
  const db = S.supabaseUrl && window.supabase
    ? window.supabase.createClient(S.supabaseUrl, S.supabaseKey)
    : null;

  /* ---------- Compte client ---------- */
  let user = null;
  let profile = null;
  let isAdmin = false;
  let recoveryMode = false;
  const ORDER_STATUS = { nouvelle: "Reçue", confirmee: "Confirmée", en_livraison: "En livraison", livree: "Livrée", annulee: "Annulée" };

  // Fournisseurs de connexion activés dans Supabase (le bouton Google n'apparaît que s'il est activé)
  let googleEnabled = (() => { try { return localStorage.getItem("ct_googleAuth") === "true"; } catch { return false; } })();
  async function loadProviders() {
    if (!db) return;
    try {
      const r = await fetch(`${S.supabaseUrl}/auth/v1/settings`, { headers: { apikey: S.supabaseKey } });
      const d = await r.json();
      googleEnabled = !!(d.external && d.external.google);
      store.set("googleAuth", googleEnabled);
    } catch { /* réseau indisponible : on garde la dernière valeur connue */ }
  }
  const GOOGLE_ICON = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  async function signInWithGoogle() {
    // Retour sur la racine du site, sans « # » : Google y ajoute la connexion (#access_token=…),
    // puis le démarrage de la boutique ouvre « Mon compte »
    const { error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/" } });
    if (error) accMsg("Connexion Google indisponible pour le moment. Utilisez votre email.", "err");
  }

  async function loadAccount() {
    if (!db) return;
    const { data } = await db.auth.getSession();
    user = data.session ? data.session.user : null;
    profile = null;
    isAdmin = false;
    if (user) {
      const [{ data: p }, { data: adm }] = await Promise.all([
        db.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        db.rpc("is_admin")
      ]);
      profile = p;
      isAdmin = adm === true;
    }
    const dot = document.getElementById("account-dot");
    if (dot) dot.hidden = !user;
    const adminLink = document.getElementById("admin-link");
    if (adminLink) adminLink.hidden = !isAdmin;
  }

  const AUTH_ERRORS = {
    "Invalid login credentials": "Email ou mot de passe incorrect.",
    "Email not confirmed": "Confirmez d'abord votre adresse : cliquez sur le lien reçu par email.",
    "User already registered": "Un compte existe déjà avec cet email. Connectez-vous.",
    "Password should be at least 8 characters": "Le mot de passe doit contenir au moins 8 caractères."
  };
  const authError = (e) => AUTH_ERRORS[e.message] || (/rate limit/i.test(e.message) ? "Trop de tentatives, réessayez dans quelques minutes." : e.message);

  // Caractéristiques : retire les puces « - », « ** », « : » et les titres vides venus de l'import
  function cleanSpecs(raw) {
    const out = {};
    Object.entries(raw || {}).forEach(([k, v]) => {
      const key = String(k).replace(/^[\s\-*•–]+|[\s*:]+$/g, "").trim();
      const val = String(v ?? "").replace(/^[\s\-*•–:]+|[\s*]+$/g, "").trim();
      if (key && val) out[key] = val;
    });
    return out;
  }

  // Note moyenne et nombre d'avis publiés d'un produit
  function ratingOf(rows, id) {
    const mine = rows.filter((r) => r.product_id === id);
    if (!mine.length) return { rating: 0, reviews: 0 };
    return { rating: Math.round((mine.reduce((a, r) => a + r.rating, 0) / mine.length) * 10) / 10, reviews: mine.length };
  }

  // Applique un instantané du catalogue (venant de la base ou du cache du navigateur)
  function applyCatalog(snap) {
    CATEGORIES = snap.categories;
    PRODUCTS = snap.products;
    S.deliveryZones = snap.zones;
    S.freeDeliveryFrom = snap.freeFrom;
  }

  async function loadCatalog() {
    if (!db) return null;
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("délai dépassé")), 8000));
      const [c, p, z, s, rv] = await Promise.race([Promise.all([
        db.from("categories").select("*").order("position"),
        // Seuls les produits en ligne et en stock (même pour un administrateur connecté)
        db.from("products").select("*").eq("active", true).gt("stock", 0).order("position").order("created_at"),
        db.from("delivery_zones").select("*").order("position"),
        db.from("shop_settings").select("*"),
        db.from("reviews").select("product_id,rating").eq("status", "publie")
      ]), timeout]);
      const err = c.error || p.error || z.error || s.error;
      if (err) throw err;
      const free = s.data.find((x) => x.key === "free_delivery_from");
      const snap = {
        v: 2,
        categories: c.data.map((x) => ({ id: x.id, name: x.name, icon: x.icon })),
        products: p.data.map((x) => ({
          id: x.id, name: x.name, brand: x.brand, category: x.category_id,
          price: Number(x.price), oldPrice: x.old_price ? Number(x.old_price) : null,
          stock: x.stock, featured: x.featured, badge: x.badge, description: x.description,
          specs: cleanSpecs(x.specs), color: x.color, image: x.image_url, images: x.images || [], position: x.position, createdAt: x.created_at,
          ...ratingOf(rv && !rv.error ? rv.data : [], x.id)
        })),
        zones: z.data.map((x) => ({ id: x.id, name: x.name, fee: Number(x.fee), delay: x.delay, freeEligible: x.free_eligible })),
        freeFrom: free ? Number(free.value) || 0 : S.freeDeliveryFrom
      };
      applyCatalog(snap);
      store.set("catalog", snap);
      return snap;
    } catch (e) {
      console.warn("Base indisponible, catalogue de secours utilisé.", e);
      return null;
    }
  }
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

  let cart = store.get("cart", []);
  let wish = store.get("wish", []);
  let promo = store.get("promo", "");
  let promoPct = store.get("promoPct", 0);
  let compare = store.get("compare", []);   // jusqu'à 3 produits à comparer
  const MAX_QTY = 10;           // limite par produit et par commande (vérifiée aussi par la base)
  let checkoutError = "";       // dernier refus de commande, affiché sur la page Commande
  let launchPct = store.get("launchPct", 0);
  let orders = store.get("orders", []);

  /* ---------- Icônes de l'interface (traits fins, couleur du texte) ---------- */
  const ICONS = {
    truck: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12.5h2"/><path d="M3 9h18"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    heart: '<path d="M12 20s-7-4.4-9.2-8.6A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5.4C19 15.6 12 20 12 20z"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    bag: '<path d="M6 7h12l1 14H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5l2-2.5M20 20v-5h-5"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    alert: '<path d="M12 3L2 20h20z"/><path d="M12 9v5M12 17h.01"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    mouse: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v3"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    drive: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 12h.01M11 12h6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    party: '<path d="M4 20l5-14 9 9z"/><path d="M14 4l.5 2M19 5l-1.5 1.5M20 10l-2-.5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    share: '<path d="M12 3v12M7 7l5-4 5 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/>',
    plus: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    dots: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
    compare: '<path d="M9 4v16M15 4v16"/><path d="M4 8l5-4 5 4"/><path d="M10 16l5 4 5-4"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 1-5-5L10 2"/><path d="M3 21l5-5"/>',
    swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M19 19v2H6"/>',
    sad: '<circle cx="12" cy="12" r="9"/><path d="M8.5 16a4.5 4.5 0 0 1 7 0M9 10h.01M15 10h.01"/>'
  };
  const ic = (name, size = 20, cls = "") => `<svg class="ui-ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  /* ---------- Noms de produits affichés proprement (la base n'est pas modifiée) ---------- */
  const ACRONYMS = new Set(["PC", "HDD", "SSD", "USB", "HDMI", "RAM", "LED", "SD", "TV", "HP", "MTN", "4K", "UHD", "OLED"]);
  const WORD_FIX = { cle: "clé", camera: "caméra", sdd: "SSD", ecran: "écran", etiquettes: "étiquettes" };
  const BRANDS = { hp: "HP", dell: "Dell", lenovo: "Lenovo", acer: "Acer", apple: "Apple", asus: "Asus", samsung: "Samsung", toshiba: "Toshiba", microsoft: "Microsoft" };
  function niceName(raw) {
    const words = String(raw || "").trim().split(/\s+/);
    const out = words.map((w, i) => {
      const lw = w.toLowerCase();
      if (BRANDS[lw]) return BRANDS[lw];
      if (/^hpx\d+$/i.test(w)) return "HP X" + w.slice(3);
      if (/^i[3579]$/i.test(w)) return lw;                       // i5, i7…
      if (/^\d+(th|e|eme|ème)$/i.test(w)) return lw.replace(/eme|ème/, "e");  // 10th, 11e
      let m = w.match(/^(\d+)\s*(giga|go|gb)$/i); if (m) return m[1] + " Go";
      m = w.match(/^(\d+)(t|to|tb)$/i); if (m) return m[1] + " To";
      m = w.match(/^([a-z]{3,})(\d)$/i); if (m) return (i === 0 ? cap(m[1].toLowerCase()) : m[1].toLowerCase()) + " " + m[2];
      if (/\d/.test(w)) return /^[a-z]{1,2}\d/i.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).replace(/^([a-z]?)(\d+)([a-z]*)$/i, (x, a, d, b) => a.toUpperCase() + d + (b.length > 1 ? b.toLowerCase() : b.toLowerCase())) : w;
      if (ACRONYMS.has(w.toUpperCase()) && w.length <= 4) return w.toUpperCase();
      if (WORD_FIX[lw]) return i === 0 ? cap(WORD_FIX[lw]) : WORD_FIX[lw];
      if (w === w.toUpperCase() && w.length > 2) return i === 0 ? cap(lw) : lw;   // MAJUSCULES → normal
      return i === 0 ? cap(w) : w;
    });
    return out.join(" ").replace(/\s+\/\s+/g, " / ");
  }
  function cap(w) { return w.charAt(0).toUpperCase() + w.slice(1); }

  // Petites étiquettes techniques lues dans le nom (et les caractéristiques saisies dans l'admin)
  function specChips(p) {
    const chips = [];
    const n = " " + String(p.name).toLowerCase() + " ";
    const sp = p.specs || {};
    const cpu = sp["Processeur"] || (n.match(/\bi([3579])\b/) ? "Core i" + n.match(/\bi([3579])\b/)[1] : "");
    if (cpu) chips.push(["cpu", cpu.replace(/^Intel /, "")]);
    const gen = n.match(/\b(\d{1,2})\s*(th|e|eme|ème)\b/);
    if (gen && !sp["Processeur"]) chips.push(["cpu", `${gen[1]}e gén.`]);
    const store = sp["Stockage"] || (n.match(/\b(\d+)\s*(giga|go|gb)\b/) ? n.match(/\b(\d+)\s*(giga|go|gb)\b/)[1] + " Go"
      : n.match(/\b(128|256|512)\b/) ? n.match(/\b(128|256|512)\b/)[1] + " Go"
      : n.match(/\b(\d)\s*(t|to|tb)\b/) ? n.match(/\b(\d)\s*(t|to|tb)\b/)[1] + " To" : "");
    if (store) chips.push(["drive", store]);
    if (sp["Mémoire"]) chips.push(["drive", sp["Mémoire"] + " RAM"]);
    if (/(\btouch\b|\btactile\b|x360|yoga|2 in 1)/.test(n) && !/non tactile/.test(n)) chips.push(["laptop", "Tactile"]);
    return chips.slice(0, 3);
  }
  const chipsHTML = (p) => { const c = specChips(p); return c.length ? `<div class="chips">${c.map(([i, t]) => `<span class="chip">${ic(i, 13)}${esc(t)}</span>`).join("")}</div>` : ""; };
  // Étiquette au-dessus du nom : la marque, sauf si le nom la contient déjà
  const kicker = (p) => (p.brand && !niceName(p.name).toLowerCase().startsWith(p.brand.toLowerCase()) ? p.brand : catName(p.category));

  /* ---------- Illustrations produits (SVG) ---------- */
  function icon(type, color = "#0f014c") {
    const c = color, a = "#00d1c7";
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
    return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c0b6e"/><stop offset=".55" stop-color="#0b9b93"/><stop offset="1" stop-color="#00f9ed"/></linearGradient></defs>${shapes[type] || shapes.charger}</svg>`;
  }
  const productIcon = (p) => {
    const cat = CATEGORIES.find((c) => c.id === p.category);
    let t = cat ? cat.icon : "charger";
    if (p.category === "audio" && /enceinte|speaker/i.test(p.name)) t = "speaker";
    return icon(t, p.color);
  };
  const media = (p) => (p.image
    ? `<img src="${esc(p.image)}" alt="${esc(niceName(p.name))}" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ready')" onerror="this.parentNode.classList.add('ready','broken')">`
    : productIcon(p));

  /* ---------- Panier / favoris ---------- */
  function saveCart() { store.set("cart", cart); updateBadges(); renderCartDrawer(); }
  function addToCart(id, qty = 1) {
    const p = byId(id);
    if (!p || p.stock <= 0) return toast("Produit en rupture de stock");
    const line = cart.find((l) => l.id === id);
    const current = line ? line.qty : 0;
    const next = Math.min(current + qty, p.stock, MAX_QTY);
    if (next === current) return toast(p.stock > MAX_QTY && current >= MAX_QTY ? `Maximum ${MAX_QTY} exemplaires par commande` : `Stock maximum atteint (${p.stock})`);
    if (line) line.qty = next; else cart.push({ id, qty: next });
    saveCart();
    toast(`✓ ${niceName(p.name)} ajouté au panier`);
    if (p.category === "ordinateurs" && !line && suggestAccessories(3).length) openDrawer("#cart-drawer");
  }

  /* ---------- Accessoires proposés avec un ordinateur ---------- */
  function suggestAccessories(n = 4) {
    const inCart = new Set(cart.map((l) => l.id));
    const priority = ["souris", "sac", "support", "clavier", "tapis", "hdmi", "disque", "coffret"];
    const score = (p) => { const k = priority.findIndex((w) => norm(p.name).includes(w)); return k === -1 ? 99 : k; };
    return PRODUCTS.filter((p) => p.category === "accessoires" && p.stock > 0 && !inCart.has(p.id))
      .sort((a, b) => score(a) - score(b) || (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.price - b.price)
      .filter((p, i, arr) => arr.findIndex((x) => score(x) === score(p) && score(p) !== 99) === i || score(p) === 99)
      .slice(0, n);
  }
  const cartHasLaptop = () => cart.some((l) => (byId(l.id) || {}).category === "ordinateurs");
  function upsellHTML(n, title = "Complétez votre achat") {
    const list = cartHasLaptop() ? suggestAccessories(n) : [];
    if (!list.length) return "";
    return `<div class="upsell"><h4>${ic("bag", 16)} ${title}</h4>${list.map((p) => `
      <div class="upsell-row">
        <a href="#/produit/${p.id}" class="upsell-img ${p.image ? "img-wait" : ""}">${media(p)}</a>
        <div><a href="#/produit/${p.id}" class="upsell-name">${esc(niceName(p.name))}</a><span>${money(p.price)}</span></div>
        <button class="upsell-add" data-add="${p.id}" aria-label="Ajouter">${ic("plus", 16)}</button>
      </div>`).join("")}</div>`;
  }
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  function setQty(id, qty) {
    const p = byId(id);
    const line = cart.find((l) => l.id === id);
    if (!line || !p) return;
    line.qty = Math.max(1, Math.min(qty, p.stock, MAX_QTY));
    saveCart();
  }
  function removeFromCart(id) { cart = cart.filter((l) => l.id !== id); saveCart(); }
  function toggleWish(id) {
    const on = wish.includes(id);
    wish = on ? wish.filter((w) => w !== id) : [...wish, id];
    store.set("wish", wish);
    updateBadges();
    toast(on ? "Retiré des favoris" : "Ajouté aux favoris");
    $$(`[data-wish="${id}"]`).forEach((b) => b.classList.toggle("on", !on));
    if (currentPath() === "/favoris") render();
  }

  function totals(zoneId) {
    const items = cart.map((l) => ({ ...l, p: byId(l.id) })).filter((l) => l.p);
    const subtotal = items.reduce((s, l) => s + l.p.price * l.qty, 0);
    const pct = promo ? promoPct : 0;
    const reduction = Math.round((subtotal * pct) / 100);
    const zone = S.deliveryZones.find((z) => z.id === zoneId);
    const eligible = zone ? zone.freeEligible !== false && zone.id !== "interieur" : true;
    const free = S.freeDeliveryFrom > 0 && subtotal - reduction >= S.freeDeliveryFrom && eligible;
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
      body.innerHTML = `<div class="empty" style="box-shadow:none"><div class="big">${ic("cart", 44)}</div><p>Votre panier est vide.</p><a href="#/boutique" class="btn btn-primary" data-close>Découvrir la boutique</a></div>`;
      return;
    }
    body.innerHTML = `
      ${t.items.map(lineHTML).join("")}
      ${upsellHTML(3)}
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
        <a href="#/produit/${l.p.id}" class="line-title">${esc(niceName(l.p.name))}</a>
        <div class="hint">${money(l.p.price)}</div>
        <div class="line-meta">
          <div class="qty sm"><button data-dec="${l.p.id}" aria-label="Diminuer">−</button><input type="number" value="${l.qty}" min="1" max="${Math.min(l.p.stock, MAX_QTY)}" data-qty="${l.p.id}" aria-label="Quantité"><button data-inc="${l.p.id}" aria-label="Augmenter">+</button></div>
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
    return `<div><div class="hint">${left > 0 ? `Plus que <b>${money(left)}</b> pour la livraison gratuite` : `Livraison gratuite à Conakry débloquée !`}</div><div class="progress"><div style="width:${pct}%"></div></div></div>`;
  }

  /* ---------- Composants ---------- */
  function cardHTML(p) {
    const off = discount(p);
    const on = wish.includes(p.id);
    return `<article class="card">
      <a href="#/produit/${p.id}" class="card-media ${p.image ? "img-wait" : ""}" aria-label="${esc(niceName(p.name))}">
        ${media(p)}
        ${p.stock <= 0 ? `<span class="badge out">Rupture</span>` : p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
        ${off ? `<span class="badge off">-${off}%</span>` : ""}
      </a>
      <button class="wish ${on ? "on" : ""}" data-wish="${p.id}" aria-label="Ajouter aux favoris">${ic("heart", 18)}</button>
      ${p.category === "ordinateurs" ? `<button class="cmp ${compare.includes(p.id) ? "on" : ""}" data-compare="${p.id}" aria-label="Comparer" title="Comparer">${ic("compare", 16)}</button>` : ""}
      <div class="card-body">
        <div class="card-brand">${esc(kicker(p))}</div>
        <a href="#/produit/${p.id}" class="card-title">${esc(niceName(p.name))}</a>
        ${chipsHTML(p)}
        ${p.rating ? `<div class="stars">${stars(p.rating)}<small>(${p.reviews})</small></div>` : ""}
        <div class="price"><strong>${money(p.price)}</strong>${p.oldPrice ? `<s>${money(p.oldPrice)}</s>` : ""}</div>
        <button class="btn btn-dark" data-add="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>${p.stock <= 0 ? "Indisponible" : `${ic("cart", 17)}Ajouter au panier`}</button>
      </div>
    </article>`;
  }

  const crumbs = (items) => `<div class="crumbs"><a href="#/">Accueil</a>${items.map(([label, href]) => ` › ${href ? `<a href="${href}">${esc(label)}</a>` : esc(label)}`).join("")}</div>`;

  /* ---------- Pages ---------- */
  function pageHome() {
    const featured = PRODUCTS.filter((p) => p.featured).slice(0, 8);
    const deals = PRODUCTS.filter((p) => discount(p) > 0).sort((a, b) => discount(b) - discount(a)).slice(0, 4);
    const best = [...PRODUCTS].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || b.position - a.position).slice(0, 4);
    // Vitrine : produits vedettes avec photo en priorité
    const withPhoto = [...featured, ...PRODUCTS].filter((p, i, arr) => p.image && arr.findIndex((x) => x.id === p.id) === i);
    const [star, ...side] = withPhoto.length ? withPhoto : PRODUCTS;
    const count = (cat) => PRODUCTS.filter((p) => p.category === cat).length;
    const catPhoto = (cat) => (PRODUCTS.find((p) => p.category === cat && p.featured && p.image) || PRODUCTS.find((p) => p.category === cat && p.image) || {}).image;
    const trust = [
      ["truck", "Livraison le jour même", "Partout à Conakry"],
      ["wallet", "Paiement à la livraison", "Ou Orange Money / MoMo"],
      ["shield", "Produits vérifiés", "Testés avant livraison"],
      ["chat", "Conseil sur WhatsApp", "Réponse rapide 7j/7"]
    ];
    const stats = S.stats || [];
    const brands = [...new Set(PRODUCTS.map((p) => p.brand).filter(Boolean))];
    const showcase = (p, big) => p ? `<a href="#/produit/${p.id}" class="show-card ${big ? "big" : ""}">
        <div class="show-img ${p.image ? "img-wait" : ""}">${media(p)}</div>
        <div class="show-txt"><span>${esc(kicker(p))}</span><strong>${esc(niceName(p.name))}</strong><em>${money(p.price)}</em></div>
      </a>` : "";
    document.title = `${S.name} – Ordinateurs portables et accessoires à Conakry`;
    return `
      <section class="hero">
        <div class="container hero-inner">
          <div class="hero-copy">
            <span class="eyebrow">${ic("pin", 14)} Conakry · Guinée</span>
            <h1>Votre ordinateur portable, <em>livré à Conakry</em>.</h1>
            <p>Ordinateurs portables HP, Dell, Lenovo et accessoires informatiques. Prix justes, paiement à la livraison ou par Mobile Money.</p>
            <div class="hero-actions">
              <a href="#/boutique" class="btn btn-primary">${ic("bag", 18)}Voir la boutique</a>
              <a href="${waLink(`Bonjour ${S.name}, j'ai une question sur vos produits.`)}" target="_blank" rel="noopener" class="btn btn-ghost">${ic("chat", 18)}Conseil sur WhatsApp</a>
            </div>
            ${stats.length ? `<div class="hero-stats">${stats.map((x) => `<div><strong>${esc(x.value)}</strong><span>${esc(x.label)}</span></div>`).join("")}</div>` : ""}
          </div>
          <div class="hero-show">
            ${showcase(star, true)}
            <div class="show-side">${side.slice(0, 2).map((p) => showcase(p, false)).join("")}</div>
          </div>
        </div>
      </section>

      <div class="container">
        <div class="trust">${trust.map(([i, t, d]) => `<div class="trust-item"><span class="ic">${ic(i, 22)}</span><div><strong>${t}</strong><small>${d}</small></div></div>`).join("")}</div>
      </div>

      <section class="section"><div class="container">
        <div class="section-head"><div><h2>Nos rayons</h2><p>Ordinateurs portables et accessoires pour votre poste de travail</p></div></div>
        <div class="cat-banners">${CATEGORIES.map((c) => { const img = catPhoto(c.id); return `
          <a href="#/boutique?cat=${c.id}" class="cat-banner">
            <div class="cat-banner-txt">
              <span class="cat-count">${count(c.id)} produit${count(c.id) > 1 ? "s" : ""}</span>
              <h3>${esc(c.name)}</h3>
              <span class="cat-link">Découvrir ${ic("arrow", 16)}</span>
            </div>
            <div class="cat-banner-img ${img ? "img-wait" : ""}">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ready')" onerror="this.parentNode.classList.add('ready','broken')">` : icon(c.icon)}</div>
          </a>`; }).join("")}</div>
      </div></section>

      <section class="section" style="padding-top:0"><div class="container">
        <div class="section-head"><div><h2>Produits vedettes</h2><p>Nos meilleures ventes du moment</p></div><a href="#/boutique" class="link">Tout voir ${ic("arrow", 16)}</a></div>
        <div class="grid">${featured.map(cardHTML).join("")}</div>
      </div></section>

      ${deals.length ? `<section class="section" style="padding-top:0"><div class="container">
        <div class="section-head"><div><h2>Offres du moment</h2><p>Les plus grosses réductions</p></div><a href="#/boutique?promo=1" class="link">Toutes les promos ${ic("arrow", 16)}</a></div>
        <div class="grid">${deals.map(cardHTML).join("")}</div>
      </div></section>` : ""}

      <section class="section why"><div class="container">
        <div class="why-grid">
          <div class="why-copy">
            <span class="eyebrow dark">Pourquoi Venips</span>
            <h2>Des ordinateurs fiables, un vendeur que vous pouvez joindre</h2>
            <p>Nous sélectionnons des ordinateurs portables professionnels de grandes marques et nous les livrons partout à Conakry. Vous ne payez qu'à la réception, et notre équipe reste joignable sur WhatsApp avant et après l'achat.</p>
            <a href="#/a-propos" class="link">En savoir plus ${ic("arrow", 16)}</a>
          </div>
          <div class="why-points">
            <div>${ic("check", 22)}<div><strong>Vérifiés avant livraison</strong><span>Chaque appareil est contrôlé avant de vous être remis.</span></div></div>
            <div>${ic("wallet", 22)}<div><strong>Zéro risque au paiement</strong><span>Espèces à la livraison, Orange Money ou MTN MoMo.</span></div></div>
            <div>${ic("truck", 22)}<div><strong>Livraison rapide</strong><span>Le jour même dans la plupart des communes de Conakry.</span></div></div>
            <div>${ic("chat", 22)}<div><strong>Un vrai service client</strong><span>Une question, un souci ? On vous répond sur WhatsApp.</span></div></div>
          </div>
        </div>
        ${brands.length ? `<div class="brands"><span>Les marques que nous proposons</span><div>${brands.map((b) => `<b>${esc(b)}</b>`).join("")}</div></div>` : ""}
      </div></section>

      <section class="section"><div class="container">
        <div class="section-head"><div><h2>Nouveautés</h2><p>Les derniers arrivages</p></div><a href="#/boutique" class="link">Tout voir ${ic("arrow", 16)}</a></div>
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
      "promo": (a, b) => discount(b) - discount(a),
      "pertinence": (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.position - b.position
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
            <button class="btn btn-outline filter-toggle" id="filter-toggle">${ic("filter", 16)}Filtres</button>
            <span class="hint">${list.length} produit${list.length > 1 ? "s" : ""}</span>
            <select id="sort" aria-label="Trier">
              <option value="pertinence" ${sort === "pertinence" ? "selected" : ""}>Trier : pertinence</option>
              <option value="prix-asc" ${sort === "prix-asc" ? "selected" : ""}>Prix croissant</option>
              <option value="prix-desc" ${sort === "prix-desc" ? "selected" : ""}>Prix décroissant</option>
              <option value="promo" ${sort === "promo" ? "selected" : ""}>Plus grosses remises</option>
            </select>
          </div>
          ${list.length ? `<div class="grid">${list.map(cardHTML).join("")}</div>` : `<div class="empty"><div class="big">${ic("search", 44)}</div><h3>Aucun produit trouvé</h3><p class="hint">Essayez d'autres mots-clés ou retirez des filtres.</p><p><a href="${waLink(`Bonjour, je cherche : ${q || "un produit"}. Est-ce disponible ?`)}" target="_blank" rel="noopener" class="btn btn-wa">Demander sur WhatsApp</a></p></div>`}
        </div>
      </div>`;
  }

  function pageProduct(id) {
    const p = byId(id);
    if (!p) return pageSoldOut(id);
    const off = discount(p);
    const on = wish.includes(p.id);
    setTimeout(() => loadReviews(p.id));
    const related = PRODUCTS.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
    const gallery = p.image ? [p.image, ...(p.images || [])] : [];
    currentGallery = gallery;
    galleryIndex = 0;
    const stockHTML = p.stock <= 0 ? `<div class="stock no">${ic("close", 16)}Rupture de stock</div>` : p.stock <= 5 ? `<div class="stock low">${ic("alert", 16)}Plus que ${p.stock} en stock – commandez vite</div>` : `<div class="stock ok">${ic("check", 16)}En stock, prêt à être livré</div>`;
    document.title = `${niceName(p.name)} – ${S.name}`;
    return `
      <div class="container page-head">${crumbs([["Boutique", "#/boutique"], [catName(p.category), `#/boutique?cat=${p.category}`], [niceName(p.name)]])}</div>
      <div class="container product">
        <div>
          <div class="gallery ${gallery.length > 1 ? "has-thumbs" : ""}">
            ${gallery.length > 1 ? `<div class="thumbs">${gallery.map((u, i) => `<button class="thumb ${i === 0 ? "on" : ""}" data-img="${i}" aria-label="Voir l'image ${i + 1}"><img src="${esc(u)}" alt="" referrerpolicy="no-referrer" onerror="this.closest('.thumb').remove()"></button>`).join("")}</div>` : ""}
            <div class="product-media ${gallery.length ? "zoomable img-wait" : ""}" id="main-media" ${gallery.length ? "data-open-viewer" : ""}>${media(p)}${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}${gallery.length ? `<span class="zoom-hint">${ic("zoom", 14)}Cliquez pour agrandir</span>` : ""}</div>
          </div>
        </div>
        <div class="product-info">
          <div class="card-brand">${esc(kicker(p))}</div>
          <h1>${esc(niceName(p.name))}</h1>
          ${chipsHTML(p)}
          ${p.rating ? `<a href="#reviews" class="stars" data-scroll-reviews>${stars(p.rating)}<small>${p.rating}/5 · ${p.reviews} avis</small></a>` : ""}
          <div class="price" style="margin-top:12px"><strong>${money(p.price)}</strong>${p.oldPrice ? `<s>${money(p.oldPrice)}</s><span class="saving">-${off}% · Économisez ${money(p.oldPrice - p.price)}</span>` : ""}</div>
          ${stockHTML}
          <p>${esc(p.description)}</p>
          ${p.stock > 0 ? `
          <div class="buy-row">
            <div class="qty"><button data-pdec aria-label="Diminuer">−</button><input type="number" id="pqty" value="1" min="1" max="${Math.min(p.stock, MAX_QTY)}" aria-label="Quantité"><button data-pinc aria-label="Augmenter">+</button></div>
            <button class="btn btn-primary" data-padd="${p.id}">${ic("cart", 18)}Ajouter au panier</button>
          </div>
          <div class="buy-row" style="margin-top:0">
            <button class="btn btn-dark" data-pbuy="${p.id}">Acheter maintenant</button>
            <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name}, je suis intéressé(e) par : ${niceName(p.name)} (${money(p.price)}). Est-il disponible ?`)}">${ic("chat", 18)}WhatsApp</a>
          </div>` : `<a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="${waLink(`Bonjour, quand le produit ${p.name} sera-t-il de nouveau disponible ?`)}">Être prévenu du retour en stock</a>`}
          <div class="buy-row" style="margin-top:0">
            <button class="btn btn-outline wish-btn ${on ? "on" : ""}" data-wish="${p.id}">${ic("heart", 18)}${on ? "Dans vos favoris" : "Ajouter aux favoris"}</button>
            ${p.category === "ordinateurs" ? `<button class="btn btn-outline cmp-btn ${compare.includes(p.id) ? "on" : ""}" data-compare="${p.id}">${ic("compare", 18)}${compare.includes(p.id) ? "Dans le comparateur" : "Comparer"}</button>` : ""}
          </div>
          <div class="perks">
            <div>${ic("truck")}<span>Livraison à Conakry le jour même · dès ${money(Math.min(...S.deliveryZones.filter((z) => z.fee > 0).map((z) => z.fee)))}</span></div>
            <div>${ic("wallet")}<span>Paiement à la livraison, Orange Money ou MTN MoMo</span></div>
            <div>${ic("shield")}<span>Garantie : ${esc(p.specs["Garantie"] || "selon produit")}</span></div>
            <div>${ic("refresh")}<span>Échange sous 7 jours en cas de défaut</span></div>
          </div>
        </div>
      </div>
      <section class="container" style="padding-bottom:32px">
        <h2>Caractéristiques</h2>
        <table class="specs">${Object.entries(p.specs).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}${p.brand ? `<tr><th>Marque</th><td>${esc(p.brand)}</td></tr>` : ""}<tr><th>Catégorie</th><td>${esc(catName(p.category))}</td></tr></table>
      </section>
      ${p.category === "ordinateurs" && accessoriesFor().length ? `<section class="section" style="padding-top:8px"><div class="container"><div class="section-head"><div><h2>Complétez votre poste de travail</h2><p>Les accessoires souvent achetés avec un ordinateur</p></div></div><div class="grid">${accessoriesFor().map(cardHTML).join("")}</div></div></section>` : ""}
      <section class="container reviews" id="reviews" data-reviews="${p.id}"><h2>Avis clients</h2><div class="reviews-body"><p class="hint">Chargement des avis…</p></div></section>
      ${related.length ? `<section class="section" style="padding-top:8px"><div class="container"><div class="section-head"><h2>Vous aimerez aussi</h2></div><div class="grid">${related.map(cardHTML).join("")}</div></div></section>` : ""}`;
  }
  function accessoriesFor() {
    const inCart = new Set(cart.map((l) => l.id));
    return PRODUCTS.filter((x) => x.category === "accessoires" && !inCart.has(x.id)).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.price - b.price).slice(0, 4);
  }

  /* ---------- Avis clients ---------- */
  async function loadReviews(pid) {
    const box = document.querySelector(`[data-reviews="${pid}"] .reviews-body`);
    if (!box || !db) { if (box) box.innerHTML = `<p class="hint">Aucun avis pour le moment.</p>`; return; }
    const [{ data: list }, { data: can }] = await Promise.all([
      db.from("reviews").select("author,rating,comment,created_at").eq("product_id", pid).eq("status", "publie").order("created_at", { ascending: false }).limit(30),
      user ? db.rpc("can_review", { p_product: pid }) : Promise.resolve({ data: false })
    ]);
    const rows = list || [];
    const avg = rows.length ? Math.round((rows.reduce((a, r) => a + r.rating, 0) / rows.length) * 10) / 10 : 0;
    box.innerHTML = `
      ${rows.length ? `<div class="rv-summary"><strong>${avg}</strong><div><span class="stars">${stars(avg)}</span><small>${rows.length} avis vérifié${rows.length > 1 ? "s" : ""}</small></div></div>` : `<p class="hint">Aucun avis pour le moment. Les avis sont laissés uniquement par des clients ayant reçu ce produit.</p>`}
      ${rows.map((r) => `<div class="rv"><div class="rv-head"><b>${esc(r.author)}</b><span class="stars">${stars(r.rating)}</span><small>${new Date(r.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} · ${ic("check", 13)} Achat vérifié</small></div>${r.comment ? `<p>${esc(r.comment)}</p>` : ""}</div>`).join("")}
      ${can ? `<form class="rv-form" id="review-form" data-pid="${pid}">
        <h3>Donnez votre avis</h3>
        <div class="rv-stars" role="radiogroup" aria-label="Votre note">${[5, 4, 3, 2, 1].map((n) => `<label title="${n}/5"><input type="radio" name="rating" value="${n}" ${n === 5 ? "checked" : ""}><span>★</span></label>`).join("")}</div>
        <textarea name="comment" rows="3" maxlength="1000" placeholder="Qu'avez-vous pensé de ce produit ? (facultatif)"></textarea>
        <button class="btn btn-primary">Publier mon avis</button>
        <p class="hint">Votre avis sera visible après vérification par notre équipe.</p>
      </form>` : ""}`;
  }

  /* ---------- Produit épuisé : « Me prévenir du retour » ---------- */
  function pageSoldOut(id) {
    document.title = `Produit épuisé – ${S.name}`;
    setTimeout(async () => {
      const box = document.getElementById("soldout");
      if (!box) return;
      const { data } = db ? await db.rpc("product_teaser", { p_id: id }) : { data: null };
      if (!data) { box.outerHTML = pageNotFound(); return; }
      const pp = { ...data, image: data.image, category: data.category, color: "#334155" };
      const prof = profile || {};
      box.innerHTML = `<div class="soldout">
        <div class="soldout-media ${pp.image ? "img-wait" : ""}">${media(pp)}</div>
        <div>
          <span class="pill-out">Bientôt de retour</span>
          <h1>${esc(niceName(data.name))}</h1>
          <p class="hint">Ce produit est épuisé pour le moment. Laissez votre numéro : nous vous prévenons dès qu'il revient en stock.</p>
          <form class="request-form" id="request-form" data-type="alerte" data-product="${esc(id)}" novalidate>
            <div class="form-grid">
              <div class="field"><label for="al-name">Nom</label><input id="al-name" name="name" value="${esc(prof.full_name || "")}" required></div>
              <div class="field"><label for="al-phone">Téléphone</label><input id="al-phone" name="phone" type="tel" placeholder="6XX XX XX XX" value="${esc((prof.phone || "").replace(/^\+224\s?/, ""))}" required></div>
            </div>
            <button class="btn btn-primary btn-block" style="margin-top:12px">${ic("bell", 18)}Me prévenir du retour en stock</button>
          </form>
          <a class="link" href="#/boutique?cat=${esc(data.category)}" style="display:inline-flex;margin-top:14px">Voir les produits similaires disponibles ${ic("arrow", 16)}</a>
        </div></div>`;
    });
    return `<div class="container page-head">${crumbs([["Boutique", "#/boutique"], ["Produit épuisé"]])}</div><div class="container" style="padding-bottom:48px"><div class="panel" id="soldout"><p class="hint">Chargement…</p></div></div>`;
  }

  function pageCart() {
    const t = totals();
    document.title = `Panier – ${S.name}`;
    if (!t.items.length) {
      return `<div class="container page-head"><h1>Mon panier</h1></div><div class="container" style="padding-bottom:48px"><div class="empty"><div class="big">${ic("cart", 44)}</div><h3>Votre panier est vide</h3><p class="hint">Ajoutez des produits pour passer commande.</p><a href="#/boutique" class="btn btn-primary">Continuer mes achats</a></div></div>`;
    }
    return `
      <div class="container page-head">${crumbs([["Panier"]])}<h1>Mon panier (${t.count})</h1></div>
      <div class="container cart-layout">
        <div class="panel">${t.items.map(lineHTML).join("")}<a href="#/boutique" class="link" style="display:inline-flex;align-items:center;gap:6px;margin-top:12px">${ic("back", 16)}Continuer mes achats</a>${upsellHTML(4, "Souvent achetés avec un ordinateur")}</div>
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
    const saved = store.get("customer", {});
    const fromProfile = profile ? {
      name: profile.full_name, phone: (profile.phone || "").replace(/^\+224\s?/, ""), email: user.email,
      address: profile.address, zone: profile.zone_id || ""
    } : {};
    const draft = {};
    ["name", "phone", "email", "address", "zone", "notes", "payment"].forEach((k) => { draft[k] = saved[k] || fromProfile[k] || ""; });
    const t = totals(draft.zone);
    document.title = `Commande – ${S.name}`;
    if (!t.items.length) { location.hash = "#/panier"; return ""; }
    return `
      <div class="container page-head">${crumbs([["Panier", "#/panier"], ["Commande"]])}<h1>Finaliser ma commande</h1></div>
      <form class="container cart-layout" id="checkout" novalidate>
        <div class="panel">
          ${!db ? "" : user
            ? `<div class="account-note">${ic("user", 16)} Connecté(e) : <b>${esc(user.email)}</b> — cette commande sera ajoutée à votre compte.</div>`
            : `<div class="account-note">Vous avez un compte ? <a href="#/compte" class="link">Connectez-vous</a> pour retrouver vos commandes. Vous pouvez aussi commander sans compte.</div>`}
          ${checkoutError ? `<div class="checkout-error">${ic("alert", 22)}<div>
            <b>Votre commande n'a pas été envoyée</b><p>${esc(checkoutError)}</p>
            <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name}, je n'arrive pas à passer ma commande sur le site : ${checkoutError}`)}">${ic("chat", 16)}Écrire sur WhatsApp</a>
          </div></div>` : ""}
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

  async function submitCheckout(form) {
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
    const pay = S.payments.find((m) => m.id === data.payment) || S.payments[0];
    const customer = { name: data.name.trim(), phone: "+224 " + digits.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4"), email: (data.email || "").trim(), address: data.address.trim(), notes: (data.notes || "").trim() };
    const order = {
      id: `VN-${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      date: now.toISOString(),
      items: t.items.map((l) => ({ id: l.p.id, name: l.p.name, price: l.p.price, qty: l.qty })),
      subtotal: t.subtotal, reduction: t.reduction, promo, delivery: t.delivery, total: t.total,
      zone: t.zone.name, payment: pay.name, paymentId: pay.id, customer
    };

    checkoutError = "";
    // Ouvert tout de suite (dans le clic) pour ne pas être bloqué par le navigateur
    const waWindow = window.open("", "_blank");
    const button = $("button[type=submit]", form);
    button.disabled = true;
    button.textContent = "Envoi de la commande…";

    let saved = null;
    if (db) {
      const { data: res, error } = await db.rpc("place_order", {
        p_order: { items: order.items.map((i) => ({ id: i.id, qty: i.qty })), name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, notes: customer.notes, zone: data.zone, payment: pay.name, promo }
      });
      if (error && error.code === "P0001") {
        // Refus métier (stock insuffisant, produit retiré…) : on prévient le client
        if (waWindow) waWindow.close();
        button.disabled = false;
        button.textContent = "✓ Confirmer et envoyer sur WhatsApp";
        checkoutError = error.message;
        render();
        window.scrollTo(0, 0);
        loadCatalog().then(() => { cart = cart.filter((l) => byId(l.id)); saveCart(); render(); });
        return;
      }
      if (error) console.warn("Commande non enregistrée en base, envoi WhatsApp seulement.", error);
      saved = res;
    }
    if (saved) Object.assign(order, { id: saved.id, items: saved.items, subtotal: saved.subtotal, reduction: saved.reduction, promo: saved.promo || "", delivery: saved.delivery, total: saved.total, zone: saved.zone });

    orders = [order, ...orders].slice(0, 50);
    store.set("orders", orders);
    cart = []; promo = ""; promoPct = 0;
    store.set("promo", ""); store.set("promoPct", 0);
    saveCart();
    const link = waLink(orderMessage(order));
    if (waWindow) waWindow.location.href = link; else window.open(link, "_blank", "noopener");
    location.hash = `#/merci/${order.id}`;
    if (saved) loadCatalog();
  }

  function pageThanks(id) {
    const o = orders.find((x) => x.id === id);
    if (!o) return pageNotFound();
    document.title = `Commande ${o.id} – ${S.name}`;
    const payInfo = o.paymentId === "orange" ? `<p>${ic("phone", 16)} Envoyez <b>${money(o.total)}</b> par Orange Money au <b>${esc(S.orangeMoneyNumber)}</b> puis partagez la capture sur WhatsApp.</p>`
      : o.paymentId === "mtn" ? `<p>${ic("phone", 16)} Envoyez <b>${money(o.total)}</b> par MTN MoMo au <b>${esc(S.mtnMoneyNumber)}</b> puis partagez la capture sur WhatsApp.</p>`
      : `<p>${ic("wallet", 16)} Préparez <b>${money(o.total)}</b> en espèces pour la livraison.</p>`;
    return `<div class="container"><div class="panel success">
      <div class="check">${ic("check", 36)}</div>
      <h1>Merci ${esc(o.customer.name.split(" ")[0])} !</h1>
      <p>Votre commande <b>${o.id}</b> a été enregistrée. Si WhatsApp ne s'est pas ouvert, cliquez sur le bouton ci-dessous pour nous l'envoyer — nous la confirmerons rapidement.</p>
      <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(orderMessage(o))}">Envoyer ma commande sur WhatsApp</a>
      <div class="order-box">
        ${o.items.map((i) => `<div class="sum-row"><span>${i.qty} × ${esc(i.name)}</span><span>${money(i.price * i.qty)}</span></div>`).join("")}
        <div class="sum-row"><span>Livraison (${esc(o.zone)})</span><span>${o.delivery ? money(o.delivery) : "Gratuite"}</span></div>
        <div class="sum-row total"><span>Total</span><span>${money(o.total)}</span></div>
        ${payInfo}
      </div>
      <button class="btn btn-outline" data-receipt-local="${esc(o.id)}">${ic("receipt", 18)}Bon de commande (PDF)</button>
      <a href="#/boutique" class="btn btn-outline">Continuer mes achats</a> <a href="#/mes-commandes" class="btn btn-outline">Mes commandes</a>
    </div></div>`;
  }

  function pageOrders() {
    if (user) { setTimeout(() => { location.hash = "#/compte"; }); return ""; }
    document.title = `Mes commandes – ${S.name}`;
    return `<div class="container page-head">${crumbs([["Mes commandes"]])}<h1>Mes commandes</h1></div>
      <div class="container" style="padding-bottom:48px">
      ${db ? `<div class="account-note">Créez un compte ou <a href="#/compte" class="link">connectez-vous</a> pour retrouver vos commandes sur tous vos appareils. Ci-dessous : les commandes passées depuis cet appareil.</div>` : ""}
      <div class="panel orders">
        ${orders.length ? orders.map((o) => `<div class="order">
          <div class="order-head"><span>${o.id}</span><span>${new Date(o.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span></div>
          <p class="hint" style="margin:6px 0">${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join(" · ")}</p>
          <div class="order-head"><span>${money(o.total)} · ${esc(o.payment)}</span><a class="link" target="_blank" rel="noopener" href="${waLink(`Bonjour, je souhaite suivre ma commande ${o.id}.`)}">Suivre sur WhatsApp →</a></div>
        </div>`).join("") : `<div class="empty" style="box-shadow:none"><div class="big">${ic("box", 44)}</div><p>Aucune commande passée depuis cet appareil.</p><a href="#/boutique" class="btn btn-primary">Commencer mes achats</a></div>`}
      </div></div>`;
  }

  function pageAccount() {
    document.title = `Mon compte – ${S.name}`;
    if (!db) return pageNotFound();
    const head = (title) => `<div class="container page-head">${crumbs([["Mon compte"]])}<h1>${title}</h1></div>`;
    if (recoveryMode && user) {
      return `${head("Nouveau mot de passe")}<div class="container" style="padding-bottom:48px;max-width:520px"><div class="panel">
        <form id="newpass-form" style="display:grid;gap:14px">
          <div class="field"><label for="np-pass">Nouveau mot de passe</label><input id="np-pass" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
          <button class="btn btn-primary">Enregistrer</button>
        </form></div></div>`;
    }
    if (!user) {
      return `${head("Mon compte")}
        <div class="container"><div id="acc-msg"></div></div>
        ${googleEnabled ? `<div class="container"><div class="panel google-box">
          <button type="button" class="btn-google" data-google>${GOOGLE_ICON}<span>Continuer avec Google</span></button>
          <p class="hint">Connexion ou création de compte en un clic, sans mot de passe.</p>
          <div class="or-sep"><span>ou avec votre email</span></div>
        </div></div>` : ""}
        <div class="container account-grid">
          <div class="panel">
            <h3>J'ai déjà un compte</h3>
            <form id="login-form" novalidate>
              <div class="field"><label for="l-email">Email</label><input id="l-email" name="email" type="email" autocomplete="email" required></div>
              <div class="field"><label for="l-pass">Mot de passe</label><input id="l-pass" name="password" type="password" autocomplete="current-password" required></div>
              <button class="btn btn-dark">Se connecter</button>
              <button type="button" class="link" data-forgot style="border:0;background:none;padding:0;justify-self:start">Mot de passe oublié ?</button>
            </form>
          </div>
          <div class="panel">
            <h3>Créer mon compte client</h3>
            <p class="hint" style="margin-top:-6px">Suivez vos commandes et commandez plus vite : vos coordonnées sont pré-remplies.</p>
            <form id="signup-form" novalidate>
              <div class="field"><label for="s-name">Nom complet</label><input id="s-name" name="name" autocomplete="name" required></div>
              <div class="field"><label for="s-phone">Téléphone</label><input id="s-phone" name="phone" type="tel" autocomplete="tel" placeholder="6XX XX XX XX" required></div>
              <div class="field"><label for="s-email">Email</label><input id="s-email" name="email" type="email" autocomplete="email" required></div>
              <div class="field"><label for="s-pass">Mot de passe <small class="hint">(8 caractères minimum)</small></label><input id="s-pass" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
              <button class="btn btn-primary">Créer mon compte</button>
            </form>
          </div>
        </div>`;
    }
    setTimeout(loadMyOrders);
    const p = profile || {};
    return `${head(`Bonjour ${esc((p.full_name || "").split(" ")[0] || "")}`)}
      ${isAdmin ? `<div class="container"><div class="admin-banner">
        <div><strong>${ic("lock", 18)} Vous êtes administrateur</strong><span>Gérez les commandes, les produits, les prix, les images et les clients.</span></div>
        <a href="admin.html" class="btn btn-primary">Ouvrir l'espace admin →</a>
      </div></div>` : ""}
      <div class="container"><div id="acc-msg"></div></div>
      <div class="container account-grid">
        <div class="panel">
          <div class="account-head"><h3 style="margin:0">Mes commandes</h3><a href="#/boutique" class="link">Continuer mes achats →</a></div>
          <div id="my-orders" class="orders" style="margin-top:14px"><p class="hint">Chargement…</p></div>
        </div>
        <div class="panel" style="align-self:start">
          <h3>Mes informations</h3>
          <p class="hint" style="margin-top:-6px">${esc(user.email)}</p>
          <form id="profile-form" novalidate>
            <div class="field"><label for="p-name">Nom complet</label><input id="p-name" name="name" value="${esc(p.full_name)}" autocomplete="name"></div>
            <div class="field"><label for="p-phone">Téléphone</label><input id="p-phone" name="phone" type="tel" value="${esc((p.phone || "").replace(/^\+224\s?/, ""))}" placeholder="6XX XX XX XX"></div>
            <div class="field"><label for="p-zone">Zone de livraison</label><select id="p-zone" name="zone"><option value="">—</option>${S.deliveryZones.map((z) => `<option value="${z.id}" ${p.zone_id === z.id ? "selected" : ""}>${esc(z.name)}</option>`).join("")}</select></div>
            <div class="field"><label for="p-address">Quartier / adresse</label><input id="p-address" name="address" value="${esc(p.address)}"></div>
            <button class="btn btn-dark">Enregistrer</button>
          </form>
          <button class="btn btn-outline btn-block" data-logout style="margin-top:14px">Se déconnecter</button>
        </div>
      </div>`;
  }

  async function loadMyOrders() {
    const box = document.getElementById("my-orders");
    if (!box || !user) return;
    const { data, error } = await db.from("orders").select("id,created_at,status,items,total,payment,zone_name")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (error) { box.innerHTML = `<p class="hint">Impossible de charger vos commandes pour le moment.</p>`; return; }
    box.innerHTML = data.length ? data.map((o) => `<div class="order">
        <div class="order-head"><span>${esc(o.id)}</span><span class="status-pill ${o.status}">${ORDER_STATUS[o.status] || o.status}</span></div>
        <p class="hint" style="margin:6px 0">${new Date(o.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} · ${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join(" · ")}</p>
        <div class="order-head"><span>${money(o.total)} · ${esc(o.payment)}</span><span class="order-links"><button class="link-btn" data-receipt="${esc(o.id)}">${ic("receipt", 15)}${o.status === "livree" ? "Facture" : "Bon de commande"}</button><a class="link" target="_blank" rel="noopener" href="${waLink(`Bonjour, je souhaite suivre ma commande ${o.id}.`)}">Suivre sur WhatsApp →</a></span></div>
      </div>`).join("")
      : `<div class="empty" style="box-shadow:none;padding:30px 0"><div class="big">${ic("box", 44)}</div><p>Aucune commande pour le moment.</p><a href="#/boutique" class="btn btn-primary">Découvrir la boutique</a></div>`;
  }

  async function openReceipt(id) {
    const { data, error } = await db.from("orders").select("*").eq("id", id).maybeSingle();
    if (error || !data) return toast("Document indisponible pour le moment");
    window.VenipsInvoice && window.VenipsInvoice.open(data);
  }
  function openLocalReceipt(id) {
    const o = orders.find((x) => x.id === id);
    if (!o || !window.VenipsInvoice) return;
    window.VenipsInvoice.open({ id: o.id, created_at: o.date, status: "nouvelle", customer_name: o.customer.name, customer_phone: o.customer.phone, customer_email: o.customer.email,
      address: o.customer.address, zone_name: o.zone, payment: o.payment, items: o.items, subtotal: o.subtotal, reduction: o.reduction, promo_code: o.promo, delivery: o.delivery, total: o.total });
  }

  function accMsg(html, kind = "") {
    const el = document.getElementById("acc-msg");
    if (el) { el.innerHTML = `<div class="account-note" style="${kind === "err" ? "background:#fee2e2;border-color:#fecaca;color:#991b1b" : ""}">${html}</div>`; el.scrollIntoView({ block: "nearest" }); }
  }

  async function submitAccountForm(f) {
    const d = Object.fromEntries(new FormData(f));
    const btn = $("button:not([type=button])", f);
    const busy = (on) => { if (btn) btn.disabled = on; };
    if (f.id === "login-form") {
      if (!d.email || !d.password) return accMsg("Saisissez votre email et votre mot de passe.", "err");
      busy(true);
      const { error } = await db.auth.signInWithPassword({ email: d.email.trim(), password: d.password });
      busy(false);
      if (error) return accMsg(esc(authError(error)), "err");
      await loadAccount(); render(); toast("Connexion réussie");
    } else if (f.id === "signup-form") {
      const digits = (d.phone || "").replace(/\D/g, "").replace(/^(00)?224/, "");
      if ((d.name || "").trim().length < 3) return accMsg("Indiquez votre nom complet.", "err");
      if (!/^6\d{8}$/.test(digits)) return accMsg("Numéro guinéen invalide (9 chiffres, commence par 6).", "err");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || "")) return accMsg("Adresse email invalide.", "err");
      if ((d.password || "").length < 8) return accMsg("Le mot de passe doit contenir au moins 8 caractères.", "err");
      busy(true);
      const { data, error } = await db.auth.signUp({
        email: d.email.trim(), password: d.password,
        options: { data: { full_name: d.name.trim(), phone: "+224 " + digits.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4") }, emailRedirectTo: location.origin + location.pathname + "#/compte" }
      });
      busy(false);
      if (error) return accMsg(esc(authError(error)), "err");
      if (data.session) { await loadAccount(); render(); toast("Bienvenue ! Votre compte est créé."); return; }
      f.reset();
      accMsg(`✓ Compte créé. Ouvrez l'email envoyé à <b>${esc(d.email.trim())}</b> et cliquez sur le lien de confirmation, puis connectez-vous ici. (Pensez à vérifier les spams.)`);
    } else if (f.id === "profile-form") {
      const digits = (d.phone || "").replace(/\D/g, "").replace(/^(00)?224/, "");
      if (digits && !/^6\d{8}$/.test(digits)) return accMsg("Numéro guinéen invalide (9 chiffres, commence par 6).", "err");
      busy(true);
      const { data, error } = await db.from("customer_profiles").update({
        full_name: (d.name || "").trim(), address: (d.address || "").trim(), zone_id: d.zone || null,
        phone: digits ? "+224 " + digits.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4") : ""
      }).eq("user_id", user.id).select().maybeSingle();
      busy(false);
      if (error || !data) return accMsg("Enregistrement impossible, réessayez.", "err");
      profile = data;
      store.set("customer", {});
      toast("Informations enregistrées ✓");
    } else if (f.id === "newpass-form") {
      if ((d.password || "").length < 8) return toast("8 caractères minimum");
      busy(true);
      const { error } = await db.auth.updateUser({ password: d.password });
      busy(false);
      if (error) return toast(authError(error));
      recoveryMode = false;
      toast("Mot de passe modifié ✓");
      render();
    }
  }

  /* ---------- Offre de lancement ---------- */
  async function loadLaunch() {
    if (!db || !S.launchCode) { launchPct = 0; return; }
    const { data, error } = await db.rpc("check_promo", { p_code: S.launchCode });
    if (!error) { launchPct = Number(data) || 0; store.set("launchPct", launchPct); }
  }
  function drawLaunchBar() {
    const bar = document.getElementById("launch-bar");
    if (!bar) return;
    bar.hidden = !(S.launchCode && launchPct > 0);
    if (!bar.hidden) bar.innerHTML = `<span><b class="lb-long">Offre de lancement : </b>-${launchPct} %<span class="lb-long"> sur tout le site</span> avec le code <b class="code">${esc(S.launchCode)}</b></span><span class="go"><span class="lb-long">J'en profite</span> ${ic("arrow", 15)}</span>`;
  }

  function pageLaunch() {
    document.title = `Offre de lancement – ${S.name}`;
    if (!(S.launchCode && launchPct > 0)) {
      return `<div class="container" style="padding:48px 16px"><div class="empty"><div class="big">${ic("tag", 44)}</div><h2>L'offre de lancement est terminée</h2><p class="hint">Merci de votre intérêt ! Découvrez nos ordinateurs et accessoires au meilleur prix.</p><a href="#/boutique" class="btn btn-primary">Voir la boutique</a></div></div>`;
    }
    const picks = (PRODUCTS.filter((p) => p.featured).length >= 4 ? PRODUCTS.filter((p) => p.featured) : PRODUCTS).slice(0, 8);
    const applied = promo === S.launchCode;
    return `
      <section class="launch-hero"><div class="container launch-inner">
        <div>
          <span class="eyebrow">${ic("tag", 14)} Offre de lancement</span>
          <h1>-${launchPct} % sur <em>tout le site</em> pour fêter notre boutique en ligne</h1>
          <p>Ordinateurs portables HP, Dell, Lenovo et accessoires : profitez de la réduction sur votre commande, livrée à Conakry. Vous ne payez qu'à la réception.</p>
          <div class="hero-actions">
            <a href="#/boutique" class="btn btn-primary">${ic("bag", 18)}Choisir mes produits</a>
            <a href="${waLink(`Bonjour ${S.name}, je souhaite profiter de l'offre de lancement (code ${S.launchCode}).`)}" target="_blank" rel="noopener" class="btn btn-ghost">${ic("chat", 18)}Commander sur WhatsApp</a>
          </div>
        </div>
        <div class="code-card">
          <span>Votre code</span>
          <strong>${esc(S.launchCode)}</strong>
          <em>-${launchPct} % sur votre commande</em>
          <div class="code-actions">
            <button class="btn btn-outline" data-copy-code>${ic("check", 16)}Copier le code</button>
            <button class="btn btn-primary" data-apply-code ${applied ? "disabled" : ""}>${applied ? "Code appliqué au panier" : "Appliquer à mon panier"}</button>
          </div>
        </div>
      </div></section>

      <section class="section"><div class="container">
        <div class="steps3">
          <div><b>1</b><strong>Choisissez</strong><span>Ajoutez vos produits au panier.</span></div>
          <div><b>2</b><strong>Saisissez ${esc(S.launchCode)}</strong><span>Dans le panier ou au moment de commander.</span></div>
          <div><b>3</b><strong>Payez à la livraison</strong><span>En espèces, Orange Money ou MTN MoMo.</span></div>
        </div>
      </div></section>

      <section class="section" style="padding-top:0"><div class="container">
        <div class="section-head"><div><h2>Nos produits du moment</h2><p>Avec -${launchPct} % grâce au code ${esc(S.launchCode)}</p></div><a href="#/boutique" class="link">Tout voir ${ic("arrow", 16)}</a></div>
        <div class="grid">${picks.map(cardHTML).join("")}</div>
      </div></section>`;
  }

  /* ---------- Comparateur ---------- */
  function toggleCompare(id) {
    if (compare.includes(id)) compare = compare.filter((x) => x !== id);
    else if (compare.length >= 3) return toast("Vous pouvez comparer 3 ordinateurs au maximum");
    else compare = [...compare, id];
    store.set("compare", compare);
    $$(`[data-compare="${id}"]`).forEach((b) => {
      b.classList.toggle("on", compare.includes(id));
      if (b.classList.contains("cmp-btn")) b.innerHTML = `${ic("compare", 18)}${compare.includes(id) ? "Dans le comparateur" : "Comparer"}`;
    });
    drawCompareBar();
    if (currentPath() === "/comparer") render();
  }
  function drawCompareBar() {
    let bar = document.getElementById("compare-bar");
    if (!bar) { bar = document.createElement("div"); bar.id = "compare-bar"; bar.className = "compare-bar"; document.body.appendChild(bar); }
    compare = compare.filter((id) => byId(id));
    const show = compare.length > 0 && currentPath() !== "/comparer";
    bar.hidden = !show;
    if (!show) return;
    bar.innerHTML = `${compare.map((id) => { const p = byId(id); return `<span class="cb-item ${p.image ? "img-wait" : ""}" title="${esc(niceName(p.name))}">${media(p)}</span>`; }).join("")}
      <a href="#/comparer" class="btn btn-primary btn-sm">${ic("compare", 16)}Comparer (${compare.length})</a>
      <button class="cb-clear" data-cmp-clear aria-label="Vider le comparateur">${ic("close", 16)}</button>`;
  }
  function pageCompare() {
    document.title = `Comparer – ${S.name}`;
    const list = compare.map(byId).filter(Boolean);
    if (!list.length) {
      return `<div class="container page-head">${crumbs([["Comparateur"]])}<h1>Comparer des ordinateurs</h1></div><div class="container" style="padding-bottom:48px"><div class="empty"><div class="big">${ic("compare", 44)}</div><h3>Aucun ordinateur sélectionné</h3><p class="hint">Cliquez sur ${ic("compare", 14)} « Comparer » sur 2 ou 3 ordinateurs pour les voir côte à côte.</p><a href="#/boutique?cat=ordinateurs" class="btn btn-primary">Voir les ordinateurs</a></div></div>`;
    }
    const chipVal = (p, icn) => specChips(p).filter(([i]) => i === icn).map(([, t]) => t).join(", ");
    const keys = [...new Set(list.flatMap((p) => Object.keys(p.specs || {})))];
    const cheapest = Math.min(...list.map((p) => p.price));
    const rows = [
      ["Prix", (p) => `<b class="${p.price === cheapest && list.length > 1 ? "best" : ""}">${money(p.price)}</b>`],
      ["Disponibilité", (p) => p.stock <= 3 ? `Plus que ${p.stock}` : "En stock"],
      ["Marque", (p) => esc(p.brand || "—")],
      ["Processeur", (p) => esc((p.specs || {})["Processeur"] || chipVal(p, "cpu") || "—")],
      ["Stockage", (p) => esc((p.specs || {})["Stockage"] || chipVal(p, "drive") || "—")],
      ...keys.filter((k) => !["Processeur", "Stockage"].includes(k)).map((k) => [k, (p) => esc((p.specs || {})[k] || "—")]),
      ["Avis", (p) => p.rating ? `${stars(p.rating)} <small>(${p.reviews})</small>` : "—"]
    ];
    return `<div class="container page-head">${crumbs([["Comparateur"]])}<h1>Comparer ${list.length} ordinateur${list.length > 1 ? "s" : ""}</h1></div>
      <div class="container" style="padding-bottom:48px"><div class="compare-wrap"><table class="compare">
        <tr><th></th>${list.map((p) => `<td class="cmp-head">
          <button class="cmp-x" data-compare="${p.id}" aria-label="Retirer">${ic("close", 16)}</button>
          <a href="#/produit/${p.id}" class="cmp-img ${p.image ? "img-wait" : ""}">${media(p)}</a>
          <a href="#/produit/${p.id}" class="cmp-name">${esc(niceName(p.name))}</a>
          <button class="btn btn-dark btn-sm" data-add="${p.id}">${ic("cart", 16)}Ajouter</button></td>`).join("")}
          ${list.length < 3 ? `<td class="cmp-head cmp-more"><a href="#/boutique?cat=ordinateurs">${ic("plus", 22)}<span>Ajouter un ordinateur</span></a></td>` : ""}</tr>
        ${rows.map(([label, fn]) => `<tr><th>${label}</th>${list.map((p) => `<td>${fn(p)}</td>`).join("")}${list.length < 3 ? "<td></td>" : ""}</tr>`).join("")}
      </table></div>
      <p class="hint" style="margin-top:12px">Une caractéristique manque ? Demandez-nous la configuration exacte sur <a class="link" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name}, j'hésite entre : ${list.map((p) => niceName(p.name)).join(", ")}. Pouvez-vous me conseiller ?`)}">WhatsApp</a>.</p></div>`;
  }

  /* ---------- Demandes : devis entreprise, réparation, reprise ---------- */
  const REQUESTS = {
    devis: {
      title: "Devis entreprises, écoles et ONG", icon: "building",
      intro: "Vous équipez un bureau, une école ou une équipe ? Dites-nous ce qu'il vous faut : nous vous envoyons un devis avec un prix adapté à la quantité.",
      fields: [
        ["org", "Entreprise / organisation", "text", true],
        ["kind", "Matériel souhaité", ["Ordinateurs portables", "Accessoires", "Ordinateurs + accessoires"]],
        ["qty", "Quantité", "number", true],
        ["budget", "Budget par ordinateur (facultatif)", "text"],
        ["use", "Utilisation", ["Bureautique / administratif", "Études / formation", "Comptabilité / logiciels métier", "Graphisme / multimédia", "Autre"]],
        ["delay", "Délai souhaité", ["Dès que possible", "Sous 1 semaine", "Sous 1 mois", "Pas pressé"]]
      ],
      placeholder: "Précisions : configuration souhaitée, logiciels, adresse de livraison…"
    },
    reparation: {
      title: "Réparation et dépannage", icon: "tool",
      intro: "Votre ordinateur a un problème ? Décrivez-le : nous vous rappelons avec un diagnostic et un prix avant toute intervention.",
      fields: [
        ["device", "Appareil (marque et modèle)", "text", true],
        ["issue", "Problème", ["Écran cassé ou noir", "Batterie / ne charge plus", "Clavier / touchpad", "Ne démarre pas", "Lent / virus / Windows", "Surchauffe / bruit", "Autre"]],
        ["bought", "Acheté chez Venips ?", ["Non", "Oui"]]
      ],
      placeholder: "Décrivez le problème : depuis quand, ce qui s'est passé…"
    },
    reprise: {
      title: "Reprise de votre ancien ordinateur", icon: "swap",
      intro: "Échangez votre ancien ordinateur contre une réduction sur un nouveau. Décrivez-le, nous vous faisons une estimation.",
      fields: [
        ["device", "Marque et modèle", "text", true],
        ["cpu", "Processeur (si connu)", "text"],
        ["ram", "Mémoire / stockage (si connus)", "text"],
        ["state", "État général", ["Très bon état", "Bon état (traces d'usure)", "Abîmé (écran, coque…)", "Ne fonctionne plus"]],
        ["charger", "Chargeur fourni ?", ["Oui", "Non"]]
      ],
      placeholder: "Ordinateur qui vous intéresse, défauts éventuels…"
    }
  };
  function pageRequest(type) {
    const R = REQUESTS[type];
    document.title = `${R.title} – ${S.name}`;
    const prof = profile || {};
    const field = ([k, label, kind, req]) => Array.isArray(kind)
      ? `<div class="field"><label for="rq-${k}">${label}</label><select id="rq-${k}" name="${k}">${kind.map((o) => `<option>${esc(o)}</option>`).join("")}</select></div>`
      : `<div class="field"><label for="rq-${k}">${label}${req ? " *" : ""}</label><input id="rq-${k}" name="${k}" type="${kind}" ${kind === "number" ? 'min="1" max="1000"' : 'maxlength="120"'} ${req ? "required" : ""}></div>`;
    return `<div class="container page-head">${crumbs([["Services"], [R.title]])}<h1>${R.title}</h1></div>
      <div class="container cart-layout request-page">
        <div class="panel">
          <p class="request-intro">${ic(R.icon, 22)}<span>${R.intro}</span></p>
          <div id="rq-msg"></div>
          <form class="request-form" id="request-form" data-type="${type}" novalidate>
            <div class="form-grid">
              <div class="field"><label for="rq-name">Votre nom *</label><input id="rq-name" name="name" autocomplete="name" value="${esc(prof.full_name || "")}" required></div>
              <div class="field"><label for="rq-phone">Téléphone *</label><input id="rq-phone" name="phone" type="tel" placeholder="6XX XX XX XX" value="${esc((prof.phone || "").replace(/^\+224\s?/, ""))}" required></div>
              <div class="field full"><label for="rq-email">Email (facultatif)</label><input id="rq-email" name="email" type="email" value="${esc(user ? user.email : "")}"></div>
              ${R.fields.map(field).join("")}
              <div class="field full"><label for="rq-message">Message</label><textarea id="rq-message" name="message" rows="4" maxlength="2000" placeholder="${esc(R.placeholder)}"></textarea></div>
            </div>
            <button class="btn btn-primary btn-block" style="margin-top:14px">Envoyer ma demande</button>
            <p class="hint" style="text-align:center">Réponse rapide par téléphone ou WhatsApp. Gratuit et sans engagement.</p>
          </form>
        </div>
        <div class="panel" style="align-self:start">
          <h3>Nos autres services</h3>
          ${Object.entries(REQUESTS).filter(([k]) => k !== type).map(([k, r]) => `<a class="svc-link" href="#/${k}">${ic(r.icon, 20)}<span>${r.title}</span>${ic("arrow", 16)}</a>`).join("")}
          <a class="svc-link" href="#/guide">${ic("book", 20)}<span>Guide : quel ordinateur choisir ?</span>${ic("arrow", 16)}</a>
          <a class="btn btn-wa btn-block" style="margin-top:14px" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name}, ${type === "devis" ? "je souhaite un devis." : type === "reparation" ? "j'ai un ordinateur à faire réparer." : "je souhaite faire reprendre mon ancien ordinateur."}`)}">${ic("chat", 18)}Ou écrivez-nous sur WhatsApp</a>
        </div>
      </div>`;
  }

  async function submitRequest(f) {
    const type = f.dataset.type;
    const d = Object.fromEntries(new FormData(f));
    const digits = (d.phone || "").replace(/\D/g, "").replace(/^(00)?224/, "");
    const msgBox = document.getElementById("rq-msg");
    const fail = (m) => { if (msgBox) msgBox.innerHTML = `<div class="checkout-error">${ic("alert", 20)}<div><p style="margin:0">${esc(m)}</p></div></div>`; else toast(m); };
    if ((d.name || "").trim().length < 2) return fail("Indiquez votre nom.");
    if (!/^6\d{8}$/.test(digits)) return fail("Numéro guinéen invalide (9 chiffres, commence par 6).");
    const R = REQUESTS[type];
    if (R) for (const [k, label, , req] of R.fields) if (req && !String(d[k] || "").trim()) return fail(`Indiquez : ${label.toLowerCase()}.`);
    const details = {};
    if (R) R.fields.forEach(([k, label]) => { if (String(d[k] || "").trim()) details[label] = String(d[k]).trim().slice(0, 200); });
    const btn = $("button:not([type=button])", f);
    if (btn) { btn.disabled = true; btn.textContent = "Envoi…"; }
    const phone = "+224 " + digits.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4");
    const { data, error } = await db.rpc("submit_request", { p: { type, name: d.name.trim(), phone, email: (d.email || "").trim(), message: (d.message || "").trim(), details, product_id: f.dataset.product || null } });
    if (error) { if (btn) { btn.disabled = false; btn.textContent = type === "alerte" ? "Me prévenir du retour en stock" : "Envoyer ma demande"; } return fail(error.code === "P0001" ? error.message : "Envoi impossible pour le moment. Réessayez ou écrivez-nous sur WhatsApp."); }
    const ref = `D-${data.id}`;
    const label = type === "alerte" ? "alerte de retour en stock" : (R ? R.title.toLowerCase() : "demande");
    const waText = `Bonjour ${S.name}, je viens d'envoyer une demande (${label}) sur le site, référence ${ref}.${type === "reparation" || type === "reprise" ? " Je vous envoie des photos de l'appareil." : ""}`;
    const container = f.closest(".panel");
    container.innerHTML = `<div class="request-ok">
      <div class="check">${ic("check", 32)}</div>
      <h2>${type === "alerte" ? (data.deja ? "Vous êtes déjà sur la liste" : "C'est noté !") : "Demande envoyée !"}</h2>
      <p>${type === "alerte" ? "Nous vous prévenons dès que ce produit revient en stock." : `Référence <b>${ref}</b>. Notre équipe vous recontacte très vite au <b>${esc(phone)}</b>.`}</p>
      ${type !== "alerte" ? `<a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(waText)}">${ic("chat", 18)}${type === "reparation" || type === "reprise" ? "Envoyer des photos sur WhatsApp" : "Accélérer sur WhatsApp"}</a>` : ""}
      <p><a class="link" href="#/boutique">Continuer sur la boutique</a></p></div>`;
  }

  /* ---------- Guide d'achat ---------- */
  function pageGuide() {
    document.title = `Quel ordinateur choisir ? – ${S.name}`;
    const laptops = PRODUCTS.filter((p) => p.category === "ordinateurs");
    const count = (max) => laptops.filter((p) => p.price <= max).length;
    const profiles = [
      ["book", "Études et bureautique", "Word, Excel, Internet, cours en ligne, visioconférences.", "Core i3 ou i5 (8e génération ou plus), 8 Go de mémoire, disque SSD.", 2000000],
      ["building", "Travail de bureau et multitâche", "Logiciels de gestion, comptabilité, beaucoup d'onglets ouverts, réunions.", "Core i5 ou i7 (8e génération ou plus), 8 à 16 Go de mémoire, SSD de 256 Go ou plus.", 2600000],
      ["laptop", "Mobilité et déplacements", "Vous travaillez en déplacement, en réunion, sur le terrain.", "Écran 12 à 14 pouces, poids léger, bonne batterie. Modèles « s » ou « Yoga » de Lenovo, EliteBook HP.", 3000000],
      ["star", "Graphisme, montage, programmation", "Photoshop, montage vidéo, développement, plusieurs écrans.", "Core i7 récent, 16 Go de mémoire, SSD de 512 Go, écran Full HD.", 3500000]
    ];
    return content("Quel ordinateur choisir ?", `
      <p>Nous vendons surtout des <b>ordinateurs portables professionnels</b> (HP EliteBook, Dell Latitude, Lenovo ThinkPad…) : des machines conçues pour les entreprises, solides et durables. Voici comment choisir selon votre usage.</p>
      <h2>1. Selon votre utilisation</h2>
      <div class="guide-grid">${profiles.map(([i, t, u, r, max]) => `<div class="guide-card">${ic(i, 24)}<h3>${t}</h3><p class="hint">${u}</p><p><b>Recommandé :</b> ${r}</p>${count(max) ? `<a class="link" href="#/boutique?cat=ordinateurs&max=${max}">Voir les ${count(max)} modèles à moins de ${money(max)} ${ic("arrow", 14)}</a>` : ""}</div>`).join("")}</div>
      <h2>2. Comprendre les caractéristiques</h2>
      <ul>
        <li><b>Processeur (Core i3 / i5 / i7)</b> : c'est le « moteur ». i3 pour un usage simple, i5 pour la plupart des besoins, i7 pour les tâches lourdes. La <b>génération</b> compte aussi : un i5 de 8e génération est plus rapide qu'un i7 de 4e.</li>
        <li><b>Mémoire (RAM)</b> : 8 Go est le minimum confortable aujourd'hui, 16 Go pour le multitâche et les logiciels lourds.</li>
        <li><b>Stockage SSD</b> : beaucoup plus rapide qu'un disque dur classique (HDD). 256 Go suffisent pour la bureautique, 512 Go si vous gardez beaucoup de fichiers.</li>
        <li><b>Écran</b> : 13-14 pouces pour la mobilité, 15,6 pouces pour le confort. Préférez la résolution Full HD (1920 × 1080).</li>
        <li><b>Tactile / 2 en 1</b> : pratique pour la prise de notes et les présentations (modèles x360, Yoga).</li>
      </ul>
      <h2>3. Neuf ou reconditionné ?</h2>
      <p>Un ordinateur <b>reconditionné</b> est un appareil d'occasion, contrôlé et remis en état. Un PC professionnel reconditionné offre souvent plus de solidité qu'un ordinateur grand public neuf au même prix. Demandez-nous toujours <b>l'état exact, la batterie et la garantie</b> du modèle qui vous intéresse.</p>
      <h2>4. Notre conseil</h2>
      <p>Utilisez le <a class="link" href="#/comparer">comparateur</a> pour voir 2 ou 3 modèles côte à côte, et n'hésitez pas à nous demander conseil : nous vous aidons à choisir selon votre budget.</p>
      <p><a class="btn btn-primary" href="#/boutique?cat=ordinateurs">${ic("laptop", 18)}Voir les ordinateurs</a> <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name}, pouvez-vous m'aider à choisir un ordinateur ?`)}">${ic("chat", 18)}Demander conseil</a></p>`);
  }

  function pageWish() {
    const list = wish.map(byId).filter(Boolean);
    document.title = `Favoris – ${S.name}`;
    return `<div class="container page-head">${crumbs([["Favoris"]])}<h1>Mes favoris</h1></div>
      <div class="container" style="padding-bottom:48px">${list.length ? `<div class="grid">${list.map(cardHTML).join("")}</div>` : `<div class="empty"><div class="big">${ic("heart", 44)}</div><h3>Aucun favori pour le moment</h3><p class="hint">Cliquez sur le cœur pour garder un produit de côté.</p><a href="#/boutique" class="btn btn-primary">Parcourir la boutique</a></div>`}</div>`;
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
      ${S.freeDeliveryFrom ? `<p><b>Livraison gratuite</b> pour toute commande à partir de <b>${money(S.freeDeliveryFrom)}</b> (hors intérieur du pays).</p>` : ""}
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
          <div><span class="ic">${ic("chat", 22)}</span><div><b>WhatsApp</b><br><a class="link" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name} !`)}">${esc(S.phoneDisplay)}</a></div></div>
          <div><span class="ic">${ic("phone", 22)}</span><div><b>Téléphone</b><br><a href="tel:+${S.whatsapp}">${esc(S.phoneDisplay)}</a></div></div>
          <div><span class="ic">${ic("mail", 22)}</span><div><b>Email</b><br><a href="mailto:${esc(S.email)}">${esc(S.email)}</a></div></div>
          <div><span class="ic">${ic("pin", 22)}</span><div><b>Adresse</b><br>${esc(S.address)}</div></div>
          <div><span class="ic">${ic("clock", 22)}</span><div><b>Horaires</b><br>${esc(S.hours)}</div></div>
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
    return `<div class="container" style="padding:48px 16px"><div class="empty"><div class="big">${ic("sad", 44)}</div><h2>Page introuvable</h2><p class="hint">Le lien est peut-être incorrect ou le produit n'existe plus.</p><a href="#/" class="btn btn-primary">Retour à l'accueil</a></div></div>`;
  }


  /* ---------- Galerie et visionneuse (fiche produit) ---------- */
  let currentGallery = [];
  let galleryIndex = 0;
  let viewerIndex = 0;
  const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function showImage(i) {
    if (!currentGallery[i]) return;
    galleryIndex = i;
    const img = $("#main-media img");
    if (img) { img.style.visibility = ""; img.src = currentGallery[i]; }
    $$(".gallery .thumb").forEach((t) => t.classList.toggle("on", +t.dataset.img === i));
  }

  function openViewer(i) {
    if (!currentGallery.length) return;
    let v = $("#viewer");
    if (!v) {
      v = document.createElement("div");
      v.id = "viewer";
      v.className = "viewer";
      v.setAttribute("role", "dialog");
      v.setAttribute("aria-modal", "true");
      document.body.appendChild(v);
      v.addEventListener("click", (e) => {
        const b = e.target.closest("[data-viewer],[data-viewer-i]");
        if (b && b.dataset.viewer === "prev") return stepViewer(-1);
        if (b && b.dataset.viewer === "next") return stepViewer(1);
        if (b && b.dataset.viewerI !== undefined) return setViewer(+b.dataset.viewerI);
        if ((b && b.dataset.viewer === "close") || e.target === v || e.target.classList.contains("viewer-stage")) closeViewer();
      });
      let startX = null;
      v.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
      v.addEventListener("touchend", (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 50) stepViewer(dx < 0 ? 1 : -1);
        startX = null;
      });
    }
    const n = currentGallery.length;
    v.innerHTML = `
      <button class="viewer-close" data-viewer="close" aria-label="Fermer">${ic("close", 22)}</button>
      ${n > 1 ? `<button class="viewer-nav prev" data-viewer="prev" aria-label="Image précédente">‹</button><button class="viewer-nav next" data-viewer="next" aria-label="Image suivante">›</button>` : ""}
      <div class="viewer-stage"><img id="viewer-img" alt="" referrerpolicy="no-referrer"></div>
      ${n > 1 ? `<div class="viewer-thumbs">${currentGallery.map((u, k) => `<button data-viewer-i="${k}" aria-label="Image ${k + 1}"><img src="${esc(u)}" alt="" referrerpolicy="no-referrer"></button>`).join("")}</div>` : ""}
      <div class="viewer-count"></div>`;
    v.classList.add("open");
    document.body.style.overflow = "hidden";
    setViewer(i);
  }
  function setViewer(i) {
    const n = currentGallery.length;
    viewerIndex = (i + n) % n;
    $("#viewer-img").src = currentGallery[viewerIndex];
    $$(".viewer-thumbs button").forEach((b) => b.classList.toggle("on", +b.dataset.viewerI === viewerIndex));
    $(".viewer-count").textContent = n > 1 ? `${viewerIndex + 1} / ${n}` : "";
  }
  const stepViewer = (dir) => setViewer(viewerIndex + dir);
  function closeViewer() {
    const v = $("#viewer");
    if (!v || !v.classList.contains("open")) return;
    v.classList.remove("open");
    document.body.style.overflow = "";
    showImage(viewerIndex);
  }

  // Survol d'une miniature = changement d'image (comme sur Amazon), sur ordinateur
  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest(".gallery .thumb");
    if (t && canHover()) showImage(+t.dataset.img);
  });
  // Loupe au survol de l'image principale
  document.addEventListener("mousemove", (e) => {
    const box = e.target.closest(".product-media.zoomable");
    $$(".product-media.zooming").forEach((m) => { if (m !== box) m.classList.remove("zooming"); });
    if (!box || !canHover()) return;
    const img = $("img", box);
    if (!img) return;
    const r = box.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    box.classList.add("zooming");
  });
  document.addEventListener("mouseleave", () => $$(".product-media.zooming").forEach((m) => m.classList.remove("zooming")));

  /* ---------- Application installable (raccourci bureau / écran d'accueil) ---------- */
  let installPrompt = null;
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const UA = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(UA);
  const isFirefox = /firefox|fxios/i.test(UA);
  const isMacSafari = /macintosh/i.test(UA) && /safari/i.test(UA) && !/chrome|chromium|edg|crios|fxios/i.test(UA) && !isIOS;

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; drawInstall(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; drawInstall(); closeInstallHelp(); toast("Application Venips installée ✓"); });

  function drawInstall() {
    const hide = isStandalone();
    $$("[data-install]").forEach((b) => { b.hidden = hide; });
  }

  async function installApp() {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      if (outcome === "accepted") toast("Installation en cours… l'icône Venips va apparaître");
      drawInstall();
      return;
    }
    showInstallHelp();
  }

  function installSteps() {
    if (isIOS) return {
      title: "Ajouter Venips à l'écran d'accueil",
      note: isFirefox || /crios/i.test(UA) ? "Sur iPhone, utilisez de préférence Safari." : "",
      steps: [["share", "Touchez le bouton <b>Partager</b> en bas de Safari (le carré avec une flèche)."], ["plus", "Faites défiler et choisissez <b>« Sur l'écran d'accueil »</b>."], ["check", "Touchez <b>« Ajouter »</b> : l'icône Venips apparaît sur votre écran."]]
    };
    if (isAndroid) return {
      title: "Installer l'application Venips",
      steps: [["dots", "Ouvrez le menu <b>⋮</b> du navigateur (en haut à droite)."], ["download", "Choisissez <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>."], ["check", "Confirmez : l'icône Venips apparaît avec vos applications."]]
    };
    if (isMacSafari) return {
      title: "Ajouter Venips au Dock",
      steps: [["share", "Dans la barre de menus de Safari, ouvrez <b>Fichier</b> (ou le bouton Partager)."], ["plus", "Choisissez <b>« Ajouter au Dock »</b>."], ["check", "Venips s'ouvre désormais comme une application depuis le Dock et le Launchpad."]]
    };
    if (isFirefox) return {
      title: "Installer Venips sur cet ordinateur",
      note: "Firefox ne permet pas d'installer les applications web.",
      steps: [["laptop", "Ouvrez <b>venips-ecom.vercel.app</b> dans <b>Google Chrome</b> ou <b>Microsoft Edge</b>."], ["download", "Cliquez sur le bouton <b>« Installer l'app »</b> en haut du site."], ["check", "L'icône Venips est ajoutée au bureau et au menu Démarrer."]]
    };
    return {
      title: "Installer Venips sur cet ordinateur",
      steps: [["download", "Cliquez sur l'icône d'installation <b>⊕</b> à droite de la barre d'adresse (ou menu <b>⋮</b> → <b>« Installer Venips »</b>)."], ["check", "Confirmez avec <b>« Installer »</b>."], ["laptop", "Venips s'ouvre comme une application, avec son icône sur le bureau et dans le menu Démarrer."]]
    };
  }

  function showInstallHelp() {
    const g = installSteps();
    closeInstallHelp();
    const m = document.createElement("div");
    m.className = "install-modal";
    m.id = "install-modal";
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-modal", "true");
    m.innerHTML = `<div class="install-card">
      <button class="install-x" data-install-close aria-label="Fermer">${ic("close", 20)}</button>
      <img src="icons/icon-192.png" alt="" class="install-icon">
      <h3>${g.title}</h3>
      <p class="hint">Une icône Venips sur votre écran, pour ouvrir la boutique en un geste, comme une application.</p>
      ${g.note ? `<p class="install-note">${g.note}</p>` : ""}
      <ol>${g.steps.map(([i, t], k) => `<li><span class="n">${k + 1}</span>${ic(i, 20)}<span>${t}</span></li>`).join("")}</ol>
      <button class="btn btn-primary btn-block" data-install-close>J'ai compris</button>
    </div>`;
    m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-install-close]")) closeInstallHelp(); });
    document.body.appendChild(m);
  }
  function closeInstallHelp() { const m = document.getElementById("install-modal"); if (m) m.parentNode.removeChild(m); }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("Service worker non enregistré", e)));
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
      case "compte": html = pageAccount(); break;
      case "lancement": html = pageLaunch(); break;
      case "comparer": html = pageCompare(); break;
      case "devis": case "reparation": case "reprise": html = pageRequest(parts[0]); break;
      case "guide": html = pageGuide(); break;
      case "favoris": html = pageWish(); break;
      case "a-propos": html = pageAbout(); break;
      case "livraison": html = pageDelivery(); break;
      case "faq": html = pageFAQ(); break;
      case "contact": html = pageContact(); break;
      case "cgv": html = pageTerms(); break;
      default: html = pageNotFound();
    }
    closeViewer();
    if (parts[0] !== "produit") currentGallery = [];
    app.innerHTML = html;
    drawCompareBar();
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
    const el = e.target.closest("[data-add],[data-wish],[data-inc],[data-dec],[data-remove],[data-padd],[data-pbuy],[data-pinc],[data-pdec],[data-close],[data-promo-remove],[data-logout],[data-forgot],[data-img],[data-open-viewer],[data-copy-code],[data-apply-code],[data-install],[data-google],[data-compare],[data-cmp-clear],[data-receipt],[data-receipt-local],#filter-toggle");
    if (!el) return;
    const d = el.dataset;
    if (d.add) { addToCart(d.add); if (currentPath() === "/panier") render(); }
    else if (d.wish) { e.preventDefault(); toggleWish(d.wish); if (currentPath().startsWith("/produit") && el.classList.contains("btn")) el.innerHTML = `${ic("heart", 18)}${wish.includes(d.wish) ? "Dans vos favoris" : "Ajouter aux favoris"}`; }
    else if (d.inc) { const l = cart.find((x) => x.id === d.inc); setQty(d.inc, l.qty + 1); refreshCartViews(); }
    else if (d.dec) { const l = cart.find((x) => x.id === d.dec); setQty(d.dec, l.qty - 1); refreshCartViews(); }
    else if (d.remove) { removeFromCart(d.remove); refreshCartViews(); toast("Produit retiré du panier"); }
    else if ("pinc" in d || "pdec" in d) { const i = $("#pqty"); i.value = Math.max(1, Math.min(Number(i.max), Number(i.value) + ("pinc" in d ? 1 : -1))); }
    else if (d.padd) addToCart(d.padd, Math.max(1, Number($("#pqty").value) || 1));
    else if (d.pbuy) { addToCart(d.pbuy, Math.max(1, Number($("#pqty").value) || 1)); location.hash = "#/commande"; }
    else if ("promoRemove" in d) { promo = ""; promoPct = 0; store.set("promo", ""); store.set("promoPct", 0); refreshCartViews(); }
    else if ("img" in d) showImage(+d.img);
    else if ("openViewer" in d) openViewer(galleryIndex);
    else if ("install" in d) { closeDrawers(); installApp(); }
    else if ("google" in d) signInWithGoogle();
    else if (d.compare) { e.preventDefault(); toggleCompare(d.compare); }
    else if ("cmpClear" in d) { compare = []; store.set("compare", []); drawCompareBar(); $$("[data-compare]").forEach((b) => b.classList.remove("on")); }
    else if (d.receipt) openReceipt(d.receipt);
    else if (d.receiptLocal) openLocalReceipt(d.receiptLocal);
    else if ("copyCode" in d) {
      (navigator.clipboard ? navigator.clipboard.writeText(S.launchCode) : Promise.reject())
        .then(() => toast(`Code ${S.launchCode} copié`), () => toast(`Votre code : ${S.launchCode}`));
    }
    else if ("applyCode" in d) applyPromo(S.launchCode).then(() => { if (currentPath() === "/lancement") render(); });
    else if (el.id === "filter-toggle") $("#filters").classList.toggle("open");
    else if ("logout" in d) { db.auth.signOut().then(async () => { store.set("customer", {}); await loadAccount(); render(); toast("Vous êtes déconnecté(e)"); }); }
    else if ("forgot" in d) {
      const email = ($("#l-email") || {}).value?.trim();
      if (!email) return accMsg("Saisissez d'abord votre email dans le champ ci-dessus.", "err");
      db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + "#/compte" })
        .then(({ error }) => error ? accMsg(esc(authError(error)), "err") : accMsg(`Un lien pour choisir un nouveau mot de passe a été envoyé à <b>${esc(email)}</b>.`));
    }
    else if ("close" in d) closeDrawers();
  });

  async function applyPromo(code) {
    let pct = 0;
    if (db) {
      const { data, error } = await db.rpc("check_promo", { p_code: code });
      pct = error ? S.promoCodes[code] || 0 : Number(data) || 0;
    } else pct = S.promoCodes[code] || 0;
    if (!pct) return toast("Code promo invalide");
    promo = code; promoPct = pct;
    store.set("promo", code); store.set("promoPct", pct);
    toast(`Code ${code} appliqué : -${pct}%`);
    refreshCartViews();
  }

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
      applyPromo(code);
    } else if (f.id === "checkout") {
      e.preventDefault();
      submitCheckout(f);
    } else if (f.id === "request-form") {
      e.preventDefault();
      submitRequest(f);
    } else if (f.id === "review-form") {
      e.preventDefault();
      const rating = Number(new FormData(f).get("rating"));
      const comment = String(new FormData(f).get("comment") || "");
      db.rpc("submit_review", { p_product: f.dataset.pid, p_rating: rating, p_comment: comment }).then(({ error }) => {
        if (error) return toast(error.code === "P0001" ? error.message : "Envoi impossible, réessayez.");
        f.outerHTML = `<div class="account-note">${ic("check", 16)} Merci ! Votre avis sera publié après vérification.</div>`;
      });
    } else if (["login-form", "signup-form", "profile-form", "newpass-form"].includes(f.id)) {
      e.preventDefault();
      submitAccountForm(f);
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
  document.addEventListener("keydown", (e) => {
    const viewerOpen = $("#viewer.open");
    if (e.key === "Escape") { if (viewerOpen) closeViewer(); else closeDrawers(); }
    else if (viewerOpen && e.key === "ArrowLeft") stepViewer(-1);
    else if (viewerOpen && e.key === "ArrowRight") stepViewer(1);
  });
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

  /* ---------- Gabarit (header, footer) ---------- */
  function renderShell() {
    const [first, ...rest] = S.name.split(" ");
    const logo = S.logoImage
      ? `<img class="logo-img" src="${esc(S.logoImage)}" alt="${esc(S.name)}">`
      : `<span class="logo-mark">${esc(S.logoText)}</span><span>${esc(first)}${rest.length ? ` <span class="accent">${esc(rest.join(" "))}</span>` : ""}</span>`;
    $("#logo").innerHTML = logo;
    $("#topbar-phone").innerHTML = `${ic("phone", 14)} ${esc(S.phoneDisplay)} <span class="sep">·</span> ${ic("clock", 14)} ${esc(S.hours.split("·")[0].trim())}`;
    $("#catnav").innerHTML = `<div class="catnav-inner"><a href="#/boutique">Tout</a><a href="#/boutique?promo=1">${ic("tag", 15)}Promos</a>${CATEGORIES.map((c) => `<a href="#/boutique?cat=${c.id}">${esc(c.name)}</a>`).join("")}<a href="#/guide">${ic("book", 15)}Guide d'achat</a><a href="#/devis">${ic("building", 15)}Entreprises</a><a href="#/reparation">${ic("tool", 15)}Réparation</a></div>`;
    $("#mobile-menu-body").innerHTML = [
      ["#/", "home", "Accueil"], ["#/boutique", "bag", "Boutique"], ["#/boutique?promo=1", "tag", "Promotions"],
      ...CATEGORIES.map((c) => [`#/boutique?cat=${c.id}`, c.icon === "laptop" ? "laptop" : "mouse", c.name, true]),
      ["#/guide", "book", "Guide d'achat"], ["#/comparer", "compare", "Comparateur"], ["#/devis", "building", "Devis entreprises"], ["#/reparation", "tool", "Réparation"], ["#/reprise", "swap", "Reprise de votre PC"],
      ["#/compte", "user", "Mon compte"], ["#/favoris", "heart", "Mes favoris"], ["#/mes-commandes", "box", "Mes commandes"], ["#/livraison", "truck", "Livraison"], ["#/faq", "help", "FAQ"], ["#/contact", "chat", "Contact"]
    ].map(([h, i, l, sub]) => `<a class="mm-link ${sub ? "sub" : ""}" href="${h}">${ic(i, 18)}${esc(l)}</a>`).join("")
      + `<button class="mm-link mm-install" data-install hidden>${ic("download", 18)}Installer l'application</button>`;
    $("#wa-float").href = waLink(`Bonjour ${S.name} !`);
    const socials = Object.entries(S.socials).filter(([, v]) => v);
    $("#footer").innerHTML = `
      <div><a href="#/" class="logo">${logo}</a><p>${esc(S.tagline)}.</p><p class="f-line">${ic("pin", 16)}${esc(S.address)}</p><p class="f-line">${ic("phone", 16)}${esc(S.phoneDisplay)}</p><p class="f-line">${ic("mail", 16)}${esc(S.email)}</p>
        <div class="pay-badges"><span>Orange Money</span><span>MTN MoMo</span><span>Espèces</span></div></div>
      <div><h4>Boutique</h4>${CATEGORIES.slice(0, 6).map((c) => `<a href="#/boutique?cat=${c.id}">${esc(c.name)}</a>`).join("")}<a href="#/boutique?promo=1">Promotions</a></div>
      <div><h4>Services</h4><a href="#/devis">Devis entreprises & écoles</a><a href="#/reparation">Réparation et dépannage</a><a href="#/reprise">Reprise de votre PC</a><a href="#/guide">Guide d'achat</a><a href="#/comparer">Comparateur</a></div>
      <div><h4>Aide</h4><a href="#/compte">Mon compte</a><a href="#/livraison">Livraison & retours</a><a href="#/faq">FAQ</a><a href="#/mes-commandes">Suivre ma commande</a><a href="#/contact">Contact</a><a href="#/cgv">CGV</a><a href="#/a-propos">À propos</a></div>
      <div><h4>Besoin d'aide ?</h4><p>Notre équipe vous répond sur WhatsApp.</p><a class="btn btn-wa" style="display:inline-flex;color:#fff" target="_blank" rel="noopener" href="${waLink(`Bonjour ${S.name} !`)}">${ic("chat", 18)}Écrire sur WhatsApp</a><p class="f-line" style="margin-top:12px">${ic("clock", 16)}${esc(S.hours)}</p>
        <div class="f-app" data-install hidden><img src="icons/icon-192.png" alt=""><div><strong>Application Venips</strong><span>Une icône sur votre téléphone ou votre bureau</span></div><span class="f-app-btn">${ic("download", 16)}Installer</span></div>
        ${socials.length ? `<p style="margin-top:12px">${socials.map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener" style="display:inline;margin-right:10px">${k}</a>`).join("")}</p>` : ""}</div>`;
    $("#footer-bottom").innerHTML = `<span>© ${new Date().getFullYear()} ${esc(S.name)}. Tous droits réservés.</span><span class="f-links"><a href="#/cgv">CGV</a><a href="#/livraison">Livraison & retours</a><a href="#/contact">Contact</a></span>`;
  }

  // Silhouettes animées affichées pendant le tout premier chargement
  function skeletonHTML() {
    const line = (w, h = 14, extra = "") => `<div class="skel" style="width:${w};height:${h}px;${extra}"></div>`;
    const card = `<div class="card skel-card"><div class="skel" style="aspect-ratio:1/1;border-radius:0"></div><div class="card-body">${line("40%", 11)}${line("90%", 15)}${line("60%", 15)}${line("55%", 20)}${line("100%", 38, "border-radius:10px;margin-top:8px")}</div></div>`;
    const path = currentPath();
    if (path.startsWith("/produit")) {
      return `<div class="container page-head">${line("260px", 12)}</div><div class="container product">
        <div class="skel" style="aspect-ratio:1/1;border-radius:18px"></div>
        <div style="display:grid;gap:14px;align-content:start">${line("25%", 12)}${line("85%", 30)}${line("45%", 34)}${line("35%", 14)}${line("100%", 70)}${line("100%", 46, "border-radius:10px")}${line("100%", 46, "border-radius:10px")}</div></div>`;
    }
    if (["/compte", "/commande", "/mes-commandes", "/panier"].includes(path)) {
      return `<div class="container page-head">${line("200px", 30)}</div><div class="container cart-layout">
        <div class="panel" style="display:grid;gap:14px">${line("40%", 20)}${line("100%", 44)}${line("100%", 44)}${line("100%", 44)}</div>
        <div class="panel" style="display:grid;gap:12px;align-self:start">${line("60%", 20)}${line("100%", 14)}${line("100%", 14)}${line("100%", 46, "border-radius:10px")}</div></div>`;
    }
    const hero = path === "/" ? `<div class="hero"><div class="container hero-inner"><div style="display:grid;gap:16px">${line("80%", 44, "opacity:.25")}${line("60%", 44, "opacity:.25")}${line("70%", 16, "opacity:.25")}</div></div></div>` : `<div class="container page-head">${line("220px", 30)}</div>`;
    return `${hero}<div class="container section"><div class="grid">${card.repeat(8)}</div></div>`;
  }

  async function boot() {
    const hasTokens = /access_token|error_description|type=recovery/.test(location.hash);
    const needsAccount = ["/compte", "/commande", "/mes-commandes"].includes(currentPath());
    // 1. Affichage immédiat : dernier catalogue connu (s'il existe) + en-tête complet
    const cached = store.get("catalog", null);
    if (cached && cached.v === 2) applyCatalog(cached);
    renderShell();
    drawInstall();
    drawLaunchBar();
    drawCompareBar();
    updateBadges();
    renderCartDrawer();
    let shown = false;
    if (cached && !hasTokens && !needsAccount) { render(); shown = true; }
    else if (hasTokens && !/error_description/.test(location.hash)) {
      // Retour de Google (ou d'un lien email) : on rassure pendant l'ouverture de la session
      app.innerHTML = `<div class="container" style="padding:90px 16px;text-align:center"><div class="login-wait"></div><h2 style="margin:18px 0 6px">Connexion en cours…</h2><p class="hint">Nous ouvrons votre compte ${esc(S.name)}, un instant.</p></div>`;
    }
    else app.innerHTML = skeletonHTML();

    // 2. Mise à jour silencieuse depuis la base
    const launchBefore = launchPct;
    const googleBefore = googleEnabled;
    const [fresh] = await Promise.all([loadCatalog(), loadAccount(), loadLaunch(), loadProviders()]);
    drawLaunchBar();
    // Retour d'un lien email (confirmation, mot de passe) : jetons dans l'adresse
    if (hasTokens) {
      if (/type=recovery/.test(location.hash)) recoveryMode = true;
      if (/error_description/.test(location.hash)) setTimeout(() => toast("Lien expiré ou invalide : demandez-en un nouveau."), 300);
      history.replaceState(null, "", location.pathname + "#/compte");
    }
    if (db) {
      db.auth.onAuthStateChange((event) => {
        // Pas d'appel Supabase directement dans ce rappel (recommandation de la librairie)
        setTimeout(async () => {
          if (event === "PASSWORD_RECOVERY") { recoveryMode = true; location.hash = "#/compte"; }
          if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY") {
            const before = user && user.id;
            await loadAccount();
            if ((user && user.id) !== before && ["/compte", "/commande", "/mes-commandes"].includes(currentPath())) render();
          }
        }, 0);
      });
    }
    if (fresh || !db) {
      cart = cart.filter((l) => byId(l.id));
      wish = wish.filter((id) => byId(id));
    }
    const changed = !!fresh && JSON.stringify(fresh) !== JSON.stringify(cached);
    if (changed) { renderShell(); drawInstall(); renderCartDrawer(); }
    updateBadges();
    // 3. Ne redessiner que si nécessaire (pas de saut de page inutile)
    if (!shown || changed || (launchPct !== launchBefore && ["/", "/lancement"].includes(currentPath())) || (googleEnabled !== googleBefore && currentPath() === "/compte")) {
      const y = window.scrollY;
      render();
      if (shown) window.scrollTo(0, y);
    }
  }
  // Accès en lecture pour l'assistant (js/assistant.js) : toujours les données à jour
  window.VenipsShop = {
    products: () => PRODUCTS,
    categories: () => CATEGORIES,
    zones: () => S.deliveryZones,
    freeFrom: () => S.freeDeliveryFrom,
    launch: () => ({ code: S.launchCode, pct: launchPct }),
    user: () => user,
    niceName, specChips, catName, money, esc, ic, waLink,
    addToCart: (id) => addToCart(id),
    media
  };

  boot();
})();
