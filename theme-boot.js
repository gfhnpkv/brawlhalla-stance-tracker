// Runs in <head> before the page draws: applies the saved theme (no flash).
// The old phone view was removed in November 2026; index.html is
// responsive, so there is no phone/desktop redirect anymore. A stale ?view=
// parameter or stored bh_view_v1 choice from the old view is cleaned up.
(function () {
  var THEME_COLORS = { midnight: '#0f131a', valhalla: '#120c1f', daylight: '#f4f6fb' };
  var script = document.currentScript;
  var themed = !(script && script.hasAttribute('data-no-theme'));
  try {
    var theme = localStorage.getItem('bh_theme_v1');
    if (themed && theme && THEME_COLORS[theme]) {
      document.documentElement.setAttribute('data-theme', theme);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
    }

    var params = new URLSearchParams(location.search);
    var view = params.get('view');
    localStorage.removeItem('bh_view_v1');
    if (view) {
      params.delete('view');
      var query = params.toString();
      history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
    }
  } catch (err) { /* storage unavailable: stay on this page */ }
})();
