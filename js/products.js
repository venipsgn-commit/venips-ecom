/* =========================================================
   CATALOGUE PRODUITS
   Pour ajouter un produit : copiez un bloc { ... } et modifiez-le.
   - id        : identifiant unique (sans espaces)
   - category  : une des catégories définies dans CATEGORIES
   - price     : prix en GNF
   - oldPrice  : ancien prix (optionnel, affiche la promo)
   - image     : lien vers une photo (optionnel). Sans photo,
                 une illustration automatique est affichée.
   - stock     : quantité disponible (0 = rupture)
   ========================================================= */
window.CATEGORIES = [
  { id: "smartphones", name: "Smartphones", icon: "phone" },
  { id: "ordinateurs", name: "Ordinateurs", icon: "laptop" },
  { id: "tablettes", name: "Tablettes", icon: "tablet" },
  { id: "televiseurs", name: "Téléviseurs", icon: "tv" },
  { id: "audio", name: "Audio & Son", icon: "headphones" },
  { id: "montres", name: "Montres connectées", icon: "watch" },
  { id: "accessoires", name: "Accessoires", icon: "charger" },
  { id: "energie", name: "Énergie & Solaire", icon: "solar" },
  { id: "gaming", name: "Gaming", icon: "gaming" }
];

window.PRODUCTS = [
  // ---------- SMARTPHONES ----------
  {
    id: "iphone-13-128", name: "iPhone 13 – 128 Go", brand: "Apple", category: "smartphones",
    price: 5900000, oldPrice: 6500000, stock: 8, featured: true, badge: "Promo",
    color: "#1f2937",
    description: "L'iPhone 13 allie puissance et élégance : puce A15 Bionic, double caméra 12 Mpx, écran Super Retina XDR 6,1\" et une autonomie toute la journée.",
    specs: { "Écran": "6,1\" OLED Super Retina XDR", "Stockage": "128 Go", "Caméra": "Double 12 Mpx", "Processeur": "A15 Bionic", "Garantie": "6 mois" }
  },
  {
    id: "galaxy-a15", name: "Samsung Galaxy A15 – 128 Go", brand: "Samsung", category: "smartphones",
    price: 1650000, oldPrice: 1850000, stock: 25, featured: true,
    color: "#1e3a8a",
    description: "Grand écran Super AMOLED 6,5\", batterie 5000 mAh et triple caméra 50 Mpx. Le smartphone idéal au meilleur prix.",
    specs: { "Écran": "6,5\" Super AMOLED 90 Hz", "Stockage": "128 Go / 4 Go RAM", "Caméra": "50 + 5 + 2 Mpx", "Batterie": "5000 mAh", "Garantie": "12 mois" }
  },
  {
    id: "galaxy-s23", name: "Samsung Galaxy S23 – 256 Go", brand: "Samsung", category: "smartphones",
    price: 7200000, stock: 5, featured: false, badge: "Premium",
    color: "#14532d",
    description: "Le haut de gamme compact de Samsung : Snapdragon 8 Gen 2, photos de nuit exceptionnelles et écran Dynamic AMOLED 120 Hz.",
    specs: { "Écran": "6,1\" Dynamic AMOLED 2X 120 Hz", "Stockage": "256 Go / 8 Go RAM", "Caméra": "50 + 12 + 10 Mpx", "Batterie": "3900 mAh", "Garantie": "12 mois" }
  },
  {
    id: "tecno-spark-20", name: "Tecno Spark 20 – 256 Go", brand: "Tecno", category: "smartphones",
    price: 1150000, oldPrice: 1300000, stock: 30, featured: true, badge: "Promo",
    color: "#0e7490",
    description: "Design élégant, 256 Go de stockage, 8 Go de RAM et une batterie 5000 mAh avec charge rapide 18 W.",
    specs: { "Écran": "6,6\" HD+ 90 Hz", "Stockage": "256 Go / 8 Go RAM", "Caméra": "50 Mpx", "Batterie": "5000 mAh", "Garantie": "12 mois" }
  },
  {
    id: "infinix-hot-40", name: "Infinix Hot 40 Pro", brand: "Infinix", category: "smartphones",
    price: 1350000, stock: 18,
    color: "#6d28d9",
    description: "Écran 120 Hz, son stéréo JBL et charge rapide 33 W pour profiter de vos vidéos et jeux sans compromis.",
    specs: { "Écran": "6,78\" FHD+ 120 Hz", "Stockage": "256 Go / 8 Go RAM", "Caméra": "108 Mpx", "Batterie": "5000 mAh · 33 W", "Garantie": "12 mois" }
  },
  {
    id: "redmi-note-13", name: "Xiaomi Redmi Note 13", brand: "Xiaomi", category: "smartphones",
    price: 1950000, stock: 14,
    color: "#b91c1c",
    description: "Écran AMOLED 120 Hz, appareil photo 108 Mpx et charge 33 W. Le meilleur rapport qualité-prix de Xiaomi.",
    specs: { "Écran": "6,67\" AMOLED 120 Hz", "Stockage": "256 Go / 8 Go RAM", "Caméra": "108 Mpx", "Batterie": "5000 mAh", "Garantie": "12 mois" }
  },

  // ---------- ORDINATEURS ----------
  {
    id: "macbook-air-m1", name: "MacBook Air M1 – 256 Go", brand: "Apple", category: "ordinateurs",
    price: 7900000, oldPrice: 8600000, stock: 4, featured: true, badge: "Promo",
    color: "#64748b",
    description: "Ultra-léger, silencieux et jusqu'à 18 h d'autonomie. La puce M1 rend tout plus rapide.",
    specs: { "Écran": "13,3\" Retina", "Processeur": "Apple M1", "Mémoire": "8 Go", "Stockage": "256 Go SSD", "Garantie": "6 mois" }
  },
  {
    id: "hp-250-g9", name: "HP 250 G9 – Core i5", brand: "HP", category: "ordinateurs",
    price: 4800000, stock: 10, featured: true,
    color: "#0f172a",
    description: "Le portable professionnel fiable pour le bureau, l'école et les études. Core i5 12e génération, SSD rapide.",
    specs: { "Écran": "15,6\" Full HD", "Processeur": "Intel Core i5-1235U", "Mémoire": "8 Go", "Stockage": "512 Go SSD", "Garantie": "12 mois" }
  },
  {
    id: "lenovo-ideapad-3", name: "Lenovo IdeaPad 3 – Core i3", brand: "Lenovo", category: "ordinateurs",
    price: 3600000, oldPrice: 3950000, stock: 9, badge: "Promo",
    color: "#334155",
    description: "Un ordinateur portable abordable et performant pour les tâches du quotidien.",
    specs: { "Écran": "15,6\" Full HD", "Processeur": "Intel Core i3", "Mémoire": "8 Go", "Stockage": "256 Go SSD", "Garantie": "12 mois" }
  },
  {
    id: "dell-latitude", name: "Dell Latitude 5420 (reconditionné)", brand: "Dell", category: "ordinateurs",
    price: 3200000, stock: 7,
    color: "#1e293b",
    description: "Portable professionnel robuste, reconditionné et testé. Idéal pour les entreprises.",
    specs: { "Écran": "14\" Full HD", "Processeur": "Intel Core i5 11e gén.", "Mémoire": "16 Go", "Stockage": "256 Go SSD", "Garantie": "6 mois" }
  },

  // ---------- TABLETTES ----------
  {
    id: "ipad-10", name: "iPad 10e génération – 64 Go", brand: "Apple", category: "tablettes",
    price: 4300000, stock: 6,
    color: "#2563eb",
    description: "Écran Liquid Retina 10,9\", puce A14 Bionic et USB-C. Parfait pour travailler, apprendre et se divertir.",
    specs: { "Écran": "10,9\" Liquid Retina", "Stockage": "64 Go", "Processeur": "A14 Bionic", "Connectivité": "Wi-Fi", "Garantie": "6 mois" }
  },
  {
    id: "galaxy-tab-a9", name: "Samsung Galaxy Tab A9+", brand: "Samsung", category: "tablettes",
    price: 2100000, oldPrice: 2350000, stock: 11, badge: "Promo",
    color: "#475569",
    description: "Grand écran 11\" 90 Hz, quatre haut-parleurs et une batterie longue durée pour toute la famille.",
    specs: { "Écran": "11\" 90 Hz", "Stockage": "64 Go / 4 Go RAM", "Batterie": "7040 mAh", "Connectivité": "Wi-Fi", "Garantie": "12 mois" }
  },

  // ---------- TÉLÉVISEURS ----------
  {
    id: "tcl-43-smart", name: "TV TCL 43\" Smart Android", brand: "TCL", category: "televiseurs",
    price: 3200000, oldPrice: 3600000, stock: 12, featured: true, badge: "Promo",
    color: "#111827",
    description: "Téléviseur Full HD 43 pouces avec Android TV, YouTube, Netflix et Google Assistant intégrés.",
    specs: { "Taille": "43 pouces", "Résolution": "Full HD", "Système": "Android TV", "Connectique": "3 HDMI · 2 USB · Wi-Fi", "Garantie": "12 mois" }
  },
  {
    id: "samsung-55-4k", name: "TV Samsung 55\" Crystal 4K UHD", brand: "Samsung", category: "televiseurs",
    price: 6500000, stock: 5, badge: "4K",
    color: "#0b1220",
    description: "Image 4K éclatante avec le processeur Crystal 4K et des couleurs naturelles. Smart TV Tizen.",
    specs: { "Taille": "55 pouces", "Résolution": "4K UHD", "Système": "Tizen Smart TV", "Connectique": "3 HDMI · 2 USB · Wi-Fi", "Garantie": "12 mois" }
  },

  // ---------- AUDIO ----------
  {
    id: "jbl-flip-6", name: "Enceinte JBL Flip 6", brand: "JBL", category: "audio",
    price: 1150000, stock: 15, featured: true,
    color: "#ea580c",
    description: "Son puissant JBL Original Pro Sound, étanche IP67 et 12 heures d'autonomie.",
    specs: { "Autonomie": "12 heures", "Étanchéité": "IP67", "Connexion": "Bluetooth 5.1", "Puissance": "30 W", "Garantie": "12 mois" }
  },
  {
    id: "airpods-pro-2", name: "Apple AirPods Pro (2e gén.)", brand: "Apple", category: "audio",
    price: 2300000, stock: 9,
    color: "#e5e7eb",
    description: "Réduction active du bruit, audio spatial et boîtier de charge MagSafe USB-C.",
    specs: { "Réduction de bruit": "Active (ANC)", "Autonomie": "6 h (30 h avec boîtier)", "Connexion": "Bluetooth 5.3", "Charge": "USB-C / MagSafe", "Garantie": "6 mois" }
  },
  {
    id: "oraimo-freepods", name: "Écouteurs Oraimo FreePods 4", brand: "Oraimo", category: "audio",
    price: 290000, oldPrice: 350000, stock: 40, badge: "Promo",
    color: "#16a34a",
    description: "Écouteurs sans fil avec réduction de bruit et 35 heures d'autonomie au total.",
    specs: { "Autonomie": "35 heures", "Réduction de bruit": "ANC", "Connexion": "Bluetooth 5.3", "Étanchéité": "IPX5", "Garantie": "12 mois" }
  },
  {
    id: "sony-wh1000", name: "Casque Sony WH-1000XM5", brand: "Sony", category: "audio",
    price: 3400000, stock: 4,
    color: "#27272a",
    description: "La référence de la réduction de bruit : son haute résolution et 30 h d'autonomie.",
    specs: { "Réduction de bruit": "ANC intelligente", "Autonomie": "30 heures", "Connexion": "Bluetooth 5.2", "Charge rapide": "3 min = 3 h", "Garantie": "12 mois" }
  },

  // ---------- MONTRES ----------
  {
    id: "galaxy-watch-6", name: "Samsung Galaxy Watch 6", brand: "Samsung", category: "montres",
    price: 2400000, stock: 7,
    color: "#1f2937",
    description: "Suivi de santé avancé, sommeil, fréquence cardiaque et notifications à votre poignet.",
    specs: { "Écran": "1,3\" Super AMOLED", "Autonomie": "40 heures", "Étanchéité": "5 ATM", "Compatibilité": "Android", "Garantie": "12 mois" }
  },
  {
    id: "oraimo-watch", name: "Oraimo Watch 4 Plus", brand: "Oraimo", category: "montres",
    price: 380000, oldPrice: 450000, stock: 25, badge: "Promo",
    color: "#0f766e",
    description: "Montre connectée avec appels Bluetooth, 100+ modes sport et 7 jours d'autonomie.",
    specs: { "Écran": "1,95\" HD", "Autonomie": "7 jours", "Appels": "Bluetooth", "Étanchéité": "IP68", "Garantie": "12 mois" }
  },

  // ---------- ACCESSOIRES ----------
  {
    id: "powerbank-20000", name: "Power Bank Oraimo 20 000 mAh", brand: "Oraimo", category: "accessoires",
    price: 250000, stock: 60, featured: true,
    color: "#15803d",
    description: "Batterie externe haute capacité avec charge rapide 22,5 W. Rechargez votre téléphone jusqu'à 5 fois.",
    specs: { "Capacité": "20 000 mAh", "Puissance": "22,5 W", "Ports": "2 USB-A · 1 USB-C", "Poids": "380 g", "Garantie": "12 mois" }
  },
  {
    id: "chargeur-samsung-25w", name: "Chargeur Samsung 25 W USB-C", brand: "Samsung", category: "accessoires",
    price: 150000, stock: 50,
    color: "#111827",
    description: "Chargeur rapide original Samsung 25 W avec câble USB-C inclus.",
    specs: { "Puissance": "25 W", "Connecteur": "USB-C", "Câble": "Inclus (1 m)", "Compatibilité": "Samsung, Android, iPhone 15", "Garantie": "6 mois" }
  },
  {
    id: "coque-iphone", name: "Coque + verre trempé iPhone", brand: "Générique", category: "accessoires",
    price: 75000, stock: 100,
    color: "#7c3aed",
    description: "Pack protection : coque antichoc transparente + verre trempé 9H. Disponible pour iPhone 11 à 15.",
    specs: { "Contenu": "1 coque + 1 verre trempé", "Dureté": "9H", "Modèles": "iPhone 11 à 15", "Matière": "TPU antichoc", "Garantie": "—" }
  },
  {
    id: "cle-usb-64", name: "Clé USB SanDisk 64 Go", brand: "SanDisk", category: "accessoires",
    price: 95000, stock: 80,
    color: "#dc2626",
    description: "Clé USB 3.0 rapide et fiable pour transporter vos documents, photos et vidéos.",
    specs: { "Capacité": "64 Go", "Interface": "USB 3.0", "Vitesse": "Jusqu'à 100 Mo/s", "Format": "Compact", "Garantie": "12 mois" }
  },

  // ---------- ÉNERGIE ----------
  {
    id: "kit-solaire-300", name: "Kit solaire 300 W complet", brand: "SolarMax", category: "energie",
    price: 4500000, oldPrice: 5200000, stock: 6, featured: true, badge: "Promo",
    color: "#ca8a04",
    description: "Ne subissez plus les coupures : panneau 300 W, batterie 200 Ah, onduleur 1000 W et câblage. Alimente lumières, TV, ventilateur et téléphones.",
    specs: { "Panneau": "300 W monocristallin", "Batterie": "200 Ah gel", "Onduleur": "1000 W pur sinus", "Usage": "Maison / boutique", "Garantie": "12 mois" }
  },
  {
    id: "onduleur-1500", name: "Onduleur / Stabilisateur 1500 VA", brand: "APC", category: "energie",
    price: 1800000, stock: 8,
    color: "#374151",
    description: "Protégez vos appareils des coupures et variations de courant. Idéal pour ordinateurs et box internet.",
    specs: { "Puissance": "1500 VA / 900 W", "Prises": "6", "Autonomie": "15 – 30 min", "Protection": "Surtension · foudre", "Garantie": "12 mois" }
  },
  {
    id: "lampe-solaire", name: "Lampe solaire rechargeable LED", brand: "Générique", category: "energie",
    price: 120000, stock: 70,
    color: "#eab308",
    description: "Lampe LED puissante avec panneau solaire et port USB pour recharger votre téléphone.",
    specs: { "Autonomie": "Jusqu'à 12 h", "Recharge": "Solaire / USB", "Sortie": "USB 5 V", "Luminosité": "3 niveaux", "Garantie": "6 mois" }
  },

  // ---------- GAMING ----------
  {
    id: "ps5-slim", name: "PlayStation 5 Slim", brand: "Sony", category: "gaming",
    price: 6800000, stock: 3, featured: true, badge: "Nouveau",
    color: "#1d4ed8",
    description: "La console nouvelle génération de Sony, plus fine, avec SSD ultra-rapide et manette DualSense.",
    specs: { "Stockage": "1 To SSD", "Résolution": "Jusqu'à 4K 120 fps", "Lecteur": "Blu-ray", "Manette": "DualSense incluse", "Garantie": "12 mois" }
  },
  {
    id: "manette-ps5", name: "Manette DualSense PS5", brand: "Sony", category: "gaming",
    price: 850000, stock: 12,
    color: "#f8fafc",
    description: "Retour haptique et gâchettes adaptatives pour une immersion totale.",
    specs: { "Connexion": "Bluetooth / USB-C", "Batterie": "Rechargeable", "Compatibilité": "PS5 · PC", "Fonctions": "Haptique, micro intégré", "Garantie": "6 mois" }
  }
];
