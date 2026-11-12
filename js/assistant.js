/* =========================================================
   Venips – assistant de la boutique (gratuit, sans IA payante)
   Répond aux questions courantes à partir des vraies données du site
   (produits, prix, stock, zones de livraison, paiement, horaires)
   et passe la main à WhatsApp quand il ne sait pas.
   ========================================================= */
(function () {
  "use strict";

  const S = window.STORE;
  const V = window.VenipsShop;
  if (!S || !V) return;
  const { esc, ic, money, niceName } = V;

  /* ---------- Outils de lecture du texte ---------- */
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");
  const has = (t, ...words) => words.some((w) => (w instanceof RegExp ? w.test(t) : t.includes(w)));
  const STOP = new Set("je tu il elle on nous vous ils un une des de du le la les l d a au aux et ou en pour par sur avec dans est sont avez as ai avoir vend vendez vous votre vos mon ma mes ce cet cette ces qui que quoi quel quelle quels quelles combien prix cout coute coutent cher bonjour salut svp stp merci bien tres plus moins est-ce y il-y-a disponible dispo stock en-stock veux voudrais cherche besoin acheter achat avoir faut pas ne ni si oui non moi".split(" "));

  // Montants : « 2 millions », « 1,5 million », « 2M », « 500 000 », « 800k », « 2500000 »
  function parseAmount(t) {
    const m = t.match(/(\d+(?:[.,]\d+)?)\s*(millions?|m\b|mil\b)/) || t.match(/(\d+(?:[.,]\d+)?)\s*(k|mille)\b/) || t.match(/(\d{1,3}(?:[ .]\d{3})+|\d{4,})/);
    if (!m) return 0;
    const n = parseFloat(m[1].replace(/[ .](?=\d{3})/g, "").replace(",", "."));
    if (/^m/.test(m[2] || "")) return Math.round(n * 1e6);
    if (/^(k|mille)/.test(m[2] || "")) return Math.round(n * 1e3);
    return Math.round(n);
  }

  const ACCESSORY_WORDS = ["souris", "clavier", "sac", "support", "tapis", "coffret", "cle", "disque", "hdd", "ssd", "hdmi", "micro", "camera", "etiquette", "chargeur", "cable", "ecouteur", "casque", "usb"];
  const BRANDS = ["hp", "dell", "lenovo", "acer", "apple", "asus", "toshiba"];

  /* ---------- Recherche dans le catalogue ---------- */
  function searchProducts(t) {
    const list = V.products();
    const words = t.split(/[^a-z0-9]+/).filter(Boolean);
    const brand = BRANDS.find((b) => words.includes(b));
    const cpu = (t.match(/\bi\s?([3579])\b/) || t.match(/core\s*i?\s?([3579])\b/) || [])[1];
    const accessory = ACCESSORY_WORDS.find((w) => words.some((x) => x.startsWith(w)));
    const wantsLaptop = !accessory && has(t, "ordinateur", "ordi", "laptop", "portable", /\bpc\b/, "notebook", "elitebook", "latitude", "thinkpad");
    const amount = parseAmount(t);
    const max = amount && has(t, "moins", "max", "budget", "pas plus", "maximum", "jusqu", "sous ") ? amount : 0;
    const min = amount && has(t, "plus de", "au moins", "minimum", "a partir") ? amount : 0;
    const cheap = has(t, "pas cher", "moins cher", "petit prix", "economique", "le moins");
    // Numéros de modèle : « 5490 », « 840 », « g6 », « t480s » (sauf le montant d'un budget)
    const budgetWords = new Set((t.match(/\d[\d .,]*/g) || []).flatMap((x) => x.split(/[ .,]/)));
    const models = words.filter((w) => (/^\d{3,4}$/.test(w) && !(amount && (max || min || cheap) && budgetWords.has(w))) || (/^[a-z]{1,3}\d{1,4}[a-z]?$/.test(w) && !/^i[3579]$/.test(w)));
    const keys = words.filter((w) => w.length > 1 && !STOP.has(w) && !BRANDS.includes(w) && !/^i[3579]$/.test(w) && !/^\d+$/.test(w) && !models.includes(w)
      && !["ordinateur", "ordinateurs", "ordi", "laptop", "portable", "portables", "pc", "millions", "million", "gnf", "francs"].includes(w));

    let scored = list.map((p) => {
      const hay = norm(`${niceName(p.name)} ${p.brand} ${V.catName(p.category)} ${p.description} ${Object.values(p.specs || {}).join(" ")}`);
      let score = 0;
      if (brand) { if (norm(p.brand) === brand || hay.startsWith(brand)) score += 5; else return null; }
      if (cpu) { if (new RegExp(`\\bi${cpu}\\b|core i${cpu}`).test(hay)) score += 4; else return null; }
      const accHit = !!accessory && hay.includes(accessory);
      if (accessory) { if (p.category !== "accessoires" && !accHit) return null; if (accHit) score += 4; }
      if (wantsLaptop) { if (p.category !== "ordinateurs") return null; score += 1; }
      if (max && p.price > max) return null;
      if (min && p.price < min) return null;
      keys.forEach((k) => { if (hay.includes(k)) score += k.length > 3 ? 2 : 1; });
      const modelHits = models.filter((m) => new RegExp(`(^|[^a-z0-9])${m}([^a-z0-9]|$)`).test(hay)).length;
      score += modelHits * 6;
      return { p, score, modelHits, accHit };
    }).filter(Boolean);

    // Un modèle précis est demandé et existe : on ne montre que lui (et ses variantes)
    const bestModel = Math.max(0, ...scored.map((x) => x.modelHits));
    if (models.length && bestModel > 0) scored = scored.filter((x) => x.modelHits === bestModel);
    // « clavier » : seulement les claviers s'il y en a
    if (accessory && scored.some((x) => x.accHit)) scored = scored.filter((x) => x.accHit);
    const filtered = brand || cpu || accessory || wantsLaptop || max || min;
    if (!filtered) scored = scored.filter((x) => x.score > 0);
    scored.sort((a, b) => (cheap || max ? a.p.price - b.p.price : 0) || b.score - a.score || a.p.price - b.p.price);
    return { results: scored.map((x) => x.p), filtered: !!filtered || scored.length > 0, brand, cpu, accessory, max, min };
  }

  function productCards(items, q) {
    return `<div class="as-cards">${items.slice(0, 4).map((p) => `
      <div class="as-card">
        <a href="#/produit/${p.id}" class="as-img ${p.image ? "img-wait" : ""}">${V.media(p)}</a>
        <div class="as-info">
          <a href="#/produit/${p.id}" class="as-name">${esc(niceName(p.name))}</a>
          <span class="as-price">${money(p.price)}</span>
          <span class="as-stock">${p.stock <= 3 ? `Plus que ${p.stock} en stock` : "En stock"}</span>
        </div>
        <button class="as-add" data-as-add="${p.id}" aria-label="Ajouter au panier">${ic("cart", 16)}</button>
      </div>`).join("")}</div>
      ${items.length > 4 ? `<a class="as-more" href="#/boutique?q=${encodeURIComponent(q)}">Voir les ${items.length} résultats ${ic("arrow", 14)}</a>` : ""}`;
  }

  /* ---------- Réponses ---------- */
  const wa = (text) => V.waLink(text);
  const waBtn = (q, label = "Poser la question sur WhatsApp") =>
    `<a class="as-wa" target="_blank" rel="noopener" href="${wa(q ? `Bonjour ${S.name}, ${q}` : `Bonjour ${S.name} !`)}">${ic("chat", 16)}${label}</a>`;

  function answerDelivery(t) {
    const zones = V.zones().filter((z) => z.fee >= 0);
    const INLAND = ["labe", "kankan", "kindia", "nzerekore", "boke", "mamou", "siguiri", "faranah", "kissidougou", "gueckedou", "kamsar", "fria", "dalaba", "pita", "macenta", "interieur", "province"];
    const inland = INLAND.find((c) => t.includes(c));
    const CITY = { labe: "Labé", boke: "Boké", nzerekore: "Nzérékoré", gueckedou: "Guéckédou" };
    const city = inland && (CITY[inland] || cap(inland));
    const zone = zones.find((z) => (inland && z.id === "interieur") || (!inland && t.includes(norm(z.name).split(" ")[0])));
    const free = V.freeFrom();
    if (zone) {
      return `<p>${inland && inland !== "interieur" && inland !== "province" ? `Oui, nous livrons à <b>${esc(city)}</b> par expédition. ` : ""}Livraison ${zone.id === "interieur" ? "vers l'<b>intérieur du pays</b>" : `à <b>${esc(zone.name)}</b>`} : <b>${zone.fee ? money(zone.fee) : "gratuite"}</b>, délai : ${esc(zone.delay.toLowerCase())}.</p>
        ${zone.id === "interieur" ? `<p>Pour une expédition, un paiement à l'avance (Orange Money ou MTN MoMo) peut être demandé. Notre équipe vous confirme les détails :</p>${waBtn(`je souhaite une livraison à ${inland && inland !== "interieur" && inland !== "province" ? city : "l'intérieur du pays"}.`)}` : ""}
        ${free ? `<p>Livraison offerte dès <b>${money(free)}</b> d'achat${zone.freeEligible === false ? " (sauf cette zone)" : ""}.</p>` : ""}`;
    }
    return `<p>Nous livrons partout à Conakry, et aussi à l'intérieur du pays :</p>
      <ul class="as-list">${zones.map((z) => `<li><span>${esc(z.name)}</span><b>${z.fee ? money(z.fee) : "Gratuit"}</b><em>${esc(z.delay)}</em></li>`).join("")}</ul>
      ${free ? `<p>Livraison offerte à Conakry dès <b>${money(free)}</b> d'achat.</p>` : ""}
      <p>Le livreur vous appelle avant d'arriver, et vous payez à la réception.</p>`;
  }

  function answerPayment() {
    return `<p>Vous pouvez payer :</p>
      <ul class="as-bullets"><li><b>En espèces à la livraison</b> : vous payez quand vous recevez le produit.</li>
      <li><b>Orange Money</b> au ${esc(S.orangeMoneyNumber)}</li>
      <li><b>MTN Mobile Money</b> au ${esc(S.mtnMoneyNumber)}</li></ul>
      <p>Aucun paiement n'est demandé sur le site au moment de la commande.</p>`;
  }

  function answerOrderHowTo() {
    return `<p>Pour commander, c'est simple :</p>
      <ol class="as-steps"><li>Ajoutez vos produits au <b>panier</b>.</li><li>Cliquez sur <b>« Commander »</b> et indiquez votre nom, téléphone et quartier.</li><li>Confirmez : la commande nous est envoyée, nous vous rappelons et nous livrons. Vous payez à la réception.</li></ol>
      <a class="as-link" href="#/boutique">${ic("bag", 15)}Voir la boutique</a>`;
  }

  function answerTracking(t) {
    const id = (t.match(/vn-?\s?\d{6}-?\w{4}/i) || [])[0];
    const u = V.user();
    return `<p>${id ? `Pour la commande <b>${esc(id.toUpperCase())}</b>, ` : ""}${u ? `vous pouvez voir le statut de vos commandes dans <a href="#/compte">Mon compte</a>.` : `si vous avez un compte, le statut s'affiche dans <a href="#/compte">Mon compte</a>. Sinon, notre équipe vous répond tout de suite sur WhatsApp.`}</p>
      ${waBtn(`je souhaite suivre ma commande${id ? " " + id.toUpperCase() : ""}.`, "Suivre ma commande sur WhatsApp")}`;
  }

  function answerWarranty() {
    return `<p>Chaque produit a sa <b>garantie indiquée sur sa fiche</b>. En cas de défaut, signalez-le dans les <b>7 jours</b> après la réception : après vérification, nous procédons à l'échange ou à la réparation.</p>
      <p>La garantie ne couvre pas la casse, l'oxydation ou une mauvaise utilisation. <a href="#/livraison">Voir les conditions</a></p>`;
  }

  function answerShop() {
    return `<ul class="as-bullets"><li>${ic("pin", 15)} ${esc(S.address)}</li><li>${ic("clock", 15)} ${esc(S.hours)}</li><li>${ic("phone", 15)} <a href="tel:+${S.whatsapp}">${esc(S.phoneDisplay)}</a></li><li>${ic("mail", 15)} <a href="mailto:${esc(S.email)}">${esc(S.email)}</a></li></ul>
      <p>Vous pouvez aussi choisir <b>« Retrait en boutique »</b> au moment de commander.</p>`;
  }

  function answerAbout() {
    return `<p><b>${esc(S.name)}</b> vend des <b>ordinateurs portables</b> (HP, Dell, Lenovo, Acer…) et des <b>accessoires informatiques</b> à Conakry, avec livraison rapide et paiement à la réception.</p>
      <p>Notre équipe vous conseille avant et après l'achat, sur WhatsApp ou en boutique. <a href="#/a-propos">En savoir plus</a></p>`;
  }

  function answerPromo() {
    const L = V.launch();
    if (L.code && L.pct > 0) {
      return `<p>En ce moment : <b>-${L.pct} %</b> sur tout le site avec le code <b class="as-code">${esc(L.code)}</b>.</p>
        <p>Saisissez-le dans votre panier ou au moment de commander. <a href="#/lancement">Voir l'offre</a></p>`;
    }
    return `<p>Il n'y a pas d'offre en cours pour le moment. Les promotions sont signalées par un badge sur les produits. <a href="#/boutique?promo=1">Voir les promotions</a></p>`;
  }

  function answerCondition(q) {
    return `<p>L'état exact (neuf ou reconditionné), la configuration (processeur, mémoire, stockage) et la batterie dépendent de chaque ordinateur. Les informations connues sont sur la fiche du produit.</p>
      <p>Pour une réponse précise sur un modèle, notre équipe vous répond sur WhatsApp, avec des photos si besoin.</p>${waBtn(q)}`;
  }

  function answerCatalog() {
    const list = V.products();
    const laptops = list.filter((p) => p.category === "ordinateurs");
    const acc = list.filter((p) => p.category === "accessoires");
    const brands = [...new Set(laptops.map((p) => p.brand).filter(Boolean))];
    const range = (arr) => arr.length ? `de ${money(Math.min(...arr.map((p) => p.price)))} à ${money(Math.max(...arr.map((p) => p.price)))}` : "";
    return `<p>En ce moment, nous avons en stock :</p>
      <ul class="as-bullets"><li><b>${laptops.length} ordinateurs portables</b>${brands.length ? ` (${brands.join(", ")})` : ""}, ${range(laptops)}</li>
      <li><b>${acc.length} accessoires</b> (souris, claviers, sacs, supports, disques…), ${range(acc)}</li></ul>
      <p>Dites-moi ce que vous cherchez, par exemple : <i>« un HP i7 »</i> ou <i>« ordinateur à moins de 2 millions »</i>.</p>`;
  }

  function answerProducts(t, raw) {
    const r = searchProducts(t);
    if (!r.results.length) {
      if (!r.filtered) return null;
      const what = [r.brand && r.brand.toUpperCase(), r.cpu && `Core i${r.cpu}`, r.accessory, r.max && `à moins de ${money(r.max)}`].filter(Boolean).join(" ");
      return `<p>Je n'ai pas trouvé de produit en stock${what ? ` correspondant à « ${esc(what)} »` : ""} pour le moment.</p>
        <p>Nous pouvons peut-être le faire venir pour vous :</p>${waBtn(`je cherche : ${raw}. Est-ce possible ?`)}`;
    }
    const intro = r.results.length === 1 ? "Voici le produit qui correspond :" : `Voici ${Math.min(r.results.length, 4)} produit${r.results.length > 1 ? "s" : ""} qui correspond${r.results.length > 1 ? "ent" : ""}${r.results.length > 4 ? ` (sur ${r.results.length})` : ""} :`;
    return `<p>${intro}</p>${productCards(r.results, raw)}`;
  }

  /* ---------- Compréhension de la question ---------- */
  function reply(raw) {
    const t = " " + norm(raw).replace(/\s+/g, " ").trim() + " ";
    if (!t.trim()) return null;

    if (has(t, "conseiller", "humain", "parler a quelqu", "une personne", "appeler", "rappel")) {
      return `<p>Bien sûr ! Un conseiller ${esc(S.name)} vous répond sur WhatsApp.</p>${waBtn(raw && !has(t, "conseiller") ? raw : "", "Parler à un conseiller")}`;
    }
    if (/^\s*(bonjour|salut|bonsoir|hello|salam|slt|cc|coucou|bjr|hi)\b[\s!.,]*$/.test(t)) {
      return `<p>Bonjour 👋 Je suis l'assistant ${esc(S.name)}. Posez-moi une question sur nos produits, la livraison ou le paiement.</p>`;
    }
    if (/^\s*(merci|ok merci|merci beaucoup|super|parfait|top)\b/.test(t)) return `<p>Avec plaisir ! Autre chose ? Je suis là si besoin.</p>`;

    // Services : devis, réparation, reprise, comparateur, guide, avis, alerte
    if (has(t, "devis", "proforma", "pro forma", "facture pro", "entreprise", "societe", "ecole", "universite", "ong ", "en gros", "grossiste", "plusieurs ordinateurs", "quantite", "equiper", "bureau entier")) {
      return `<p>Nous équipons les <b>entreprises, écoles et ONG</b> avec des prix adaptés à la quantité. Décrivez votre besoin, nous vous envoyons un devis rapidement.</p><p><a class="as-link" href="#/devis">Demander un devis</a></p>`;
    }
    if (has(t, "reprise", "reprendre mon", "echanger mon ancien", "vendre mon ordi", "vendre mon pc", "racheter", "rachat", "troc", "mon ancien")) {
      return `<p>Oui ! Nous reprenons votre <b>ancien ordinateur</b> en échange d'une réduction sur un nouveau. Décrivez-le (marque, modèle, état) pour recevoir une estimation.</p><p><a class="as-link" href="#/reprise">Faire estimer mon ordinateur</a></p>`;
    }
    if (has(t, "reparer", "reparation", "depann", "ecran casse", "ne demarre", "ne s allume", /\blent\b/, "virus", "formater", "formatage", "installer windows", "changer la batterie", "changer l ecran") && !has(t, "garanti")) {
      return `<p>Nous réparons les ordinateurs : écran, batterie, clavier, démarrage, lenteur, virus, réinstallation de Windows… Diagnostic et prix annoncés <b>avant</b> toute intervention.</p><p><a class="as-link" href="#/reparation">Demander une réparation</a></p><p class="as-small">Produit acheté chez nous et encore sous garantie ? Dites « garantie ».</p>`;
    }
    if (has(t, "compar", "difference entre", "lequel choisir", "hesite entre", " versus ", " vs ")) {
      return `<p>Utilisez notre <b>comparateur</b> : cliquez sur l'icône « Comparer » de 2 ou 3 ordinateurs pour voir prix, processeur, mémoire et stockage côte à côte.</p><p><a class="as-link" href="#/comparer">Ouvrir le comparateur</a> <a class="as-link" href="#/guide">Guide d'achat</a></p>`;
    }
    if (has(t, "quel ordinateur", "quel pc", "choisir", "conseil", "pour etudiant", "pour les etudes", "pour le travail", "pour la bureautique", "pour le graphisme", "pour programmer", "i3 ou i5", "i5 ou i7", "difference i5")) {
      const prod = answerProducts(t, raw);
      return `<p>Notre <b>guide d'achat</b> explique comment choisir selon votre usage (études, bureau, mobilité, graphisme) et votre budget.</p><p><a class="as-link" href="#/guide">Lire le guide</a></p>${prod && /class="as-card/.test(prod) ? prod : ""}`;
    }
    if (has(t, "avis", "temoignage", "note ", "fiable", "serieux", "arnaque", "confiance")) {
      return `<p>Les <b>avis clients</b> sont visibles sur chaque fiche produit. Ils sont laissés uniquement par des clients ayant reçu le produit (achat vérifié).</p><p>Vous pouvez payer <b>à la livraison</b>, après avoir vu l'article : aucun risque.</p>`;
    }
    if (has(t, "epuise", "rupture", "plus en stock", "pas disponible", "revient", "retour en stock", "prevenir", "quand sera")) {
      return `<p>Quand un produit est épuisé, ouvrez sa fiche et cliquez sur <b>« Me prévenir du retour en stock »</b> : nous vous contactons dès son retour.</p>${waBtn(raw, "Demander sur WhatsApp")}`;
    }
    if (has(t, "facture", "recu", "bon de commande")) {
      return `<p>Votre <b>bon de commande</b> est disponible juste après la commande, et la <b>facture</b> après la livraison, dans <a href="#/mes-commandes">Mon compte › Mes commandes</a> (bouton « Facture », imprimable en PDF).</p>`;
    }

    if (has(t, "suivre", "suivi", "ma commande", "mon colis", "statut", /vn-?\s?\d{6}/, "ou en est", "pas encore recu", "pas recu")) return answerTracking(t);
    if (has(t, "livr", "delai", "expedi", "envoyer a", "interieur du pays", "frais de port", "kaloum", "dixinn", "matam", "ratoma", "matoto", "coyah", "dubreka", "kindia", "labe", "kankan", "nzerekore", "boke", "mamou")) return answerDelivery(t);
    if (has(t, "pai", "payer", "orange money", "momo", "mtn", "espece", "cash", "carte bancaire", "virement", "credit", "tranche", "acompte", "avance")) {
      if (has(t, "credit", "tranche")) return `${answerPayment()}<p>Pour un paiement en plusieurs fois, parlez-en à notre équipe :</p>${waBtn(raw)}`;
      return answerPayment();
    }
    if (has(t, "garanti", "retour", "rembours", "echang", "defaut", "panne", "repar", /\bsav\b/, "cass")) return answerWarranty();
    if (has(t, "code promo", "promo", "reduction", "remise", "rabais", "solde", "offre", "bienvenue", "coupon")) return answerPromo();
    if (has(t, "horaire", "heure", "ouvert", "ferme", "adresse", "ou etes", "ou se trouve", "situe", "localisation", "magasin", "boutique physique", "venir", "retrait", "telephone", "numero", "email", "mail", "contact", "joindre")) return answerShop();
    if (has(t, "comment commander", "comment acheter", "passer commande", "passer une commande", "comment faire pour", "comment ca marche", "commander")) {
      const prod = answerProducts(t, raw);
      return /class="as-card/.test(prod || "") ? prod : answerOrderHowTo();
    }
    if (has(t, "neuf", "occasion", "reconditionn", "etat", "batterie", /\bram\b/, "memoire", "processeur", "ecran", "tactile", "windows", "office", "logiciel", "configuration", "caracteristique", "specs", "go ", "giga")) {
      const prod = answerProducts(t, raw);
      if (prod && /class="as-card/.test(prod)) return prod + `<p class="as-small">Pour l'état exact ou la configuration d'un modèle, demandez-nous sur WhatsApp.</p>`;
      return answerCondition(raw);
    }
    if (has(t, "qui etes", "c est quoi venips", "venips c est", "votre entreprise", "a propos", "presentez", "vous faites quoi", "vous vendez quoi", "que vendez")) return answerAbout();
    if (has(t, "catalogue", "qu avez vous", "quels produits", "vous avez quoi", "liste", "tous les produits")) return answerCatalog();

    const prod = answerProducts(t, raw);
    if (prod) return prod;
    return null;
  }

  /* ---------- Fenêtre de discussion ---------- */
  const SUGGESTIONS = [
    ["Ordinateurs disponibles", "Quels ordinateurs avez-vous ?"],
    ["Livraison", "Combien coûte la livraison ?"],
    ["Paiement", "Comment payer ?"],
    ["Garantie", "Quelle est la garantie ?"],
    ["Quel ordinateur choisir ?", "Quel ordinateur choisir ?"],
    ["Devis entreprise", "Je veux un devis pour mon entreprise"],
    ["Réparation", "Je veux faire réparer mon ordinateur"],
    ["Code promo", "Avez-vous un code promo ?"],
    ["Adresse et horaires", "Où êtes-vous et à quelle heure ?"],
    ["Suivre ma commande", "Je veux suivre ma commande"]
  ];
  const KEY = "ct_assistant";
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch { history = []; }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(history.slice(-40))); } catch { /* stockage indisponible */ } };

  const launcher = document.createElement("button");
  launcher.className = "as-launcher";
  launcher.setAttribute("aria-label", "Ouvrir l'assistant Venips");
  launcher.innerHTML = `${ic("chat", 26)}<span class="as-launch-txt">Une question ?</span>`;

  const panel = document.createElement("section");
  panel.className = "as-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Assistant Venips");
  panel.hidden = true;
  panel.innerHTML = `
    <header class="as-head">
      <img src="icons/icon-192.png" alt="">
      <div><strong>Assistant ${esc(S.name)}</strong><span><i class="as-dot"></i>Répond tout de suite</span></div>
      <a class="as-head-wa" target="_blank" rel="noopener" href="${wa(`Bonjour ${S.name} !`)}" title="Parler à un conseiller sur WhatsApp">${ic("phone", 18)}</a>
      <button class="as-close" aria-label="Fermer">${ic("close", 20)}</button>
    </header>
    <div class="as-body" aria-live="polite"></div>
    <div class="as-chips"></div>
    <form class="as-form" autocomplete="off">
      <input type="text" name="q" placeholder="Écrivez votre question…" aria-label="Votre question" maxlength="300">
      <button aria-label="Envoyer">${ic("arrow", 20)}</button>
    </form>`;

  const body = panel.querySelector(".as-body");
  const chips = panel.querySelector(".as-chips");
  const input = panel.querySelector("input");

  function bubble(role, html, animate) {
    const d = document.createElement("div");
    d.className = `as-msg ${role}${animate ? " in" : ""}`;
    d.innerHTML = html;
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
  }

  function drawChips() {
    chips.innerHTML = SUGGESTIONS.map(([l, q]) => `<button type="button" data-q="${esc(q)}">${esc(l)}</button>`).join("");
  }

  function welcome() {
    return `<p>Bonjour 👋 Je suis l'<b>assistant ${esc(S.name)}</b>.</p><p>Je réponds tout de suite à vos questions sur nos <b>ordinateurs</b>, nos <b>accessoires</b>, la <b>livraison</b> et le <b>paiement</b>. Essayez par exemple : <i>« un HP i7 à moins de 2,5 millions »</i>.</p>`;
  }

  function ask(q) {
    q = String(q || "").trim().slice(0, 300);
    if (!q) return;
    bubble("user", `<p>${esc(q)}</p>`, true);
    history.push(["user", `<p>${esc(q)}</p>`]);
    const typing = document.createElement("div");
    typing.className = "as-msg bot typing";
    typing.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;
    setTimeout(() => {
      typing.parentNode && typing.parentNode.removeChild(typing);
      const r = reply(q) || `<p>Je ne suis pas sûr d'avoir bien compris 🤔 Voici ce que je peux faire :</p>
        <p>trouver un produit (<i>« souris sans fil »</i>, <i>« Dell i5 »</i>), vous renseigner sur la <b>livraison</b>, le <b>paiement</b>, la <b>garantie</b>, nos <b>horaires</b>…</p>
        <p>Ou bien un conseiller vous répond sur WhatsApp :</p>${waBtn(q)}`;
      bubble("bot", r, true);
      history.push(["bot", r]);
      save();
    }, 450 + Math.min(q.length * 8, 500));
  }

  function open() {
    panel.hidden = false;
    launcher.classList.add("open");
    document.body.classList.add("as-open");
    if (!body.childElementCount) {
      if (history.length) history.forEach(([r, h]) => bubble(r, h));
      else { bubble("bot", welcome()); history.push(["bot", welcome()]); save(); }
      drawChips();
    }
    setTimeout(() => { if (window.matchMedia("(hover: hover)").matches) input.focus(); }, 50);
  }
  function close() {
    panel.hidden = true;
    launcher.classList.remove("open");
    document.body.classList.remove("as-open");
  }

  launcher.addEventListener("click", () => (panel.hidden ? open() : close()));
  panel.querySelector(".as-close").addEventListener("click", close);
  panel.querySelector(".as-form").addEventListener("submit", (e) => { e.preventDefault(); const q = input.value; input.value = ""; ask(q); });
  chips.addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (b) ask(b.dataset.q); });
  body.addEventListener("click", (e) => {
    const add = e.target.closest("[data-as-add]");
    if (add) { V.addToCart(add.dataset.asAdd); return; }
    if (e.target.closest("a[href^='#/']") && window.matchMedia("(max-width: 720px)").matches) close();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) close(); });

  // L'assistant remplace le bouton WhatsApp flottant (WhatsApp reste accessible dans l'assistant)
  const waFloat = document.getElementById("wa-float");
  if (waFloat) waFloat.style.display = "none";
  document.body.appendChild(panel);
  document.body.appendChild(launcher);

  // Lien direct : …/#assistant ouvre l'assistant
  window.VenipsAssistant = { open, ask, reply };
})();
