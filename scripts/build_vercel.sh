#!/bin/sh
# Prépare le site publié par Vercel dans dist/.
# L'espace de gestion n'est publié qu'à l'adresse privée définie dans Vercel
# (Settings › Environment Variables › ADMIN_PAGE). Sans ce réglage, il n'est pas publié du tout.
set -e
rm -rf dist
mkdir dist
cp -R index.html produit.html robots.txt sitemap.xml catalogue.csv manifest.webmanifest sw.js css js images icons p dist/
if [ -n "$ADMIN_PAGE" ]; then
  cp prive/gestion.html "dist/$ADMIN_PAGE.html"
  echo "Espace de gestion publié à l'adresse privée."
else
  echo "ADMIN_PAGE non défini : espace de gestion non publié."
fi
