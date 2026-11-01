"""Browser route checks: start tools/serve.py, then run python3 tests/test_routes.py."""
import os
import shutil
import unittest

from playwright.sync_api import sync_playwright

BASE = os.environ.get('LEARNGEO_TEST_URL', 'http://127.0.0.1:8765')


class RouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        options = dict(headless=True)
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
        if executable:
            options['executable_path'] = executable
        cls.browser = cls.playwright.chromium.launch(**options)

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
        self.page.goto(BASE + '/games')
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
    unittest.main()
