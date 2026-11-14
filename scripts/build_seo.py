"""Génère, à partir des produits en ligne dans la base :
  - une page par produit (p/<id>.html) que Google peut lire et afficher dans ses résultats ;
  - sitemap.xml (liste des pages pour Google) ;
  - catalogue.csv (catalogue pour Facebook, Instagram et Google Shopping).

Lancé chaque jour par .github/workflows/seo.yml. Lit uniquement les données publiques
(même clé publique que le site), ne modifie jamais la base.
Usage : python3 scripts/build_seo.py   (depuis la racine du site)
"""
import csv
import html
import json
import os
import re
import shutil
import urllib.request

SITE = "https://www.venips.fr"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

config = open(os.path.join(ROOT, "js/config.js"), encoding="utf-8").read()
URL = re.search(r'supabaseUrl:\s*"([^"]+)"', config).group(1)
KEY = re.search(r'supabaseKey:\s*"([^"]+)"', config).group(1)


def get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def clean_specs(raw):
    out = {}
    for k, v in (raw or {}).items():
        k = re.sub(r"^[\s\-*•–]+|[\s*:]+$", "", str(k)).strip()
        v = re.sub(r"^[\s\-*•–:]+|[\s*]+$", "", str(v if v is not None else "")).strip()
        if k and v:
            out[k] = v
    return out


def money(n):
    return f"{int(round(float(n))):,}".replace(",", " ") + " GNF"


def nice(name):
    return re.sub(r"\s+", " ", str(name or "")).strip()


products = get("products?select=*&active=eq.true&stock=gt.0&order=position,created_at")
categories = {c["id"]: c["name"] for c in get("categories?select=id,name")}
esc = lambda s: html.escape(str(s or ""), quote=True)

base = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()


def replace_meta(page, attr, name, value):
    pattern = re.compile(rf'(<meta {attr}="{re.escape(name)}" content=")[^"]*(")')
    return pattern.sub(lambda m: m.group(1) + esc(value) + m.group(2), page, count=1)


out_dir = os.path.join(ROOT, "p")
shutil.rmtree(out_dir, ignore_errors=True)
os.makedirs(out_dir)

