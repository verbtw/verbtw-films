import json
import os
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or ''
        anon_key = (
            os.environ.get('SUPABASE_ANON_KEY')
            or os.environ.get('SUPABASE_PUBLISHABLE_KEY')
            or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
            or os.environ.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
            or ''
        )
        payload = {
            'supabaseUrl': url,
            'supabaseAnonKey': anon_key,
            'configured': bool(url and anon_key),
        }
        body = json.dumps(payload).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'public, max-age=300, s-maxage=300')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
