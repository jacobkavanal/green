#!/usr/bin/env python3
"""
Local dev server.

Same as `python3 -m http.server`, plus one thing: it tells the browser
not to cache anything. The plain module sends Last-Modified and nothing
else, so Chrome applies its heuristic freshness rule and will happily
serve a style.css from memory for the rest of the session - you edit a
file, reload, and see the old page. That failure is silent and costs
more time than it has any right to.

Data files are exempt: the service worker caches /data/ deliberately
(see sw.js), and the grids are large and change only when the pipeline
is re-run.
"""

import functools
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if "/data/" not in self.path:
            self.send_header("Cache-Control", "no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")

        super().end_headers()

    def log_message(self, fmt, *args):
        # The default logs every asset; only surface problems.
        if not args or not str(args[0]).startswith(("GET", "HEAD")):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

    handler = functools.partial(NoCacheHandler, directory=".")

    with http.server.ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"Serving http://localhost:{port} (no-store except /data/)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
