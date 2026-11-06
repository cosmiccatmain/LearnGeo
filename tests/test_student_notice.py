"""Browser check for the one-time student stream notice.

Opens tests/fixtures/student-notice.html against the real core.js and
student-notice.js. Confirms the first show, no repeat after reload, a
second account, and logged-out behaviour.

    python3 tests/test_student_notice.py

Screenshots land in /tmp/student-notice.png (override with
LEARNGEO_NOTICE_SHOT). Requires Playwright and Chrome or Chromium.
Skips when either is missing.
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
MESSAGE = 'All countries are now in the stream.'
SHOT = os.environ.get('LEARNGEO_NOTICE_SHOT', '/tmp/student-notice.png')


def chromium_executable():
    return (os.environ.get('CHROMIUM_PATH')
            or shutil.which('chromium')
            or shutil.which('chromium-browser')
            or shutil.which('google-chrome')
            or shutil.which('google-chrome-stable'))


def skip_reason():
    if sync_playwright is None:
        return ('Playwright is not installed. Install it with '
                '`pip install playwright`, then run `python3 tests/test_student_notice.py`.')
    if not chromium_executable():
        return ('Chromium was not found. Put `google-chrome` on PATH, '
                'or set CHROMIUM_PATH, then run `python3 tests/test_student_notice.py`.')
    return None


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


@unittest.skipIf(skip_reason() is not None, skip_reason() or '')
class StudentNoticeTests(unittest.TestCase):
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
        cls.url = 'http://%s:%s/tests/fixtures/student-notice.html' % (host, port)
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

    def setUp(self):
        self.page = self.browser.new_page(viewport={'width': 1280, 'height': 800})
        self.page.goto(self.url)

    def tearDown(self):
        self.page.close()

    def notice(self):
        return self.page.locator('#student-notice')

    def test_once_per_account_and_not_when_logged_out(self):
        self.page.evaluate("() => window.__noticeSignIn('student-a')")
        self.notice().wait_for(state='visible')
        self.assertEqual(self.notice().locator('#student-notice-text').inner_text(), MESSAGE)
        self.assertEqual(self.notice().get_attribute('role'), 'region')
        dismiss = self.notice().get_by_role('button', name='Dismiss notice')
        self.assertTrue(dismiss.is_visible())
        self.page.screenshot(path=SHOT, full_page=False)
        dismiss.click()
        self.page.wait_for_timeout(50)
        self.assertEqual(self.notice().count(), 0, 'Got it removes the notice')

        self.page.reload()
        self.page.evaluate("""() => {
          window.Cloud.signedIn = true;
          window.Cloud.ready = true;
          window.Cloud.status = 'synced';
          window.Cloud.user = { id: window.WW.accountId() };
          window.StudentNotice.sync();
        }""")
        self.page.wait_for_timeout(50)
        self.assertEqual(self.notice().count(), 0, 'reload keeps the account flag')

        self.page.evaluate("() => window.__noticeSignIn('student-b')")
        self.notice().wait_for(state='visible')
        self.assertEqual(self.notice().locator('#student-notice-text').inner_text(), MESSAGE)

        self.page.evaluate("""() => {
          const key = window.WW.userKey('student-a');
          const saved = JSON.parse(window.localStorage.getItem(key));
          window.WW.useAccount('student-a');
          window.WW.replaceState(saved);
          window.Cloud.user = { id: 'student-a' };
          window.StudentNotice.sync();
        }""")
        self.page.wait_for_timeout(50)
        self.assertEqual(self.notice().count(), 0, 'the first account stays dismissed')

        self.page.evaluate("() => window.__noticeSignOut()")
        self.page.wait_for_timeout(50)
        self.assertEqual(self.notice().count(), 0, 'logged out shows nothing')

        self.page.evaluate("() => window.__noticeSignIn('student-c', 'OTHER1')")
        self.page.wait_for_timeout(50)
        self.assertEqual(self.notice().count(), 0, 'a different class does not get the note')


if __name__ == '__main__':
    unittest.main()
