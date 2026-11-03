# Conakry Tech – Boutique e-commerce

Site e-commerce d'électronique pour la Guinée (prix en GNF), commandes reçues sur WhatsApp.

## Fonctionnalités
- Accueil : bannière, catégories, produits vedettes, promotions, meilleures ventes
- Boutique : recherche, filtres (catégorie, marque, prix, promo, stock), tri
- Fiche produit : prix/promo, stock, caractéristiques, produits similaires, bouton WhatsApp
- Panier (tiroir + page), quantités, codes promo, barre « livraison gratuite »
- Commande : coordonnées, zones de livraison de Conakry avec frais, paiement à la livraison / Orange Money / MTN MoMo
- La commande est envoyée sur WhatsApp avec un numéro (ex. `CT-261103-AB12`)
- Favoris, historique « Mes commandes », pages Livraison, FAQ, Contact, À propos, CGV
- Responsive (mobile d'abord), bouton WhatsApp flottant, SEO de base

## Modifier la boutique
- **Nom, numéro WhatsApp, zones de livraison, paiements, codes promo** : `js/config.js`
- **Produits et catégories** : `js/products.js` (ajoutez `image: "https://…"` pour une vraie photo,
  ou placez la photo dans un dossier `images/` et mettez `image: "images/ma-photo.jpg"`)

## Hébergement
Site 100 % statique (HTML/CSS/JS, aucune base de données ni serveur) : hébergé sur Vercel,
il ne se met jamais en veille. Après une modification, redéployez (ou poussez sur GitHub si le
dépôt est connecté à Vercel : le déploiement est automatique).

## Tester en local
```bash
python3 -m http.server 8080
```
puis ouvrir http://localhost:8080
