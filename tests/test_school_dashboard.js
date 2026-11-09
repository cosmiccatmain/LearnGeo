/* LEA-128: Schools dashboard is plan-scoped, preview stays in Development.
   Run: node tests/test_school_dashboard.js */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

var dash = read('assets/js/school-dashboard.js');
var css = read('assets/css/school-dashboard.css');
var admin = read('assets/js/administrator.js');
var prem = read('assets/js/premium.js');
var ui = read('assets/js/ui.js');
var teacher = read('assets/js/teacher.js');
var index = read('index.html');
var sql = read('supabase/deployed/0035_school_dashboard.sql');
var readme = read('supabase/deployed/README.md');
var duel = read('assets/js/game-duel.js');

assert(/Preview school dashboard/.test(admin) && /data-do="schooldash"/.test(admin),
  'Development has a Preview school dashboard control beside the plans preview');
assert(/previewSchoolDashboard/.test(admin) && /SchoolDashboard\.open\(\{\s*preview:\s*true\s*\}\)/.test(admin),
  'the Development control opens the preview');
assert(/Admin\.can[\s\S]{0,80}'ultra'/.test(dash),
  'preview refuses to open unless UltraAdmin is unlocked');
assert(/isSchool\(\)/.test(dash) && /if \(asPreview\)/.test(dash),
  'live open is Schools-only and separate from preview');
assert(/flags\.plan === 'schools'|isSchool/.test(dash),
  'the dashboard is not the global ultra admin');

assert(/school_create_student/.test(sql) && /used >= paid/.test(sql),
  'creating a student stops at the paid seat count');
assert(/school_seat_cap/.test(sql) && /flags,students/.test(sql),
  'seat cap reads flags.students');
assert(/roadtrip,unitId/.test(sql) && /roadtrip,done/.test(sql),
  'Journey level is read from profiles.save.roadtrip');
assert(/account_activity/.test(sql),
  'recent activity uses the existing account_activity row');
assert(/schoolStudent/.test(sql) && /schoolStudent/.test(prem),
  'school accounts and their students keep messaging off');
assert(/function messagingAllowed\(\)[\s\S]{0,280}schoolStudent/.test(prem),
  'messagingAllowed checks flags.schoolStudent');
assert(!/create table[\s\S]{0,200}journey_progress/i.test(sql),
  'no second progress store');

assert(/school_create_class/.test(sql) && /school_rename_class/.test(sql),
  'classrooms can be created and renamed');
assert(/school_class_add/.test(sql) && /school_class_remove/.test(sql),
  'students can be added to and removed from a class');
assert(/school_roster/.test(sql) && /enable row level security/.test(sql),
  'the roster table is not world-readable');
assert(/Schools plan only/.test(sql) && /private\.school_buyer/.test(sql),
  'server calls require a Schools buyer');

assert(/Seats/.test(dash) && /Student messaging is off/.test(dash),
  'dashboard shows seats used and that messaging is off');
assert(/Class roster/.test(dash) && /navBtn\('roster'/.test(dash),
  'class roster is a real section');
assert(/Sample students/.test(dash) && /Riverside Geography/.test(dash),
  'preview uses sample students');

assert(/School dashboard/.test(ui) && /isSchool/.test(ui),
  'profile menu offers the dashboard only through the Schools check');
assert(/id="tm-school"/.test(teacher) && /isSchool/.test(teacher),
  'My class links to the dashboard only for a Schools account');
assert(!/schooldash|School dashboard/.test(read('teachers.html')),
  'the public teachers page does not host the dashboard');
assert(!/[?&]school/.test(dash) && !/location\.search/.test(dash),
  'there is no public URL that opens the preview');

assert(/school-dashboard\.css/.test(index) && /school-dashboard\.js/.test(index),
  'the app loads the dashboard');
assert(/games\.js/.test(index), 'Games stays loaded');
assert(!/Syne|Plus Jakarta/.test(css + dash), 'original LearnGeo fonts only');
assert(!/sparkle|getDisplayMedia|Share screen|screen mirror/i.test(css + dash),
  'no sparkles and no screen mirroring');
assert(/var\(--sans\)/.test(css) && /var\(--serif\)/.test(css) && /var\(--mono\)/.test(css),
  'dashboard uses the app font stacks');

assert(/0035_school_dashboard\.sql/.test(readme) && /school_dashboard_0035/.test(readme),
  'README names the migration');
assert(/school_dashboard_0035/.test(sql), 'SQL names the MCP apply id');

assert(!/SchoolDashboard|school_dashboard|schoolStudent/.test(duel),
  'Geo Duel is not part of this dashboard');

console.log('test_school_dashboard.js: ok');
