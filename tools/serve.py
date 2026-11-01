"""Serve the static site locally with the same app routes as Vercel."""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {
    entry['source']: entry['destination']
    for entry in json.loads((ROOT / 'vercel.json').read_text())['rewrites']
}


class AppHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.rewrite_route()
        super().do_GET()

    def do_HEAD(self):
        self.rewrite_route()
        super().do_HEAD()

    def rewrite_route(self):
        url = urlsplit(self.path)
        route = ROUTES.get(url.path.rstrip('/'))
        if route:
            self.path = route + ('?' + url.query if url.query else '')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('port', nargs='?', type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(AppHandler, directory=str(ROOT)))
    print(f'LearnGeo running at http://localhost:{args.port}', flush=True)
    server.serve_forever()
