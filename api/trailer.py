import json
import re
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        title = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('title', [''])[0].strip()[:180]
        if not title:
            return self.send_json({'error': 'missing title'}, 400)
        query = urllib.parse.quote_plus(f'{title} официальный трейлер русский')
        request = urllib.request.Request(
            f'https://www.youtube.com/results?search_query={query}',
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
                'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
                'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+917'
            }
        )
        try:
            with urllib.request.urlopen(request, timeout=18) as response:
                page = response.read().decode('utf-8', 'ignore')
            match = re.search(r'"videoId":"([A-Za-z0-9_-]{11})"', page)
            return self.send_json({'videoId': match.group(1) if match else ''})
        except Exception:
            return self.send_json({'videoId': ''}, 200)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
