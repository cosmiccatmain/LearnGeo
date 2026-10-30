"""Integration checks: run the documented local server, then python3 tests/test_chess.py.

All five opponents are exercised, including real Stockfish at Levels 2–5. Scripted UCI replies then exercise
specific rule/UI situations deterministically, without adding application test hooks.
"""
import json
import os
import shutil
import unittest

from playwright.sync_api import sync_playwright

BASE = os.environ.get('LEARNGEO_TEST_URL', 'http://127.0.0.1:8765')


class ChessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        options = dict(headless=True, args=['--no-sandbox'])
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
        if executable:
            options['executable_path'] = executable
        if os.environ.get('HTTPS_PROXY'):
            options['proxy'] = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'}
        cls.browser = cls.playwright.chromium.launch(**options)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1280, 'height': 950})
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def scripted_engine(self, replies):
        self.page.add_init_script("""(() => {
          const replies = %s;
          window.chessCommands = []; window.chessTerminations = 0;
          window.Worker = class {
            postMessage(command) {
              window.chessCommands.push(command);
              let line = command === 'uci' ? 'uciok' : command === 'isready' ? 'readyok' :
                command.startsWith('go ') ? 'bestmove ' + replies.shift() : null;
              if (line) setTimeout(() => { if (!this.stopped && this.onmessage) this.onmessage({data: line}); }, 20);
            }
            terminate() { this.stopped = true; window.chessTerminations++; }
          };
        })();""" % json.dumps(replies))

    def setup_game(self, level=3, typed=False):
        self.page.goto(BASE + '/?role=student&view=games', wait_until='networkidle')
        self.page.locator('[data-game="chess"]').click()
        self.page.locator('[data-level] [data-v="%s"]' % level).click()
        self.page.locator('[data-kind] [data-v="capitals"]').click()
        # Exercise the actual shared custom-country picker and answer-style filters.
        self.page.locator('[data-filters]').click()
        self.page.locator('#cfg-choose [data-v="custom"]').click()
        picker = self.page.locator('#cfg-picker input')
        picker.fill('Japan')
        picker.press('Enter')
        if typed:
            self.page.locator('#cfg-typed [data-v="typed"]').click()
        self.page.get_by_role('button', name='Apply', exact=True).click()
        self.assertEqual(self.page.evaluate('WW.state.games.chess.cfg.countries'), ['Japan'])
        self.page.locator('[data-play]').click()
        self.page.wait_for_function("document.querySelector('.chess-status').textContent.includes('Answer a question')", timeout=35000)

    def answer(self):
        self.assertEqual(self.page.locator('.chess-question__subject').text_content(), 'Japan')
        if self.page.locator('#chess-answer').count():
            self.page.locator('#chess-answer').fill('Tokyo')
            self.page.locator('#chess-answer').press('Enter')
        else:
            self.page.locator('.chess-answers button').filter(has_text='Tokyo').click()
        self.assertIn('Your move.', self.page.locator('.chess-status').text_content())
        self.assertIn('unlocked', self.page.locator('.chess-feedback').text_content())

    def move(self, source, target, promote=None):
        self.answer()
        self.page.locator('[data-square="%s"]' % source).click()
        self.assertIn('is-legal', self.page.locator('[data-square="%s"]' % target).get_attribute('class'))
        self.page.locator('[data-square="%s"]' % target).click()
        if promote:
            self.page.locator('[data-promote="%s"]' % promote).click()
        self.page.wait_for_function("Games.current.fen.split(' ')[1] === 'w' || document.querySelector('.chess-question').textContent.includes('Game over')", timeout=20000)

    def test_opponents_all_five_levels(self):
        # Force Level 2's engine branch here; its random branch is checked separately.
        self.page.add_init_script('Math.random = () => 0.99;')
        for level in (1, 2, 3, 4, 5):
            with self.subTest(level=level):
                self.setup_game(level)
                self.move('e2', 'e4')
                self.assertEqual(len(self.page.locator('[data-moves]').text_content().split()), 3)
                self.assertIn('1. e4 ', self.page.locator('[data-moves]').text_content())
                self.page.get_by_role('button', name='Home', exact=True).click()

    def test_level_one_needs_no_engine_and_plays_legal_moves(self):
        self.page.add_init_script("window.Worker = class { constructor() { throw new Error('No engine available'); } };")
        self.setup_game(1)
        self.move('e2', 'e4')
        self.assertIn('1. e4 ', self.page.locator('[data-moves]').text_content())
        self.assertNotIn('unavailable', self.page.locator('.chess-status').text_content())

    def test_level_two_random_branch_skips_engine_search(self):
        self.scripted_engine(['not-a-legal-move'])
        self.page.add_init_script('Math.random = () => 0;')
        self.setup_game(2)
        self.move('e2', 'e4')
        self.assertFalse(self.page.evaluate("chessCommands.some(c => c.startsWith('go '))"))

    def test_level_one_cancel_pending_move_on_restart(self):
        self.setup_game(1)
        self.answer()
        self.page.locator('[data-square="e2"]').click()
        self.page.locator('[data-square="e4"]').click()
        self.page.once('dialog', lambda d: d.accept())
        self.page.locator('[data-new]').click()
        self.page.wait_for_timeout(600)
        self.assertEqual(self.page.locator('[data-moves]').text_content(), 'No moves yet.')

    def test_wrong_answer_typed_and_settings_persist(self):
        self.scripted_engine(['e7e5'])
        self.setup_game(3, typed=True)
        before = self.page.evaluate('Games.current.fen')
        self.page.locator('#chess-answer').fill('Wrong capital')
        self.page.locator('#chess-answer').press('Enter')
        self.assertIn('The answer is Tokyo', self.page.locator('.chess-feedback').text_content())
        self.page.locator('[data-square="e2"]').dispatch_event('click')
        self.page.locator('[data-square="e4"]').dispatch_event('click')
        self.assertEqual(self.page.evaluate('Games.current.fen'), before)
        self.page.locator('[data-next-question]').click()
        self.move('e2', 'e4')
        mastery = self.page.evaluate('WW.saveNow(); JSON.stringify(WW.state.mastery.Japan)')
        self.page.reload(wait_until='networkidle')
        self.assertEqual(self.page.evaluate('JSON.stringify(WW.state.mastery.Japan)'), mastery)
        self.assertEqual(self.page.evaluate('WW.state.games.chess.level'), 3)
        self.assertTrue(self.page.evaluate('WW.state.games.chess.cfg.typed'))

    def test_castling(self):
        self.scripted_engine(['e7e5', 'b8c6', 'g8f6', 'g7g6'])
        self.setup_game()
        for a, b in [('e2', 'e4'), ('g1', 'f3'), ('f1', 'c4'), ('e1', 'g1')]:
            self.move(a, b)
        self.assertIn('White king', self.page.locator('[data-square="g1"]').get_attribute('aria-label'))
        self.assertIn('White rook', self.page.locator('[data-square="f1"]').get_attribute('aria-label'))

    def test_en_passant(self):
        self.scripted_engine(['a7a6', 'd7d5', 'g8f6'])
        self.setup_game()
        for a, b in [('e2', 'e4'), ('e4', 'e5'), ('e5', 'd6')]:
            self.move(a, b)
        self.assertIn('empty', self.page.locator('[data-square="d5"]').get_attribute('aria-label'))
        self.assertIn('White pawn', self.page.locator('[data-square="d6"]').get_attribute('aria-label'))

    def test_promotion_and_engine_promotion(self):
        self.scripted_engine(['h7h5', 'h5h4', 'h4h3', 'h3g2', 'g2h1q'])
        self.setup_game()
        for a, b in [('a2', 'a4'), ('a4', 'a5'), ('a5', 'a6'), ('a6', 'b7')]:
            self.move(a, b)
        self.move('b7', 'a8', promote='n')
        self.assertIn('White knight', self.page.locator('[data-square="a8"]').get_attribute('aria-label'))
        self.assertIn('Black queen', self.page.locator('[data-square="h1"]').get_attribute('aria-label'))

    def test_checkmate_records_once(self):
        self.scripted_engine(['e7e5', 'd8h4'])
        self.setup_game()
        self.move('f2', 'f3')
        self.move('g2', 'g4')
        self.assertIn('Stockfish wins by checkmate', self.page.locator('.chess-status').text_content())
        self.assertEqual(self.page.evaluate('WW.state.games.chess.completed'), 1)
        self.assertEqual(self.page.locator('[data-square][aria-disabled="false"]').count(), 0)

    def test_threefold_draw(self):
        self.scripted_engine(['g8f6', 'f6g8', 'g8f6', 'f6g8'])
        self.setup_game()
        for a, b in [('g1', 'f3'), ('f3', 'g1')] * 2:
            self.move(a, b)
        self.assertIn('Draw by repetition', self.page.locator('.chess-status').text_content())
        self.assertEqual(self.page.evaluate('WW.state.games.chess.draws'), 1)

    def test_engine_failure_retry_and_cleanup(self):
        self.scripted_engine(['not-a-move', 'e7e5'])
        self.setup_game()
        self.answer()
        self.page.locator('[data-square="e2"]').click()
        self.page.locator('[data-square="e4"]').click()
        self.page.locator('[data-retry]').wait_for()
        fen = self.page.evaluate('Games.current.fen')
        self.assertEqual(fen.split()[1], 'b')
        self.page.locator('[data-retry]').click()
        self.page.wait_for_function("Games.current.fen.split(' ')[1] === 'w'")
        self.assertEqual(self.page.locator('[data-moves]').text_content(), '1. e4 e5')
        self.page.get_by_role('button', name='Home', exact=True).click()
        self.assertGreaterEqual(self.page.evaluate('window.chessTerminations'), 2)

    def test_mobile_keyboard_and_restart(self):
        self.scripted_engine(['e7e5'])
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.setup_game()
        self.assertLessEqual(self.page.locator('.chess-board').bounding_box()['width'], 390)
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        self.answer()
        self.page.locator('[data-square="e2"]').focus()
        self.page.keyboard.press('Enter')
        self.page.keyboard.press('ArrowUp')
        self.page.keyboard.press('ArrowUp')
        self.page.keyboard.press('Enter')
        self.page.wait_for_function("Games.current.fen.split(' ')[1] === 'w'")
        self.assertEqual(self.page.locator('[data-moves]').text_content(), '1. e4 e5')
        self.page.once('dialog', lambda d: d.accept())
        self.page.locator('[data-new]').click()
        self.assertEqual(self.page.locator('[data-moves]').text_content(), 'No moves yet.')


if __name__ == '__main__':
    unittest.main(verbosity=2)
