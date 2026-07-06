import http.server
import urllib.request
import urllib.error
import sys

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b''
        
        # Filter and override headers
        headers = {}
        for k, v in self.headers.items():
            k_low = k.lower()
            if k_low not in ('host', 'content-length', 'connection', 'accept-encoding'):
                headers[k] = v
        headers['Host'] = 'cloud-platform-5vf4.onrender.com'
        headers['Content-Length'] = str(len(post_data))
        
        target_url = f"https://cloud-platform-5vf4.onrender.com{self.path}"
        
        req = urllib.request.Request(
            target_url,
            data=post_data,
            headers=headers,
            method='POST'
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                self.send_response(response.status)
                for k, v in response.headers.items():
                    if k.lower() not in ('transfer-encoding', 'connection', 'content-encoding'):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(response.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in ('transfer-encoding', 'connection', 'content-encoding'):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

    def log_message(self, format, *args):
        # Log to stderr/stdout
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.client_address[0],
                          self.log_date_time_string(),
                          format%args))

def run():
    server_address = ('127.0.0.1', 3000)
    httpd = http.server.HTTPServer(server_address, ProxyHandler)
    print("Python proxy listening on 127.0.0.1:3000", flush=True)
    httpd.serve_forever()

if __name__ == '__main__':
    run()
