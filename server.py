import http.server
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

PORT = int(os.environ.get('PORT', 8000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Brawlhalla API v1.0: no API key needed (limit: 2000 requests / 5 minutes).
API_BASE = 'https://api.brawlhalla.com/v1'
# dair.gg community API: has per-legend levels for every account, but doesn't reliably
# allow browser (CORS) requests, so the page fetches it through this relay.
DAIR_BASE = 'https://api.dair.gg/v1/brawlhalla'


class TrackerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    # Only the site's own files are served (no CORS headers, since the pages call /api on the same
    # origin), so other websites open in the browser can't read the repo, .git or local secrets.
    PUBLIC_FILE = re.compile(r'\.(html|js|json|svg|png|jpe?g|webp|avif|webmanifest|css|ico)$', re.I)
    PRIVATE_DIRS = {'worker', 'tools'}

    def is_public(self, path):
        parts = [p for p in urllib.parse.unquote(path).split('/') if p]
        if not parts:
            return True  # / serves index.html
        if any(p.startswith('.') for p in parts) or parts[0] in self.PRIVATE_DIRS:
            return False
        return bool(self.PUBLIC_FILE.search(parts[-1]))

    def do_HEAD(self):
        if not self.is_public(urllib.parse.urlparse(self.path).path):
            self.send_error(404)
            return
        super().do_HEAD()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path.startswith(('/api/player/', '/api/dair/')):
            parts = parsed.path.strip('/').split('/')
            if len(parts) < 3 or not parts[2].isdigit():
                self.send_error_json(400, "Brawlhalla ID must be a number")
                return
            bh_id = parts[2]
            if parts[1] == 'dair':
                self.relay_json(f"{DAIR_BASE}/players/{bh_id}", bh_id,
                                lambda b: isinstance(b.get('data'), dict) and b['data'].get('legends'))
            else:
                self.relay_json(f"{API_BASE}/player/stats?brawlhalla_id={bh_id}&mode=all", bh_id,
                                lambda b: b.get('legends'))
            return

        if not self.is_public(parsed.path):
            self.send_error(404)
            return
        super().do_GET()

    def relay_json(self, url, bh_id, has_player):
        req = urllib.request.Request(url, headers={'User-Agent': 'BrawlhallaStanceTracker/1.0'})

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
            body = json.loads(data or b'{}')
            # The APIs return [] / {} with no legends for unknown IDs
            if not isinstance(body, dict) or not has_player(body):
                self.send_error_json(404, f"No player found with Brawlhalla ID {bh_id}")
                return
            self.send_json(200, body)
        except urllib.error.HTTPError as e:
            msg = f"Brawlhalla API returned HTTP {e.code}"
            if e.code == 429:
                msg += " (rate limited, wait a few seconds)"
            self.send_error_json(e.code, msg)
        except urllib.error.URLError as e:
            self.send_error_json(502, f"Failed to reach Brawlhalla API: {e.reason}")
        except Exception as e:
            self.send_error_json(500, str(e))

    def send_json(self, status_code, payload):
        body = json.dumps(payload).encode()
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status_code, message):
        self.send_json(status_code, {'error': message})


if __name__ == '__main__':
    try:
        httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), TrackerHandler)
    except OSError as e:
        print(f"Could not start on port {PORT}: {e}. Try: PORT=8001 python3 server.py")
        sys.exit(1)

    url = f"http://localhost:{PORT}"
    print(f"Brawlhalla Stance Tracker running at {url}")
    if '--no-browser' not in sys.argv:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()
