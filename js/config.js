/* =========================================================
   CONFIGURATION DE LA BOUTIQUE
   Modifiez ce fichier pour changer le nom, le numéro WhatsApp,
   les zones de livraison, les modes de paiement, etc.
   ========================================================= */
window.STORE = {
  // Base de données Supabase (clé publique : elle peut être visible, la sécurité est assurée par la base)
  supabaseUrl: "https://qsymsxmuevhiefjzywqb.supabase.co",
  supabaseKey: "sb_publishable_0rVuA_2p8zXasxOcdu4vVQ_HwWmmRrc",

  name: "Venips",
  tagline: "Ordinateurs portables et accessoires informatiques, livrés chez vous à Conakry",
  logoText: "V",
  logoImage: "images/logo.jpg", // mettre "" pour afficher le logo texte

  // Numéro WhatsApp qui reçoit les commandes (format international, sans + ni espaces)
  whatsapp: "224628880354",
  phoneDisplay: "+224 628 88 03 54",
  email: "venips.gn@gmail.com",
  address: "Conakry, République de Guinée",
  hours: "Lun – Sam : 8h00 – 20h00 · Dim : 10h00 – 18h00",

  currency: "GNF",

  // Chiffres affichés dans la bannière d'accueil (modifiables)
  // 915 articles vendus du 30 mars au 5 novembre 2026 d'après le logiciel de gestion
  stats: [
    { value: "900+", label: "articles vendus depuis mars 2026" },
    { value: "Jour même", label: "livraison à Conakry" },
    { value: "7j/7", label: "conseil sur WhatsApp" }
  ],

  // Offre de lancement : code promo mis en avant (bandeau + page /#/lancement).
  // Le bandeau ne s'affiche que si ce code est actif dans l'admin (Codes promo). Mettre "" pour le retirer.
  launchCode: "BIENVENUE",

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
