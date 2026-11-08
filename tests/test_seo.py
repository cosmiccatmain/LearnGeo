"""The generated SEO pages match the data and the sitemap.

    python3 tests/test_seo.py

If this fails after a data change, run `python3 tools/build_seo.py`.
"""
import json
import re
import sys
import unittest
import xml.dom.minidom
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import build_seo  # noqa: E402

SITE = 'https://www.learngeo.app'


class SeoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.countries = build_seo.load()
        text = (ROOT / 'sitemap.xml').read_text(encoding='utf-8')
        xml.dom.minidom.parseString(text)
        cls.urls = re.findall(r'<loc>([^<]*)</loc>', text)

    def file_for(self, url):
        path = url[len(SITE):].strip('/')
        if not path:
            return ROOT / 'index.html'
        if path.endswith('.html'):
            return ROOT / path
        return ROOT / path / 'index.html'

    def test_every_sitemap_url_has_a_page(self):
        self.assertEqual(len(self.urls), len(set(self.urls)))
        for url in self.urls:
            self.assertTrue(url.startswith(SITE + '/'), url)
            self.assertTrue(self.file_for(url).is_file(), url)

    def test_every_country_and_continent_is_listed(self):
        self.assertEqual(len(self.countries), 213)
        for c in self.countries:
            self.assertIn(SITE + '/countries/' + build_seo.slug(c['name']), self.urls)
        for r in build_seo.REGIONS:
            self.assertIn(SITE + '/continents/' + build_seo.slug(r), self.urls)

    def test_pages_match_the_data(self):
        for c in self.countries:
            page = (ROOT / 'countries' / build_seo.slug(c['name']) / 'index.html').read_text(encoding='utf-8')
            self.assertIn('<link rel="canonical" href="%s/countries/%s">' % (SITE, build_seo.slug(c['name'])), page)
            self.assertIn(build_seo.e(c['capital']), page)

    def test_routes_and_robots(self):
        sources = [r['source'] for r in json.loads((ROOT / 'vercel.json').read_text())['rewrites']]
        for s in ('/countries', '/countries/:slug', '/continents/:slug'):
            self.assertIn(s, sources)
        self.assertIn('Sitemap: %s/sitemap.xml' % SITE, (ROOT / 'robots.txt').read_text())


if __name__ == '__main__':
    unittest.main()
