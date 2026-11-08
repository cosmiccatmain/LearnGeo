/* LEA-83: floating lobby profile circles + presence/chat RPCs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('lobby presence SQL ships heartbeat, list, leave, and chat RPCs', () => {
  const sql = read('supabase/deployed/0031_pvp_lobby_presence.sql');
  assert.match(sql, /pvp_lobby_presence/);
  assert.match(sql, /pvp_lobby_chats/);
  assert.match(sql, /pvp_lobby_heartbeat/);
  assert.match(sql, /pvp_lobby_leave/);
  assert.match(sql, /pvp_lobby_list/);
  assert.match(sql, /pvp_lobby_chat_send/);
  assert.match(sql, /pvp_lobby_chat_inbox/);
  assert.match(sql, /lobby in \('duel', 'chess'\)/);
  assert.match(sql, /grant execute on function public\.pvp_lobby_heartbeat/);
  assert.match(sql, /to authenticated/);
  assert.doesNotMatch(sql, /screen_shares|daily-share|getDisplayMedia|stripe/i);
});

test('LobbyCircles module mounts float circles with challenge and chat actions', () => {
  const js = read('assets/js/lobby-circles.js');
  assert.match(js, /global\.LobbyCircles/);
  assert.match(js, /lobby-circle/);
  assert.match(js, /pvp_lobby_heartbeat/);
  assert.match(js, /pvp_lobby_list/);
  assert.match(js, /pvp_lobby_chat_send/);
  assert.match(js, /onChallenge/);
  assert.match(js, /data-pop-chat/);
  assert.match(js, /lobbyFloat|is-float/);
  assert.doesNotMatch(js, /getDisplayMedia|screen.?share/i);
});

test('Geo Duel and Geo Chess lobbies mount LobbyCircles', () => {
  const duel = read('assets/js/game-duel.js');
  const chess = read('assets/js/game-chess-duel.js');
  const html = read('index.html');
  assert.match(duel, /LobbyCircles\.mount/);
  assert.match(duel, /lobby:\s*'duel'/);
  assert.match(duel, /stopLobbyCircles/);
  assert.match(chess, /LobbyCircles\.mount/);
  assert.match(chess, /lobby:\s*'chess'/);
  assert.match(chess, /stopLobbyCircles/);
  assert.match(html, /lobby-circles\.js/);
  assert.match(read('assets/css/arcade.css'), /@keyframes lobbyFloat/);
});
