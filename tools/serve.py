"""Serves the plugin's folder for tools/export.html and saves what that page POSTs to /save/<name>.

usage: python3 tools/serve.py <port> <out dir>
"""
import http.server, os, sys

# A launcher's PORT wins over the argument
PORT, OUT = int(os.environ.get('PORT') or sys.argv[1]), os.path.abspath(sys.argv[2])
# The plugin's folder, whatever folder this runs from
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(OUT, exist_ok=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        name = os.path.basename(self.path.split('/save/', 1)[-1])
        if not self.path.startswith('/save/') or not name:
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get('content-length', 0)))
        with open(os.path.join(OUT, name), 'wb') as fh:
            fh.write(body)
        self.send_response(204)
        self.end_headers()


http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
