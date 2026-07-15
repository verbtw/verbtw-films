#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

TRAILER_CACHE = {}

class FilmsHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/config':
            url = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or ''
            anon_key = os.environ.get('SUPABASE_ANON_KEY') or os.environ.get('SUPABASE_PUBLISHABLE_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') or ''
            return self.send_json({'supabaseUrl': url, 'supabaseAnonKey': anon_key, 'configured': bool(url and anon_key)})
        if parsed.path != '/api/trailer':
            return super().do_GET()
        title = urllib.parse.parse_qs(parsed.query).get('title', [''])[0].strip()[:180]
        if not title:
            return self.send_json({'error': 'missing title'}, 400)
        if title not in TRAILER_CACHE:
            query = urllib.parse.quote_plus(f'{title} официальный трейлер русский')
            try:
                page = subprocess.run(
                    ['curl', '-L', '--max-time', '18', '-s', f'https://www.youtube.com/results?search_query={query}'],
                    check=True, capture_output=True, text=True, timeout=22
                ).stdout
                match = re.search(r'"videoId":"([A-Za-z0-9_-]{11})"', page)
                TRAILER_CACHE[title] = match.group(1) if match else ''
            except Exception:
                TRAILER_CACHE[title] = ''
        return self.send_json({'videoId': TRAILER_CACHE[title]})

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stdout.write('[FILMS] ' + fmt % args + '\n')

if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8000), FilmsHandler)
    print('FILMS запущен: http://localhost:8000')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
