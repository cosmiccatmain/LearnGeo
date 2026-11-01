"""Browser route checks.

Start the app, then run this file:

    python3 tools/serve.py
    python3 tests/test_routes.py

Requires Playwright (`pip install playwright`) and a Chromium executable
on PATH as `chromium` (or `chromium-browser`), or CHROMIUM_PATH pointing
at it. If either is missing the file skips instead of erroring.
Set LEARNGEO_TEST_URL when the server is not http://127.0.0.1:8765.
"""
import os
import shutil
import sys
import unittest

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

BASE = os.environ.get('LEARNGEO_TEST_URL', 'http://127.0.0.1:8765')


def chromium_executable():
    return (os.environ.get('CHROMIUM_PATH')
            or shutil.which('chromium')
            or shutil.which('chromium-browser'))


def chromium_skip_reason():
    if sync_playwright is None:
        return ('Playwright is not installed. Install it with '
                '`pip install playwright`, then run `python3 tests/test_routes.py`.')
    if not chromium_executable():
        return ('Chromium was not found. Put the `chromium` executable on PATH, '
                'or set CHROMIUM_PATH to it, then run `python3 tests/test_routes.py`.')
    return None


@unittest.skipIf(sync_playwright is None, chromium_skip_reason() or '')
class RouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        reason = chromium_skip_reason()
        if reason:
            raise unittest.SkipTest(reason)
        cls.playwright = sync_playwright().start()
        executable = chromium_executable()
        try:
            cls.browser = cls.playwright.chromium.launch(
                headless=True, executable_path=executable)
        except Exception as exc:
            cls.playwright.stop()
            raise unittest.SkipTest(
                'Chromium at %s did not start (%s). Set CHROMIUM_PATH to a '
                'working executable and run python3 tests/test_routes.py.'
                % (executable, exc))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.add_init_script("""
          if (!localStorage.getItem('learngeo.save.v1')) {
            localStorage.setItem('learngeo.save.v1', JSON.stringify({
              role: 'student', roleChosen: true
            }));
          }
        """)

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def dismiss_class_name(self):
        """Landing on the class page asks for a name until one is saved."""
        button = self.page.locator('button', has_text='Not now')
        if button.count():
            button.click()
            self.page.wait_for_function("document.querySelectorAll('.overlay').length === 0")

    def assert_view(self, path, view):
        self.page.wait_for_url(BASE + path)
        self.page.wait_for_function(
            "view => document.querySelector('#app').classList.contains('is-open') && "
            "!document.querySelector('#view-' + view).classList.contains('hidden')",
            arg=view)
        self.assertEqual(self.page.locator('.tab.is-active').get_attribute('data-view'), view)

    def test_direct_routes_and_refresh(self):
        routes = {
            '/home': 'portal', '/codex': 'codex', '/myclassroom': 'classroom',
            '/learn': 'learn', '/test': 'test', '/quiz': 'quiz', '/games': 'games'
        }
        for path, view in routes.items():
            with self.subTest(path=path):
                response = self.page.goto(BASE + path)
                self.assertEqual(response.status, 200)
                self.assert_view(path, view)
                self.page.reload()
                self.assert_view(path, view)
        self.page.goto(BASE + '/games/')
        self.assert_view('/games', 'games')

    def test_back_forward_and_landing(self):
        self.page.goto(BASE + '/')
        self.page.locator('#nav-continue').wait_for(state='attached')
        self.page.locator('.nav [data-launch="portal"]').click()
        self.assert_view('/home', 'portal')
        self.page.locator('.tab[data-view="games"]').click()
        self.assert_view('/games', 'games')
        self.page.locator('.tab[data-view="classroom"]').click()
        self.assert_view('/myclassroom', 'classroom')
        self.page.go_back()
        self.assert_view('/games', 'games')
        self.page.go_back()
        self.assert_view('/home', 'portal')
        self.page.go_back()
        self.page.wait_for_url(BASE + '/')
        self.assertFalse(self.page.locator('#landing').evaluate(
            "el => el.classList.contains('hidden')"))
        self.page.go_forward()
        self.assert_view('/home', 'portal')

    def test_duplicate_tab_does_not_add_history(self):
        self.page.goto(BASE + '/home')
        self.page.locator('.tab[data-view="games"]').click()
        self.assert_view('/games', 'games')
        self.page.locator('.tab[data-view="games"]').click()
        self.page.go_back()
        self.assert_view('/home', 'portal')

    def test_legacy_links_and_role_guards(self):
        self.page.goto(BASE + '/?role=student&view=games&campaign=test')
        self.page.wait_for_url(BASE + '/games?campaign=test')
        self.assertFalse(self.page.locator('#view-games').evaluate(
            "el => el.classList.contains('hidden')"))
        self.page.goto(BASE + '/myclass')
        self.assert_view('/myclassroom', 'classroom')
        self.page.evaluate("WW.state.role = 'teacher'; WW.saveNow()")
        self.page.goto(BASE + '/myclassroom')
        self.assert_view('/myclass', 'teacher')
        self.dismiss_class_name()
        # A teacher opening a study route, or an old ?view= link, lands on
        # their class. The study tabs still work after that.
        for path in ('/games', '/learn', '/?view=games', '/?role=teacher&view=learn'):
            with self.subTest(path=path):
                self.page.goto(BASE + path)
                self.assert_view('/myclass', 'teacher')
                self.dismiss_class_name()
        self.page.locator('.tab[data-view="games"]').click()
        self.assert_view('/games', 'games')
        self.page.locator('.tab[data-view="learn"]').click()
        self.assert_view('/learn', 'learn')
        self.assertTrue(self.page.evaluate('UI.browsing'))
        self.page.go_back()
        self.assert_view('/games', 'games')
        self.page.goto(BASE + '/myclass')
        self.assert_view('/myclass', 'teacher')
        self.assertFalse(self.page.evaluate('UI.previewing'))

    def test_join_link(self):
        self.page.goto(BASE + '/?join=ABC123')
        self.assert_view('/myclassroom', 'classroom')
        self.assertEqual(self.page.locator('#j-code').input_value(), 'ABC123')

    def test_back_closes_dialog(self):
        self.page.goto(BASE + '/')
        self.page.locator('.nav [data-launch="portal"]').click()
        self.assert_view('/home', 'portal')
        self.page.locator('#avatar-btn').click()
        self.page.locator('[data-go="settings"]').click()
        self.assertEqual(self.page.locator('.overlay').count(), 1)
        self.page.go_back()
        self.page.wait_for_url(BASE + '/')
        self.page.wait_for_function("document.querySelectorAll('.overlay').length === 0")
        self.assertEqual(self.page.locator('.overlay').count(), 0)

    def test_quiz_history_confirms_and_tab_back_restores(self):
        # confirm() is stubbed in the page. Driving it through Playwright's
        # dialog event races the history navigation it is trying to cancel.
        self.page.add_init_script("""
          window.__confirms = [];
          window.__confirmAnswer = false;
          window.confirm = function (msg) {
            window.__confirms.push(String(msg));
            return !!window.__confirmAnswer;
          };
        """)
        self.page.goto(BASE + '/')
        self.page.locator('.nav [data-launch="portal"]').click()
        self.assert_view('/home', 'portal')
        self.page.locator('.tab[data-view="quiz"]').click()
        self.assert_view('/quiz', 'quiz')
        self.page.locator('#qz-go').click()
        self.page.wait_for_function(
            "() => !document.querySelector('#quiz-workspace').classList.contains('hidden')")

        # Leaving by a tab keeps the run, so Back redraws it.
        self.page.locator('.tab[data-view="portal"]').click()
        self.assert_view('/home', 'portal')
        self.page.go_back()
        self.assert_view('/quiz', 'quiz')
        self.assertFalse(self.page.locator('#quiz-workspace').evaluate(
            "el => el.classList.contains('hidden')"))
        self.assertTrue(self.page.evaluate('QuizMode.active()'))

        # Back from the run itself asks. Cancelling stays on the question.
        # history.back() rather than page.go_back(): the guard pushState's the
        # run's own URL, which is the location the page actually ends on.
        self.page.evaluate('history.back()')
        self.page.wait_for_function(
            "() => __confirms.length === 1 && location.pathname === '/quiz' && QuizMode.active()")
        self.assertIn('quiz', self.page.evaluate('__confirms[0]').lower())
        self.assertFalse(self.page.locator('#quiz-workspace').evaluate(
            "el => el.classList.contains('hidden')"))

        # Accepting leaves, and Forward opens the screen fresh.
        self.page.evaluate('__confirmAnswer = true; history.back()')
        self.page.wait_for_function(
            "() => location.pathname === '/home' && !QuizMode.active()")
        self.assert_view('/home', 'portal')
        self.page.evaluate('history.forward()')
        self.page.wait_for_function(
            "() => location.pathname === '/quiz' && "
            "!document.querySelector('#quiz-setup').classList.contains('hidden')")
        self.assertTrue(self.page.locator('#quiz-setup').evaluate(
            "el => !el.classList.contains('hidden')"))

    def test_sign_out_back_stays_on_the_landing_page(self):
        self.page.goto(BASE + '/')
        self.page.locator('.nav [data-launch="portal"]').click()
        self.assert_view('/home', 'portal')
        self.page.locator('.tab[data-view="games"]').click()
        self.assert_view('/games', 'games')
        self.page.evaluate("""() => {
          AppRouter.invalidate();
          UI.showLanding({ history: 'replace' });
        }""")
        self.page.wait_for_url(BASE + '/')
        self.assertFalse(self.page.locator('#app').evaluate(
            "el => el.classList.contains('is-open')"))
        self.page.go_back()
        self.page.wait_for_function(
            "() => !document.querySelector('#app').classList.contains('is-open')")
        self.assertFalse(self.page.locator('#app').evaluate(
            "el => el.classList.contains('is-open')"))
        self.assertNotIn('/home', self.page.url)
        self.assertNotIn('/games', self.page.url)

    def test_back_dismisses_first_visit_prompts(self):
        self.page.goto(BASE + '/')
        self.page.evaluate("WW.state.roleChosen = false")
        self.page.locator('.nav [data-launch="portal"]').click()
        self.page.locator('.role-opt[data-role="games"]').click()
        self.page.locator('#gt-input').wait_for()
        self.page.go_back()
        self.page.wait_for_url(BASE + '/')
        self.page.wait_for_function("document.querySelectorAll('.overlay').length === 0")
        self.assertFalse(self.page.locator('#landing').evaluate(
            "el => el.classList.contains('hidden')"))


if __name__ == '__main__':
    reason = chromium_skip_reason()
    if reason:
        print(reason, file=sys.stderr)
    unittest.main(verbosity=2 if reason else 1)
