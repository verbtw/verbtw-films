import json
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


IMDB_ID_OVERRIDES = {
    'Артур, ты король': 'tt10720352',
    'Общак': 'tt1600196',
    'Авиатор': 'tt0338751',
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        title = params.get('title', [''])[0].strip()[:180]
        content_type = params.get('type', ['movie'])[0]
        if not title:
            return self.send_json({'error': 'missing title'}, 400)

        try:
            imdb_id = IMDB_ID_OVERRIDES.get(title) or self.find_imdb_id(title)
            if not imdb_id:
                return self.send_json({'rating': '', 'imdbId': ''})

            meta_type = 'series' if content_type == 'series' else 'movie'
            data = self.get_json(f'https://v3-cinemeta.strem.io/meta/{meta_type}/{imdb_id}.json')
            meta = data.get('meta', {})
            self.send_json({
                'rating': str(meta.get('imdbRating') or ''),
                'imdbId': imdb_id,
                'year': str(meta.get('year') or ''),
            })
        except Exception:
            self.send_json({'rating': '', 'imdbId': ''})

    def find_imdb_id(self, title):
        query = urllib.parse.quote(title.lower(), safe='')
        result = self.get_json(f'https://v2.sg.media-imdb.com/suggestion/x/{query}.json')
        candidates = result.get('d', [])
        return next((item.get('id') for item in candidates if str(item.get('id', '')).startswith('tt')), '')

    def get_json(self, url):
        request = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
            'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        })
        with urllib.request.urlopen(request, timeout=18) as response:
            return json.loads(response.read().decode('utf-8'))

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 's-maxage=604800, stale-while-revalidate=2592000')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
