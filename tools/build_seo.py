"""Build the static, crawlable pages: one per country, one per continent,
an A-Z index, sitemap.xml and robots.txt.

Everything is generated from assets/js/data.js, so after changing the data
run this again and commit the output:

    python3 tools/build_seo.py
"""
import datetime
import html
import json
import math
import re
import shutil
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://www.learngeo.app'
REGIONS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']
STATUS = {
    0: 'UN member state',
    1: 'UN observer state',
    2: 'Territory or partially recognised state',
}


# ------------------------------------------------------------- data ----
def js_string(s):
    """The quoted strings in data.js are JSON-compatible apart from quotes."""
    if s[0] == "'":
        s = '"' + s[1:-1].replace('\\\'', "'").replace('"', '\\"') + '"'
    return json.loads(s)


STR = r"""('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")"""


def block(src, name, close):
    start = src.index('var ' + name + ' = ')
    return src[start:src.index(close, start)]


def load():
    src = (ROOT / 'assets/js/data.js').read_text(encoding='utf-8')
    raw = re.findall(r'\[\s*' + STR + r'\s*,\s*' + STR +
                     r'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*' + STR + r'\s*,\s*(\d)\s*\]',
                     block(src, 'RAW', '];'))
    notes = dict((js_string(k), js_string(v)) for k, v in
                 re.findall(STR + r'\s*:\s*' + STR, block(src, 'NOTES', '};')))
    flags = dict((js_string(k), js_string(v)) for k, v in
                 re.findall(STR + r'\s*:\s*' + STR, block(src, 'FLAG_CODES', '};')))
    out = []
    for name, cap, lat, lon, region, status in raw:
        name = js_string(name)
        out.append({
            'name': name, 'capital': js_string(cap), 'lat': float(lat), 'lon': float(lon),
            'region': js_string(region), 'status': int(status),
            'note': notes.get(name, ''), 'iso2': flags.get(name, ''),
        })
    return out


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def km(a, b):
    la1, la2 = math.radians(a['lat']), math.radians(b['lat'])
    dl = math.radians(b['lon'] - a['lon'])
    h = (math.sin((la2 - la1) / 2) ** 2 +
         math.cos(la1) * math.cos(la2) * math.sin(dl / 2) ** 2)
    return 6371 * 2 * math.asin(math.sqrt(h))


def coord(v, pos, neg):
    return '%.2f°%s' % (abs(v), pos if v >= 0 else neg)


# ----------------------------------------------------------- render ----
e = html.escape


def page(path, title, desc, body, crumbs, extra_ld=None):
    url = SITE + path
    ld = [{
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': SITE + p}
            for i, (n, p) in enumerate(crumbs)
        ],
    }]
    if extra_ld:
        ld.append(extra_ld)
    nav = ' <span aria-hidden="true">›</span> '.join(
        '<a href="%s">%s</a>' % (p, e(n)) for n, p in crumbs[:-1]) + \
        ' <span aria-hidden="true">›</span> <span>%s</span>' % e(crumbs[-1][0])
    return '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<link rel="canonical" href="%(url)s">
<link rel="icon" href="/assets/img/brand/favicon.ico" sizes="any">
<link rel="icon" href="/assets/img/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/img/brand/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/assets/img/brand/favicon-48.png" type="image/png" sizes="48x48">
<link rel="apple-touch-icon" href="/assets/img/brand/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="article">
<meta property="og:site_name" content="LearnGeo">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(url)s">
<meta property="og:image" content="%(site)s/assets/img/brand/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/seo.css">
<link rel="stylesheet" href="/assets/css/ads.css">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6903921330074472" crossorigin="anonymous"></script>
<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>
<script src="/assets/js/metrics-config.js"></script>
<script src="/assets/js/metrics.js"></script>
<script type="application/ld+json">%(ld)s</script>
</head>
<body>
<header class="sp-top">
  <a class="sp-brand" href="/"><img src="/assets/img/brand/mark.svg" alt="" width="32" height="32"> LearnGeo</a>
  <nav class="sp-nav"><a href="/countries">Countries</a><a href="/teachers.html">For teachers</a>
  <a class="sp-btn sp-btn--sm" href="/">Start learning</a></nav>
</header>
<main class="sp-main">
<nav class="sp-crumbs" aria-label="Breadcrumb">%(nav)s</nav>
%(body)s
</main>
<footer class="sp-foot">
  <span>© LearnGeo · Learn every country and capital, free.</span>
  <span>%(regions)s</span>
