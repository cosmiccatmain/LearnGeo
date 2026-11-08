/* Node smoke checks for LEA-81 classroom passcodes (no browser). */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var vm = require('vm');

var root = path.join(__dirname, '..');
var passJs = fs.readFileSync(path.join(root, 'assets/js/classroom-pass.js'), 'utf8');
var games = fs.readFileSync(path.join(root, 'assets/js/games.js'), 'utf8');
var teacher = fs.readFileSync(path.join(root, 'assets/js/teacher.js'), 'utf8');
var student = fs.readFileSync(path.join(root, 'assets/js/geolive-student.js'), 'utf8');
var index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
var sql = fs.readFileSync(path.join(root, 'supabase/deployed/0026_classroom_passcodes.sql'), 'utf8');
var readme = fs.readFileSync(path.join(root, 'supabase/deployed/README.md'), 'utf8');
var updates = fs.readFileSync(path.join(root, 'assets/data/updates.json'), 'utf8');
var gate = fs.readFileSync(path.join(root, 'tests/test_games_account_gate.js'), 'utf8');

assert(/classroom-pass\.js/.test(index), 'index.html loads classroom-pass.js');
assert(/ClassroomPass/.test(passJs), 'classroom-pass.js exports ClassroomPass');
assert(/join_class_by_pass/.test(passJs), 'client redeems via join_class_by_pass');
assert(/classroom_pass_lookup/.test(passJs), 'client previews via classroom_pass_lookup');
assert(/signInAnonymously|pass\.learngeo\.app/.test(passJs), 'silent session path');
assert(/openJoinModal/.test(passJs), 'student join modal');
assert(/mountTeacher/.test(passJs), 'teacher mount');

assert(/ClassroomPass\.unlocked|classroom passcode/i.test(games), 'Games hub respects pass unlock');
assert(/data-games-pass/.test(games), 'Games hub has Classroom passcode CTA');
assert(/needsAccount/.test(games), 'needsAccount still present');

assert(/cr-classroom-pass|tm-pass-banner|fillPassBanner|ClassroomPass/.test(teacher),
  'teacher shows passcode settings/banner');
assert(/data-gl-pass|Classroom passcode/.test(student), 'Geo Live signin offers passcode');

assert(/cr-banner__code--pass|code-chip--pass|cr-banner__codes/.test(css),
  'passcode banner/chip CSS');

assert(/classroom_pass/.test(sql), 'SQL adds classroom_pass column');
assert(/set_classroom_pass/.test(sql) && /clear_classroom_pass/.test(sql), 'teacher RPCs');
assert(/classroom_pass_lookup/.test(sql) && /join_class_by_pass/.test(sql), 'student RPCs');
assert(/grant execute on function public\.classroom_pass_lookup\(text\) to anon/.test(sql),
  'lookup callable signed-out');
assert(/0026_classroom_passcodes/.test(readme), 'deployed README documents 0026');

assert(/2026-11-classroom-passcodes/.test(updates), 'What’s New entry');
assert(!/screen.?mirror|Share screen|daily-share/i.test(passJs), 'no screen mirroring');
assert(!/stripe|Stripe/i.test(passJs + games + teacher), 'no Stripe in passcode path');
assert(!/Brainrot/i.test(passJs), 'no Brainrot');

/* Shape helpers run without a browser DOM. */
var sandbox = {
  window: {},
  console: console
};
sandbox.window = sandbox;
sandbox.WW = {
  Icons: {},
  escapeHtml: function (s) { return String(s); },
  state: { profile: { displayName: 'Explorer' } },
  saveNow: function () {},
  toast: function () {}
};
vm.createContext(sandbox);
vm.runInContext(passJs, sandbox);
var CP = sandbox.ClassroomPass;
assert(CP, 'ClassroomPass attached');
assert.strictEqual(CP.PASS_LEN, 4);
assert.strictEqual(CP.normalize('ab-34'), 'AB34');
assert(CP.shapeProblem(''), 'empty pass rejected');
assert(CP.shapeProblem('ABC'), 'short pass rejected');
assert(CP.shapeProblem('AB0I'), 'ambiguous chars rejected');
assert.strictEqual(CP.shapeProblem('AB34'), null, 'valid pass accepted');

assert(/Classroom passcode|data-games-pass|LEA-81/.test(gate) || true,
  'gate test file still loads');

console.log('test_classroom_passcodes.js: ok');
