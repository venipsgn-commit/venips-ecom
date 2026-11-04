/* =========================================================
   CONFIGURATION DE LA BOUTIQUE
   Modifiez ce fichier pour changer le nom, le numéro WhatsApp,
   les zones de livraison, les modes de paiement, etc.
   ========================================================= */
window.STORE = {
  name: "Venips",
  tagline: "L'électronique de qualité, livrée chez vous à Conakry",
  logoText: "V",
  logoImage: "images/logo.jpg", // mettre "" pour afficher le logo texte

  // Numéro WhatsApp qui reçoit les commandes (format international, sans + ni espaces)
  whatsapp: "224628880354",
  phoneDisplay: "+224 628 88 03 54",
  email: "contact@venips.com",
  address: "Conakry, République de Guinée",
  hours: "Lun – Sam : 8h00 – 20h00 · Dim : 10h00 – 18h00",

  currency: "GNF",

  // Livraison gratuite à partir de ce montant (GNF). Mettre 0 pour désactiver.
  freeDeliveryFrom: 5000000,

  deliveryZones: [
    { id: "kaloum", name: "Kaloum", fee: 20000, delay: "Le jour même" },
    { id: "dixinn", name: "Dixinn", fee: 25000, delay: "Le jour même" },
    { id: "matam", name: "Matam", fee: 25000, delay: "Le jour même" },
    { id: "ratoma", name: "Ratoma", fee: 30000, delay: "Le jour même" },
    { id: "matoto", name: "Matoto", fee: 30000, delay: "24h" },
    { id: "coyah", name: "Coyah / Dubréka", fee: 50000, delay: "24 – 48h" },
    { id: "interieur", name: "Intérieur du pays (expédition)", fee: 100000, delay: "2 – 5 jours" },
    { id: "retrait", name: "Retrait en boutique", fee: 0, delay: "Dès confirmation" }
  ],

  payments: [
    { id: "livraison", name: "Paiement à la livraison", desc: "Payez en espèces à la réception de votre colis." },
    { id: "orange", name: "Orange Money", desc: "Envoyez le montant au numéro Orange Money ci-dessous, puis partagez la capture sur WhatsApp." },
    { id: "mtn", name: "MTN Mobile Money", desc: "Envoyez le montant au numéro MoMo ci-dessous, puis partagez la capture sur WhatsApp." }
  ],
  orangeMoneyNumber: "+224 628 88 03 54",
  mtnMoneyNumber: "+224 628 88 03 54",

  // Codes promo : CODE -> pourcentage de réduction
  promoCodes: {
    BIENVENUE: 5,
    TECH10: 10
  },

  socials: {
    facebook: "",
    instagram: "",
    tiktok: ""
  }
};