</footer>
</body>
</html>
''' % {
        'title': e(title), 'desc': e(desc), 'url': url, 'site': SITE, 'nav': nav, 'body': body,
        'ld': json.dumps(ld, ensure_ascii=False).replace('</', '<\\/'),
        'regions': ' · '.join('<a href="/continents/%s">%s</a>' % (slug(r), r) for r in REGIONS),
    }


def flag(c, cls='sp-flag'):
    if not c['iso2']:
        return ''
    return '<img class="%s" src="/assets/flags/%s.svg" alt="Flag of %s" width="96" height="64" loading="lazy">' % (
        cls, c['iso2'], e(c['name']))


def chips(cs):
    return '<ul class="sp-chips">' + ''.join(
        '<li><a href="/countries/%s">%s<span>%s</span></a></li>' % (slug(c['name']), e(c['name']), e(c['capital']))
        for c in cs) + '</ul>'


def country_page(c, everyone):
    others = [o for o in everyone if o is not c]
    near = sorted(others, key=lambda o: km(c, o))[:6]
    same = sorted([o for o in others if o['region'] == c['region']], key=lambda o: o['name'])
    region_list = [o for o in everyone if o['region'] == c['region']]
    rank = sorted(region_list, key=lambda o: o['name']).index(c) + 1
    nearest = near[0]
    title = 'Capital of %s: %s | LearnGeo' % (c['name'], c['capital'])
    desc = ('The capital of %s is %s. See where %s is on the map, its flag, nearby countries '
            'and quiz yourself on %s capitals for free.') % (
        c['name'], c['capital'], c['name'], c['region'])
    facts = [
        ('Capital', e(c['capital'])),
        ('Continent', '<a href="/continents/%s">%s</a>' % (slug(c['region']), e(c['region']))),
        ('Status', STATUS[c['status']]),
        ('Capital coordinates', '%s, %s' % (coord(c['lat'], 'N', 'S'), coord(c['lon'], 'E', 'W'))),
        ('Nearest capital', '<a href="/countries/%s">%s</a> (%s), about %s km away' % (
            slug(nearest['name']), e(nearest['capital']), e(nearest['name']),
            format(int(round(km(c, nearest), -1)), ','))),
    ]
    body = '''<article class="sp-hero">
  %(flag)s
  <div>
    <p class="sp-kicker">%(region)s · %(rank)d of %(count)d</p>
    <h1>What is the capital of %(name)s?</h1>
    <p class="sp-lead">The capital of <b>%(name)s</b> is <b>%(capital)s</b>.%(note)s</p>
  </div>
</article>
<section class="sp-card">
  <h2>%(name)s at a glance</h2>
  <dl class="sp-facts">%(facts)s</dl>
</section>
<section class="sp-card sp-quiz">
  <h2>Quick check</h2>
  <details><summary>Which capital city is closest to %(capital)s? Hint: it's in %(near_name)s.</summary>
  <p>It's <b>%(near_cap)s</b>, the capital of %(near_name)s.</p></details>
  <a class="sp-btn" href="/learn">Practise %(region)s capitals</a>
</section>
<section class="sp-card">
  <h2>Countries near %(name)s</h2>
  %(near)s
</section>
<section class="sp-card">
  <h2>More capitals in %(region)s</h2>
  %(same)s