feed = []
for p in products:
    pid = p["id"]
    if not re.fullmatch(r"[a-z0-9-]+", pid):
        continue
    name = nice(p["name"])
    specs = clean_specs(p.get("specs"))
    cat = categories.get(p.get("category_id"), "")
    price = float(p["price"])
    url = f"{SITE}/p/{pid}"
    image = p.get("image_url") or f"{SITE}/images/partage.jpg"
    etat = specs.get("État", "")
    condition = "new" if etat == "Neuf" else ("used" if etat == "Occasion" else "refurbished")
    key_specs = ", ".join(v for k, v in specs.items() if k in ("Processeur", "Mémoire RAM", "Stockage", "Écran"))
    desc = nice(p.get("description")) or f"{name}{(' – ' + key_specs) if key_specs else ''}."
    meta_desc = f"{name} à {money(price)} chez Venips, Conakry. {key_specs + '. ' if key_specs else ''}Livraison rapide, paiement à la livraison, Orange Money ou MTN MoMo."[:300]
    title = f"{name} – {money(price)} | Venips Conakry"

    ld = {
        "@context": "https://schema.org", "@type": "Product", "name": name, "image": [image] + (p.get("images") or [])[:4],
        "description": desc, "sku": pid, "brand": {"@type": "Brand", "name": p.get("brand") or "Venips"},
        "category": cat,
        "offers": {"@type": "Offer", "url": url, "priceCurrency": "GNF", "price": int(round(price)),
                   "availability": "https://schema.org/InStock",
                   "itemCondition": {"new": "https://schema.org/NewCondition", "used": "https://schema.org/UsedCondition"}.get(condition, "https://schema.org/RefurbishedCondition"),
                   "seller": {"@type": "Organization", "name": "Venips"}},
    }
    page = base
    page = page.replace("<head>", '<head>\n  <base href="/">', 1)
    page = re.sub(r"<title>.*?</title>", f"<title>{esc(title)}</title>", page, count=1)
    page = replace_meta(page, "name", "description", meta_desc)
    page = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', page, count=1)
    page = replace_meta(page, "property", "og:title", title)
    page = replace_meta(page, "property", "og:description", meta_desc)
    page = replace_meta(page, "property", "og:url", url)
    page = replace_meta(page, "property", "og:image", image)
    page = replace_meta(page, "property", "og:image:alt", name)
    page = replace_meta(page, "property", "og:type", "product")
    page = re.sub(r'\s*<meta property="og:image:(width|height)" content="[^"]*">', "", page)
    page = page.replace("</head>", '  <script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("</", "<\\/") + "</script>\n</head>", 1)
    # Affiche directement la fiche produit dans la boutique
    page = page.replace("<body", f'<script>if(!location.hash||location.hash==="#/")history.replaceState(null,"",location.pathname+"#/produit/{pid}");</script>\n<body', 1)
    # Contenu lisible immédiatement (et par les robots) en attendant la boutique
    rows = "".join(f"<tr><th>{esc(k)}</th><td>{esc(v)}</td></tr>" for k, v in specs.items())
    static = (f'<div class="container" style="padding:24px 16px"><h1>{esc(name)}</h1>'
              f'<p><strong>{money(price)}</strong> · {esc(cat)} · {esc(p.get("brand"))}</p>'
              f'<img src="{esc(image)}" alt="{esc(name)}" style="max-width:360px;width:100%" referrerpolicy="no-referrer">'
              f'<p>{esc(desc)}</p>{f"<table>{rows}</table>" if rows else ""}'
              f'<p><a href="/#/produit/{pid}">Voir et commander</a></p></div>')
    page = page.replace('<main id="app" tabindex="-1"></main>', f'<main id="app" tabindex="-1">{static}</main>', 1)
    open(os.path.join(out_dir, f"{pid}.html"), "w", encoding="utf-8").write(page)

    if p.get("image_url"):
        feed.append({
            "id": pid, "title": name[:150], "description": desc[:5000], "availability": "in stock", "condition": condition,
            "price": f"{int(round(price))} GNF", "link": url, "image_link": p["image_url"], "brand": p.get("brand") or "Venips",
            "additional_image_link": ",".join((p.get("images") or [])[:10]),
            "sale_price": "", "product_type": cat, "quantity_to_sell_on_facebook": p.get("stock") or 1,
        })
        if p.get("old_price") and float(p["old_price"]) > price:
            feed[-1]["price"] = f"{int(round(float(p['old_price'])))} GNF"
            feed[-1]["sale_price"] = f"{int(round(price))} GNF"

# Page de secours pour un produit ajouté depuis la dernière mise à jour (voir vercel.json)
fallback = base.replace("<head>", '<head>\n  <base href="/">\n  <meta name="robots" content="noindex">', 1).replace(
    "<body", '<script>(function(){var m=location.pathname.match(/^\\/p\\/([a-z0-9-]+)/);if(m&&(!location.hash||location.hash==="#/"))history.replaceState(null,"",location.pathname+"#/produit/"+m[1]);})();</script>\n<body', 1)
open(os.path.join(ROOT, "produit.html"), "w", encoding="utf-8").write(fallback)

# ---------- Pages par marque, par catégorie et articles de conseils ----------
def landing(folder, slug_, title, desc, hash_, static, ld=None):
    url = f"{SITE}/{folder}/{slug_}"
    page = base.replace("<head>", '<head>\n  <base href="/">', 1)
    page = re.sub(r"<title>.*?</title>", f"<title>{esc(title)}</title>", page, count=1)
    page = replace_meta(page, "name", "description", desc[:300])
    page = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', page, count=1)
    page = replace_meta(page, "property", "og:title", title)
    page = replace_meta(page, "property", "og:description", desc[:300])
    page = replace_meta(page, "property", "og:url", url)
    if ld:
        page = page.replace("</head>", '  <script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("</", "<\\/") + "</script>\n</head>", 1)
    page = page.replace("<body", f'<script>if(!location.hash||location.hash==="#/")history.replaceState(null,"",location.pathname+"{hash_}");</script>\n<body', 1)
    page = page.replace('<main id="app" tabindex="-1"></main>', f'<main id="app" tabindex="-1"><div class="container" style="padding:24px 16px">{static}</div></main>', 1)
    d = os.path.join(ROOT, folder)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, f"{slug_}.html"), "w", encoding="utf-8").write(page)
    return url

