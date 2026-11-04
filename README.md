# Venips – Boutique e-commerce

Site e-commerce d'électronique pour la Guinée (prix en GNF), commandes reçues sur WhatsApp.

## Fonctionnalités
- Accueil : bannière, catégories, produits vedettes, promotions, meilleures ventes
- Boutique : recherche, filtres (catégorie, marque, prix, promo, stock), tri
- Fiche produit : prix/promo, stock, caractéristiques, produits similaires, bouton WhatsApp
- Panier (tiroir + page), quantités, codes promo, barre « livraison gratuite »
- Commande : coordonnées, zones de livraison de Conakry avec frais, paiement à la livraison / Orange Money / MTN MoMo
- La commande est envoyée sur WhatsApp avec un numéro (ex. `VN-261103-AB12`)
- Favoris, historique « Mes commandes », pages Livraison, FAQ, Contact, À propos, CGV
- Responsive (mobile d'abord), bouton WhatsApp flottant, SEO de base

## Espace administrateur
Adresse : `/admin` (ex. https://venips-ecom.vercel.app/admin)
- Tableau de bord : commandes à traiter, chiffre d'affaires du mois, stock faible
- Commandes : détail, changement de statut (annuler remet le stock), note interne, contact WhatsApp du client
- Produits : ajout / modification / suppression, photos, stock, mise en ligne
- Catégories, zones et tarifs de livraison, livraison gratuite, codes promo

## Base de données (Supabase, projet « venips »)
Tables : `categories`, `products`, `orders`, `delivery_zones`, `promo_codes`, `shop_settings`, `admins`.
- Les commandes passent par la fonction `place_order` : prix, promo, livraison et stock sont recalculés par le serveur.
- Seuls les comptes listés dans `admins` peuvent modifier les données.
- Photos produits : stockage `produits`.
- Si la base ne répond pas, la boutique affiche le catalogue de secours `js/products.js` et les commandes partent quand même sur WhatsApp.
- `.github/workflows/keep-alive.yml` interroge la base tous les 2 jours pour éviter la mise en veille du plan gratuit.

## Modifier la boutique
- **Nom, numéro WhatsApp, zones de livraison, paiements, codes promo** : `js/config.js`
- **Produits, catégories, livraison, promos** : depuis l'espace `/admin`
- **Catalogue de secours** : `js/products.js` (ajoutez `image: "https://…"` pour une vraie photo,
  ou placez la photo dans un dossier `images/` et mettez `image: "images/ma-photo.jpg"`)

## Hébergement
Site statique (HTML/CSS/JS) hébergé sur Vercel, relié à la base Supabase. Après une modification, redéployez (ou poussez sur GitHub si le
dépôt est connecté à Vercel : le déploiement est automatique).

## Tester en local
```bash
python3 -m http.server 8080
```
puis ouvrir http://localhost:8080
