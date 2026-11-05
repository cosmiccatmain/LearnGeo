"""Bulk actions on the UltraAdmin Accounts view.

Starts its own static server, opens tests/fixtures/ultra-bulk.html, and
drives the real administrator.js through the real admin-ops.js. Supabase
is a stub that records each RPC.

    python3 tests/test_ultra_bulk.py

Requires Playwright (`pip install playwright`) and Chromium or Chrome
on PATH (`chromium`, `chromium-browser`, `google-chrome`), or
CHROMIUM_PATH. Skips when either is missing.
"""
import os
import shutil
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def chromium_executable():
    return (os.environ.get('CHROMIUM_PATH')
            or shutil.which('chromium')
            or shutil.which('chromium-browser')
            or shutil.which('google-chrome')
            or shutil.which('google-chrome-stable'))


def skip_reason():
    if sync_playwright is None:
        return ('Playwright is not installed. Install it with '
                '`pip install playwright`, then run `python3 tests/test_ultra_bulk.py`.')
    if not chromium_executable():
        return ('Chromium was not found. Put `chromium` or `google-chrome` on PATH, '
                'or set CHROMIUM_PATH, then run `python3 tests/test_ultra_bulk.py`.')
    return None


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


@unittest.skipIf(skip_reason() is not None, skip_reason() or '')
class UltraBulkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        reason = skip_reason()
        if reason:
            raise unittest.SkipTest(reason)
        cls.httpd = ThreadingHTTPServer(
            ('127.0.0.1', 0), partial(QuietHandler, directory=ROOT))
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        host, port = cls.httpd.server_address
        cls.url = 'http://%s:%s/tests/fixtures/ultra-bulk.html' % (host, port)
        cls.playwright = sync_playwright().start()
        try:
            cls.browser = cls.playwright.chromium.launch(
                headless=True,
                executable_path=chromium_executable(),
                args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
        except Exception as exc:
            cls.playwright.stop()
            cls.httpd.shutdown()
            raise unittest.SkipTest('Chromium did not start (%s).' % exc)

    @classmethod
    def tearDownClass(cls):
        browser = getattr(cls, 'browser', None)
        if browser:
            browser.close()
        pw = getattr(cls, 'playwright', None)
        if pw:
            pw.stop()
        httpd = getattr(cls, 'httpd', None)
        if httpd:
            httpd.shutdown()
            httpd.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1280, 'height': 800})
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda err: self.errors.append('pageerror: ' + str(err)))
        self.page.on('console', lambda msg: self._console(msg))
        self.page.goto(self.url)
        self.page.locator('[data-nav="accounts"]').wait_for()
        self.page.locator('[data-nav="accounts"]').click()
        self.page.locator('#ap-select-page').wait_for()
        self.ids = self.page.evaluate('window.__ids')
        self.order = self.page.evaluate('window.__order')
        self.page_size = int(self.page.locator('#ap-bulk').get_attribute('data-page-size'))

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def _console(self, msg):
        if msg.type != 'error':
            return
        text = msg.text or ''
        loc = ''
        try:
            loc = (msg.location or {}).get('url') or ''
        except Exception:
            loc = ''
        if 'favicon' in text or loc.endswith('/favicon.ico'):
            return
        self.errors.append('console: ' + text + (' @ ' + loc if loc else ''))

    def rpc(self, fn):
        return self.page.evaluate(
            '(fn) => window.__calls.filter(c => c.fn === fn).map(c => c.payload)', fn)

    def tick(self, key):
        self.page.locator('input[data-check="%s"]' % self.ids[key]).click()

    def test_select_all_everyone_and_clear(self):
        page = self.page
        count = page.locator('#ap-sel-count')
        self.assertEqual(count.inner_text(), '0 selected')
        self.assertTrue(page.locator('#ap-clear-selection').is_disabled())
        self.assertEqual(page.locator('input[data-check]').count(), self.page_size)
        self.assertTrue(page.locator('#ap-picked-sec').is_hidden())

        page.locator('[data-pick="%s"] .adminp__nm' % self.ids['s1']).click()
        self.assertIn('Student 1', page.locator('#ap-picked').inner_text())
        self.assertEqual(count.inner_text(), '0 selected')

        self.tick('s2')
        self.assertEqual(count.inner_text(), '1 selected')
        self.assertIn('Student 1', page.locator('#ap-picked').inner_text())
        self.assertFalse(page.locator('#ap-clear-selection').is_disabled())
        header = page.locator('#ap-select-page')
        self.assertTrue(header.evaluate('el => el.indeterminate'))
        self.assertFalse(header.evaluate('el => el.checked'))

        header.click()
        self.assertEqual(count.inner_text(), '%d selected' % self.page_size)
        self.assertNotIn('everyone', count.inner_text())
        self.assertEqual(page.locator('input[data-check]:checked').count(), self.page_size)
        page.locator('#ap-pager button[data-delta="1"]').click()
        self.assertIn('of %d' % len(self.order), page.locator('#ap-page-label').inner_text())
        self.assertFalse(page.locator('input[data-check="%s"]' % self.ids['s11']).is_checked())
        self.assertFalse(page.locator('#ap-select-page').is_checked())

        page.locator('#ap-select-everyone').click()
        self.assertEqual(
            count.inner_text(),
            '%d selected · everyone in this search' % len(self.order))
        self.assertTrue(page.locator('input[data-check="%s"]' % self.ids['s11']).is_checked())
        self.assertTrue(page.locator('#ap-select-page').is_checked())
        page.locator('#ap-pager button[data-delta="-1"]').click()
        self.assertTrue(page.locator('input[data-check="%s"]' % self.ids['s1']).is_checked())
        self.assertEqual(page.locator('input[data-check]:checked').count(), self.page_size)

        page.locator('#ap-clear-selection').click()
        self.assertEqual(count.inner_text(), '0 selected')
        self.assertTrue(page.locator('#ap-clear-selection').is_disabled())
        self.assertEqual(page.locator('input[data-check]:checked').count(), 0)
        page.locator('#ap-pager button[data-delta="1"]').click()
        self.assertFalse(page.locator('input[data-check="%s"]' % self.ids['s14']).is_checked())

    def test_select_everyone_respects_the_current_search(self):
        page = self.page
        page.fill('#ap-q', 'student')
        page.locator('[data-do="search"]').click()
        page.locator('#ap-page-label').wait_for()
        label = page.locator('#ap-page-label').inner_text()
        self.assertIn('of 14', label)
        self.assertEqual(page.locator('[data-pick="%s"]' % self.ids['me']).count(), 0)
        self.assertEqual(page.locator('[data-pick="%s"]' % self.ids['fail']).count(), 0)

        page.locator('#ap-select-page').click()
        self.assertEqual(page.locator('#ap-sel-count').inner_text(), '%d selected' % self.page_size)

        page.locator('#ap-select-everyone').click()
        self.assertEqual(
            page.locator('#ap-sel-count').inner_text(),
            '14 selected · everyone in this search')
        page.locator('#ap-pager button[data-delta="1"]').click()
        self.assertTrue(page.locator('input[data-check="%s"]' % self.ids['s14']).is_checked())
        self.assertEqual(page.locator('input[data-check]:checked').count(), 14 - self.page_size)

    def test_bulk_message_calls_send_once_per_account(self):
        self.tick('s1')
        self.tick('s2')
        self.page.locator('[data-kind="msg"]').click()
        lead = self.page.locator('#ap-bulk-lead')
        lead.wait_for()
        self.assertIn('2 accounts', lead.inner_text())
        self.assertEqual(lead.get_attribute('data-phrase'), '')
        self.assertEqual(self.page.locator('#ap-bulk-phrase').count(), 0)
        self.page.fill('#ap-bulk-text', 'Hello from admin')
        self.page.locator('#ap-bulk-go').click()
        self.page.locator('[data-bulk-state="done"]').wait_for()
        done = self.page.locator('[data-bulk-state="done"]')
        self.assertEqual(done.get_attribute('data-ok'), '2')
        self.assertEqual(done.get_attribute('data-fail'), '0')
        sent = self.rpc('ultra_send_message')
        self.assertEqual([p['p_target'] for p in sent], [self.ids['s1'], self.ids['s2']])
        self.assertTrue(all(p['p_text'] == 'Hello from admin' for p in sent))
        self.assertTrue(all(p['p_token'] == self.page.evaluate('window.__token') for p in sent))

    def test_bulk_take_confirms_the_count_and_calls_gems(self):
        self.tick('s1')
        self.tick('s2')
        self.page.locator('[data-kind="take"]').click()
        self.page.locator('#ap-bulk-go').wait_for()
        self.page.locator('#ap-bulk-go').click()
        self.assertIn('whole number', self.page.locator('#ap-bulk-err').inner_text())
        self.assertEqual(self.rpc('ultra_adjust_gems'), [])

        self.page.fill('#ap-bulk-amount', '100')
        lead = self.page.locator('#ap-bulk-lead')
        self.assertIn('2 accounts', lead.inner_text())
        self.assertIn('100', lead.inner_text())
        self.assertEqual(lead.get_attribute('data-phrase'), '2')
        self.page.locator('#ap-bulk-go').click()
        self.assertIn('Type 2', self.page.locator('#ap-bulk-err').inner_text())
        self.assertEqual(self.rpc('ultra_adjust_gems'), [])

        self.page.fill('#ap-bulk-phrase', '2')
        self.page.locator('#ap-bulk-go').click()
        self.page.locator('[data-bulk-state="done"]').wait_for()
        gems = self.rpc('ultra_adjust_gems')
        self.assertEqual([p['p_target'] for p in gems], [self.ids['s1'], self.ids['s2']])
        for payload in gems:
            self.assertEqual(payload['p_delta'], -100)
            self.assertIsNone(payload['p_set'])
            self.assertEqual(payload['p_reason'], 'took 100')
            self.assertTrue(payload['p_token'])

    def test_ban_everyone_confirms_excludes_self_and_continues_after_failure(self):
        page = self.page
        page.locator('#ap-select-everyone').click()
        page.locator('[data-kind="ban"]').click()
        lead = page.locator('#ap-bulk-lead')
        lead.wait_for()
        self.assertEqual(lead.get_attribute('data-affected'), '15')
        self.assertEqual(lead.get_attribute('data-phrase'), 'CONFIRM')
        text = lead.inner_text()
        self.assertIn('15 accounts', text)
        self.assertIn('16 accounts', text)
        self.assertIn('left out', text)
        self.assertIn('CONFIRM', page.locator('#ap-bulk-phrase-label').inner_text())
        self.assertIn('alexjschendel@gmail.com', page.locator('.adminp__self').inner_text())

        page.fill('#ap-bulk-why', 'Cheating on the arcade boards')
        page.fill('#ap-bulk-phrase', '15')
        page.locator('#ap-bulk-go').click()
        self.assertIn('CONFIRM', page.locator('#ap-bulk-err').inner_text())
        self.assertEqual(self.rpc('ultra_set_ban'), [])

        page.evaluate('window.__hold = true')
        page.fill('#ap-bulk-phrase', 'CONFIRM')
        page.locator('#ap-bulk-go').click()
        page.locator('[data-bulk-progress]').wait_for()
        self.assertIn('0 of 15', page.locator('[data-bulk-progress]').inner_text())
        self.assertTrue(page.locator('#ap-bulk-go').is_disabled())
        self.assertEqual(len(self.rpc('ultra_set_ban')), 1)
        page.evaluate('document.querySelector("#ap-bulk-go").click()')
        self.assertEqual(len(self.rpc('ultra_set_ban')), 1)

        drained = page.evaluate('window.__drain()')
        self.assertEqual(drained, 'done')
        bans = self.rpc('ultra_set_ban')
        expected = [i for i in self.order if i != self.ids['me']]
        self.assertEqual([p['p_target'] for p in bans], expected)
        self.assertNotIn(self.ids['me'], [p['p_target'] for p in bans])
        self.assertTrue(all(p['p_on'] is True for p in bans))
        self.assertTrue(all(p['p_reason'] == 'Cheating on the arcade boards' for p in bans))
        self.assertTrue(all(p['p_token'] for p in bans))
        done = page.locator('[data-bulk-state="done"]')
        self.assertEqual(done.get_attribute('data-ok'), '14')
        self.assertEqual(done.get_attribute('data-fail'), '1')
        fail = page.locator('[data-bulk-result="fail"]')
        self.assertEqual(fail.get_attribute('data-id'), self.ids['fail'])
        self.assertIn('no such account', fail.inner_text())
        self.assertEqual(
            page.locator('[data-id="%s"]' % self.ids['s1']).get_attribute('data-bulk-result'),
            'ok')

    def test_including_own_account_is_explicit(self):
        page = self.page
        page.locator('#ap-select-everyone').click()
        page.locator('[data-kind="ban"]').click()
        lead = page.locator('#ap-bulk-lead')
        lead.wait_for()
        self.assertEqual(lead.get_attribute('data-affected'), '15')
        page.locator('#ap-bulk-self').check()
        self.assertEqual(lead.get_attribute('data-affected'), '16')
        self.assertIn('16 accounts', lead.inner_text())
        self.assertNotIn('left out', lead.inner_text())
        page.fill('#ap-bulk-phrase', 'CONFIRM')
        page.locator('#ap-bulk-go').click()
        page.locator('[data-bulk-state="done"]').wait_for()
        bans = self.rpc('ultra_set_ban')
        self.assertEqual([p['p_target'] for p in bans], self.order)
        done = page.locator('[data-bulk-state="done"]')
        self.assertEqual(done.get_attribute('data-ok'), '14')
        self.assertEqual(done.get_attribute('data-fail'), '2')
        self.assertIn(
            'you cannot ban your own account',
            page.locator('[data-id="%s"]' % self.ids['me']).inner_text())
        self.assertEqual(
            page.locator('[data-id="%s"]' % self.ids['s14']).get_attribute('data-bulk-result'),
            'ok')

    def test_search_cap_note_limits_select_everyone(self):
        page = self.page
        page.evaluate('''() => {
          window.__accounts = [];
          for (var i = 0; i < 80; i++) {
            window.__accounts.push({
              id: 'cap-' + i,
              display_name: 'Cap ' + i,
              email: 'cap' + i + '@example.com',
              diamonds: 1, level: 1, xp: 0, staff: false
            });
          }
        }''')
        page.fill('#ap-q', 'Cap')
        page.locator('[data-do="search"]').click()
        page.locator('#ap-bulk-cap').wait_for(state='visible')
        note = page.locator('#ap-bulk-cap').inner_text()
        self.assertIn('60', note)
        page.locator('#ap-select-everyone').click()
        self.assertEqual(
            page.locator('#ap-sel-count').inner_text(),
            '60 selected · everyone in this search')
        self.assertIn('of 60', page.locator('#ap-page-label').inner_text())
        self.assertIn('page 1 of', page.locator('#ap-page-label').inner_text())
        self.assertEqual(page.locator('input[data-check]:checked').count(), self.page_size)
        page.locator('#ap-pager button[data-delta="1"]').click()
        self.assertEqual(page.locator('input[data-check]:checked').count(), self.page_size)


if __name__ == '__main__':
    unittest.main()