</section>''' % {
        'flag': flag(c), 'name': e(c['name']), 'capital': e(c['capital']), 'region': e(c['region']),
        'rank': rank, 'count': len(region_list),
        'note': (' ' + e(c['note'])) if c['note'] else '',
        'facts': ''.join('<dt>%s</dt><dd>%s</dd>' % f for f in facts),
        'near_name': e(near[0]['name']), 'near_cap': e(near[0]['capital']),
        'near': chips(near), 'same': chips(same),
    }
    ld = {
        '@context': 'https://schema.org', '@type': 'Country', 'name': c['name'],
        'url': SITE + '/countries/' + slug(c['name']),
        'containedInPlace': {'@type': 'Continent', 'name': c['region']},
        'geo': {'@type': 'GeoCoordinates', 'latitude': c['lat'], 'longitude': c['lon']},
    }
    crumbs = [('Home', '/'), ('Countries', '/countries'),
              (c['region'], '/continents/' + slug(c['region'])), (c['name'], '/countries/' + slug(c['name']))]
    return page('/countries/' + slug(c['name']), title, desc, body, crumbs, ld)


def table(cs):
    return '<table class="sp-table"><thead><tr><th>Country</th><th>Capital</th></tr></thead><tbody>' + ''.join(
        '<tr><td><a href="/countries/%s">%s%s</a></td><td>%s</td></tr>' % (
            slug(c['name']), flag(c, 'sp-flag-sm'), e(c['name']), e(c['capital']))
        for c in cs) + '</tbody></table>'


def continent_page(region, everyone):
    cs = sorted([c for c in everyone if c['region'] == region], key=lambda c: c['name'])
    members = sum(1 for c in cs if c['status'] == 0)
    title = 'All %d countries and capitals of %s | LearnGeo' % (len(cs), region)
    desc = ('A full list of the %d countries and territories in %s and their capitals, '
            'from %s to %s. Learn them all with free map quizzes.') % (
        len(cs), region, cs[0]['name'], cs[-1]['name'])
    body = '''<article class="sp-hero sp-hero--plain"><div>
  <p class="sp-kicker">Continent</p>
  <h1>Countries and capitals of %(r)s</h1>
  <p class="sp-lead">%(r)s has %(n)d countries and territories on LearnGeo, %(m)d of them UN member states.
  Tap any one to see its capital, flag and neighbours.</p>
  <a class="sp-btn" href="/learn">Learn %(r)s on the map</a>
</div></article>
<section class="sp-card">%(table)s</section>''' % {
        'r': e(region), 'n': len(cs), 'm': members, 'table': table(cs)}
    crumbs = [('Home', '/'), ('Countries', '/countries'), (region, '/continents/' + slug(region))]
    return page('/continents/' + slug(region), title, desc, body, crumbs)


def index_page(everyone):
    title = 'Every country and capital in the world, A to Z | LearnGeo'
    desc = ('All %d countries and territories with their capitals, grouped by continent. '
            'Learn them with free map quizzes, games and tests.') % len(everyone)
    parts = []
    for r in REGIONS:
        cs = sorted([c for c in everyone if c['region'] == r], key=lambda c: c['name'])
        parts.append('<section class="sp-card"><h2><a href="/continents/%s">%s</a> <small>%d</small></h2>%s</section>' % (
            slug(r), e(r), len(cs), chips(cs)))
    body = '''<article class="sp-hero sp-hero--plain"><div>
  <h1>Every country and capital</h1>
  <p class="sp-lead">All %d countries and territories LearnGeo teaches, with their capitals.</p>
  <a class="sp-btn" href="/">Start learning, free</a>
</div></article>
%s''' % (len(everyone), ''.join(parts))
    return page('/countries', title, desc, body, [('Home', '/'), ('Countries', '/countries')])


# ------------------------------------------------------------ write ----
def write(rel, text):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')


def main():
    everyone = load()
    assert len(everyone) == 213, len(everyone)
    slugs = [slug(c['name']) for c in everyone]
    assert len(set(slugs)) == len(slugs), 'duplicate slug'

    for d in ('countries', 'continents'):
        shutil.rmtree(ROOT / d, ignore_errors=True)

    urls = ['/', '/teachers.html', '/countries']
    write('countries/index.html', index_page(everyone))
    for r in REGIONS:
        write('continents/%s/index.html' % slug(r), continent_page(r, everyone))
        urls.append('/continents/' + slug(r))
    for c in everyone:
        write('countries/%s/index.html' % slug(c['name']), country_page(c, everyone))
        urls.append('/countries/' + slug(c['name']))

    today = datetime.date.today().isoformat()
    write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
              '  <url><loc>%s%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>\n' % (
                  SITE, u, today,
                  '1.0' if u == '/' else '0.8' if not u.startswith('/countries/') else '0.6')
              for u in urls) + '</urlset>\n')
    write('robots.txt', 'User-agent: *\nAllow: /\n'
          'Disallow: /tools/\nDisallow: /tests/\nDisallow: /scripts/\nDisallow: /supabase/\nDisallow: /agents/\n\n'
          'Sitemap: %s/sitemap.xml\n' % SITE)
    print('wrote %d pages and sitemap.xml with %d URLs' % (len(urls) - 2, len(urls)))


if __name__ == '__main__':
    main()
