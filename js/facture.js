/* =========================================================
   Venips – facture / reçu imprimable (enregistrable en PDF)
   Utilisé par la boutique (Mon compte, confirmation) et par l'admin.
   ========================================================= */
(function () {
  "use strict";
  const S = window.STORE || {};
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR").replace(/ | /g, " ") + " " + (S.currency || "GNF");
  const STATUS = { nouvelle: "Reçue", confirmee: "Confirmée", en_livraison: "En livraison", livree: "Livrée", annulee: "Annulée" };

  /**
   * order : { id, created_at, status, customer_name, customer_phone, customer_email, address, zone_name,
   *           payment, items:[{name, price, qty}], subtotal, reduction, promo_code, delivery, total }
   */
  function open(order) {
    const o = order || {};
    const delivered = o.status === "livree";
    const title = delivered ? "Facture" : "Bon de commande";
    const date = new Date(o.created_at || Date.now()).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const base = location.origin + "/";
    const legal = S.legal || {};
    const w = window.open("", "_blank");
    if (!w) { alert("Autorisez l'ouverture des fenêtres pour afficher la facture."); return; }
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title} ${esc(o.id)} – ${esc(S.name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; } body { margin: 0; font-family: "Inter", Arial, sans-serif; color: #0f172a; background: #eef1f6; }
  .page { max-width: 820px; margin: 24px auto; background: #fff; padding: 40px 44px; border-radius: 12px; box-shadow: 0 10px 30px rgba(15,23,42,.08); }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid #0f014c; padding-bottom: 20px; }
  .brand { background: #0f014c; border-radius: 10px; padding: 10px 14px; display: inline-block; }
  .brand img { height: 46px; display: block; }
  .shop { font-size: 13px; color: #475569; margin-top: 10px; line-height: 1.6; }
  .doc { text-align: right; } .doc h1 { margin: 0; font-size: 28px; color: #0f014c; letter-spacing: -.02em; }
  .doc p { margin: 4px 0; font-size: 14px; } .pill { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 99px; background: #e3faf8; color: #087f78; font-weight: 700; font-size: 12px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 26px 0; }
  .cols h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #7c8699; }
  .cols p { margin: 2px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; background: #f4f6fb; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; padding: 10px 12px; }
  td { padding: 12px; border-bottom: 1px solid #eef1f6; } td.r, th.r { text-align: right; white-space: nowrap; }
  .totals { margin: 18px 0 0 auto; width: 320px; font-size: 14px; }
  .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
  .totals .grand { border-top: 2px solid #0f014c; margin-top: 6px; padding-top: 10px; font-size: 18px; font-weight: 800; color: #0f014c; }
  .note { margin-top: 30px; padding: 14px 16px; background: #f8fafc; border-radius: 10px; font-size: 13px; color: #475569; line-height: 1.6; }
  .foot { margin-top: 26px; text-align: center; font-size: 12px; color: #94a3b8; }
  .actions { max-width: 820px; margin: 16px auto 0; display: flex; gap: 10px; justify-content: flex-end; padding: 0 16px; }
  .actions button { border: 0; border-radius: 10px; padding: 11px 18px; font-weight: 700; font-size: 14px; cursor: pointer; background: #0b9b93; color: #fff; }
  .actions button.sec { background: #fff; color: #0f172a; border: 1px solid #dbe1ea; }
  @media (max-width: 640px) { .page { padding: 22px 18px; margin: 12px; } .top, .cols { display: block; } .doc { text-align: left; margin-top: 16px; } .cols > div { margin-bottom: 16px; } .totals { width: 100%; } }
  @media print { body { background: #fff; } .page { box-shadow: none; margin: 0; max-width: none; border-radius: 0; } .actions { display: none; } }
</style></head><body>
<div class="actions"><button class="sec" onclick="window.close()">Fermer</button><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
<div class="page">
  <div class="top">
    <div>
      <div class="brand"><img src="${base}images/logo.jpg" alt="${esc(S.name)}"></div>
      <div class="shop">${esc(S.address || "")}<br>Tél. / WhatsApp : ${esc(S.phoneDisplay || "")}<br>${esc(S.email || "")}
        ${legal.rccm ? `<br>RCCM : ${esc(legal.rccm)}` : ""}${legal.nif ? `<br>NIF : ${esc(legal.nif)}` : ""}</div>
    </div>
    <div class="doc"><h1>${title}</h1><p>N° <b>${esc(o.id)}</b></p><p>Date : ${date}</p><span class="pill">${esc(STATUS[o.status] || "Reçue")}</span></div>
  </div>
  <div class="cols">
    <div><h3>Client</h3><p><b>${esc(o.customer_name)}</b></p><p>${esc(o.customer_phone)}</p>${o.customer_email ? `<p>${esc(o.customer_email)}</p>` : ""}</div>
    <div><h3>Livraison</h3><p>${esc(o.address)}</p><p>${esc(o.zone_name)}</p><h3 style="margin-top:12px">Paiement</h3><p>${esc(o.payment)}</p></div>
  </div>
  <table>
    <thead><tr><th>Désignation</th><th class="r">Prix unitaire</th><th class="r">Qté</th><th class="r">Total</th></tr></thead>
    <tbody>${(o.items || []).map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${money(i.price)}</td><td class="r">${Number(i.qty)}</td><td class="r">${money(i.price * i.qty)}</td></tr>`).join("")}</tbody>
  </table>
  <div class="totals">
    <div><span>Sous-total</span><span>${money(o.subtotal)}</span></div>
    ${Number(o.reduction) ? `<div><span>Réduction${o.pack_name ? ` (${esc(o.pack_name)}${o.promo_code ? " + " + esc(o.promo_code) : ""})` : o.promo_code ? ` (${esc(o.promo_code)})` : ""}</span><span>-${money(o.reduction)}</span></div>` : ""}
    ${Number(o.points_used) ? `<div><span>Points fidélité</span><span>-${money(o.points_used)}</span></div>` : ""}
    <div><span>Livraison</span><span>${Number(o.delivery) ? money(o.delivery) : "Gratuite"}</span></div>
    <div class="grand"><span>Total</span><span>${money(o.total)}</span></div>
  </div>
  ${(o.warranties || []).length ? `<h3 style="margin:26px 0 8px;font-size:15px;color:#0f014c">Garantie</h3><table><thead><tr><th>Appareil</th><th>N° de série</th><th>Certificat</th><th class="r">Valable jusqu'au</th></tr></thead><tbody>${o.warranties.map((w) => { const e = new Date(w.start_date); e.setMonth(e.getMonth() + Number(w.months)); return `<tr><td>${esc(w.product_name)}</td><td>${esc(w.serial || "—")}</td><td>${esc(w.id)}</td><td class="r">${e.toLocaleDateString("fr-FR")}</td></tr>`; }).join("")}</tbody></table><p style="font-size:12px;color:#64748b;margin:6px 0 0">Vérifiez cette garantie à tout moment sur ${esc(location.host)}/#/garantie</p>` : ""}
  <div class="note">${delivered
    ? "Merci pour votre achat. Conservez ce document : il vous sera demandé pour toute demande de garantie ou d'échange."
    : "Ce bon de commande récapitule votre commande. La facture définitive est disponible après la livraison."}
    Les conditions de garantie et de retour sont indiquées sur ${esc(location.host)}.</div>
  <div class="foot">${esc(S.name)} · ${esc(location.host)} · Merci de votre confiance</div>
</div></body></html>`);
    w.document.close();
  }

  window.VenipsInvoice = { open };
})();
