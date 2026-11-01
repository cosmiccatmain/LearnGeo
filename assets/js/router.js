(function (global) {
  'use strict';

  var paths = {
    portal: '/home',
    codex: '/codex',
    classroom: '/myclassroom',
    teacher: '/myclass',
    learn: '/learn',
    test: '/test',
    quiz: '/quiz',
    games: '/games'
  };
  var restoring = false;

  function pathForView(view) {
    return Object.prototype.hasOwnProperty.call(paths, view) ? paths[view] : null;
  }

  function viewForPath(path) {
    path = path.replace(/\/+$/, '') || '/';
    return Object.keys(paths).find(function (view) { return paths[view] === path; }) || null;
  }

  function record(view, opts) {
    var path = view ? pathForView(view) : '/';
    if (!path) throw new Error('Unknown app view: ' + view);
    var url = path + global.location.search + global.location.hash;
    var current = global.location.pathname + global.location.search + global.location.hash;
    if (url === current) return;
    global.history[restoring || (opts && opts.history === 'replace') ? 'replaceState' : 'pushState'](null, '', url);
  }

  function restore() {
    var view = viewForPath(global.location.pathname);
    restoring = true;
    try {
      global.UI.closeModals();
      if (view) global.UI.showApp(view, { history: 'replace' });
      else global.UI.showLanding({ history: 'replace' });
    } finally {
      restoring = false;
    }
  }

  global.AppRouter = {
    pathForView: pathForView,
    viewForPath: viewForPath,
    record: record,
    restore: restore
  };
  global.addEventListener('popstate', restore);
})(window);
