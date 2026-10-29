// Runs in <head> before the page draws: applies the saved theme (no flash) and sends
// phones to app.html and computers to index.html. ?view=mobile|desktop sets a manual
// choice, ?view=auto clears it.
(function () {
  var THEME_COLORS = { midnight: '#0b101d', valhalla: '#120c1f', daylight: '#f4f6fb' };
  var page = document.currentScript && document.currentScript.dataset.page;
  try {
    var theme = localStorage.getItem('bh_theme_v1');
    if (theme && THEME_COLORS[theme]) {
      document.documentElement.setAttribute('data-theme', theme);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
    }

    var params = new URLSearchParams(location.search);
    var view = params.get('view');
    if (view === 'auto') localStorage.removeItem('bh_view_v1');
    else if (view === 'mobile' || view === 'desktop') localStorage.setItem('bh_view_v1', view);
    params.delete('view');
    var choice = localStorage.getItem('bh_view_v1');

    var isPhone = /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent) ||
      window.matchMedia('(max-width: 820px) and (pointer: coarse)').matches;
    var want = choice || (isPhone ? 'mobile' : 'desktop');
    var target = want === 'mobile' && page === 'desktop' ? 'app.html'
      : want === 'desktop' && page === 'mobile' ? 'index.html' : null;
    var query = params.toString();
    if (target) location.replace(target + (query ? '?' + query : '') + location.hash);
    else if (view) history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
  } catch (err) { /* storage or matchMedia unavailable: stay on this page */ }
})();