def slugify(t):
    import unicodedata
    t = unicodedata.normalize("NFD", str(t).lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:60]

def product_list(items):
    return "<ul>" + "".join(f'<li><a href="/p/{esc(p["id"])}">{esc(nice(p["name"]))}</a> — {money(p["price"])}</li>' for p in items) + "</ul>"

extra_urls = []
for folder in ("m", "c", "conseils"):
    shutil.rmtree(os.path.join(ROOT, folder), ignore_errors=True)
brands = {}
for p in products:
    if p.get("brand"):
        brands.setdefault(p["brand"].strip(), []).append(p)
for brand, items in brands.items():
    if len(items) < 1 or not slugify(brand):
        continue
    lo = min(int(float(i["price"])) for i in items)
    title = f"Ordinateurs et accessoires {brand} à Conakry – dès {money(lo)} | Venips"
    desc = f"{len(items)} produit{'s' if len(items) > 1 else ''} {brand} en stock chez Venips à Conakry, à partir de {money(lo)}. Livraison rapide, paiement à la livraison, Orange Money ou MTN MoMo."
    static = f"<h1>{esc(brand)} à Conakry</h1><p>{esc(desc)}</p>" + product_list(items)
    extra_urls.append(landing("m", slugify(brand), title, desc, f"#/boutique?brand={brand}", static,
        {"@context": "https://schema.org", "@type": "ItemList", "name": f"{brand} chez Venips", "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{SITE}/p/{x['id']}"} for i, x in enumerate(items[:30])]}))
for cid, cname in categories.items():
    items = [p for p in products if p.get("category_id") == cid]
    if not items or not re.fullmatch(r"[a-z0-9-]+", cid):
        continue
    lo = min(int(float(i["price"])) for i in items)
    title = f"{cname} à Conakry – {len(items)} modèles dès {money(lo)} | Venips"
    desc = f"{cname} : {len(items)} produits en stock chez Venips à Conakry (HP, Dell, Lenovo…), à partir de {money(lo)}. Livraison rapide et paiement à la livraison."
    static = f"<h1>{esc(cname)} à Conakry</h1><p>{esc(desc)}</p>" + product_list(items)
    extra_urls.append(landing("c", cid, title, desc, f"#/boutique?cat={cid}", static))
try:
    posts = get("posts?select=slug,title,excerpt,body,created_at,updated_at&published=eq.true&order=created_at.desc")
except Exception:
    posts = []
for po in posts:
    if not re.fullmatch(r"[a-z0-9-]+", po["slug"]):
        continue
    body = "".join(f"<p>{esc(par.strip())}</p>" for par in re.split(r"\n\s*\n", po["body"] or "") if par.strip())
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": po["title"], "description": po.get("excerpt") or "",
          "datePublished": po["created_at"], "dateModified": po.get("updated_at") or po["created_at"], "author": {"@type": "Organization", "name": "Venips"}}
    extra_urls.append(landing("conseils", po["slug"], f"{po['title']} | Venips", po.get("excerpt") or po["title"], f"#/conseils/{po['slug']}", f"<h1>{esc(po['title'])}</h1>{body}", ld))

# Plan du site
urls = [f"  <url><loc>{SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>"]
urls += [f"  <url><loc>{u}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>" for u in extra_urls]
urls += [f"  <url><loc>{SITE}/p/{p['id']}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>"
         for p in products if re.fullmatch(r"[a-z0-9-]+", p["id"])]
open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>\n")

# Catalogue Facebook / Instagram / Google Shopping
with open(os.path.join(ROOT, "catalogue.csv"), "w", encoding="utf-8", newline="") as f:
    cols = ["id", "title", "description", "availability", "condition", "price", "sale_price", "link", "image_link",
            "additional_image_link", "brand", "product_type", "quantity_to_sell_on_facebook"]
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for row in feed:
        w.writerow(row)

print(f"{len(products)} pages produits, {len(extra_urls)} pages marques/catégories/conseils, {len(feed)} produits dans le catalogue (ceux qui ont une photo)")
