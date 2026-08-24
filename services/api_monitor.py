import time
import re
from urllib.parse import urlparse
import requests
from requests.exceptions import RequestException, Timeout, ConnectionError, HTTPError, SSLError

class ApiMonitorService:
    @staticmethod
    def validate_url(url):
        """
        Validates the given URL.
        Returns a tuple: (is_valid, error_message)
        """
        if not url or not url.strip():
            return False, "URL cannot be empty"
        
        url_strip = url.strip()
        
        # Check for spaces or other obvious invalid characters in host
        if " " in url_strip:
            return False, "URL cannot contain spaces"
            
        # Parse URL
        try:
            parsed = urlparse(url_strip)
        except Exception:
            return False, "Malformed URL structure"
            
        # Validate scheme
        scheme = parsed.scheme.lower()
        if not scheme:
            return False, "Missing URL scheme (http:// or https://)"
            
        if scheme not in ("http", "https"):
            return False, f"Unsupported protocol '{scheme}'. Only HTTP and HTTPS are supported."
            
        # Validate hostname/netloc
        netloc = parsed.netloc
        if not netloc:
            return False, "Invalid host in URL"
            
        # Basic check for hostname format
        host_parts = netloc.split('@')[-1].split(':')[0]  # strip user info and port
        if not host_parts or host_parts == '.':
            return False, "Invalid hostname"
            
        # Accept valid hostname characters
        # Alphanumeric, dots, dashes, or IPv4/IPv6 format
        hostname_regex = re.compile(
            r'^([a-zA-Z0-9\-]+)(\.[a-zA-Z0-9\-]+)*$'
        )
        # Check if it's an IP address or a valid domain name
        is_ip = re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', host_parts) or '[' in host_parts
        if not is_ip and not hostname_regex.match(host_parts) and host_parts != 'localhost':
            return False, "Invalid characters in hostname"
            
        return True, None

    @staticmethod
    def perform_check(url, threshold_ms=1000):
        """
        Performs a GET check on the given URL.
        Returns a dictionary containing the performance and health statistics.
        Does NOT raise exceptions.
        """
        url = url.strip()
        is_valid, err = ApiMonitorService.validate_url(url)
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        
        if not is_valid:
            return {
                "url": url,
                "status": "DOWN",
                "status_code": None,
                "response_time_ms": 0,
                "response_size_bytes": 0,
                "content_type": "text/plain",
                "timestamp": timestamp,
                "error": err,
                "preview": None
            }
            
        headers = {
            "User-Agent": "APIPulse/1.0 Monitor"
        }
        
        try:
            # Measure time accurately
            start_time = time.perf_counter()
            # Set timeout to 10 seconds to prevent hanging
            response = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
            end_time = time.perf_counter()
            
            response_time_ms = int((end_time - start_time) * 1000)
            
            # Read content and size
            content = response.content
            response_size_bytes = len(content)
            
            # Parse content type
            content_type_header = response.headers.get("Content-Type", "text/plain")
            # Clean content type to just the mime-type (e.g. application/json)
            content_type = content_type_header.split(";")[0].strip()
            
            # Determine health status based on HTTP status code range
            status_code = response.status_code
            if 200 <= status_code < 300:
                # Successful response — check response time threshold for SLOW
                if response_time_ms >= threshold_ms:
                    status = "SLOW"
                else:
                    status = "UP"
                error_msg = None
            elif 300 <= status_code < 400:
                # Redirects — treat as UP since we followed them; this covers edge cases
                # where allow_redirects=True was bypassed
                status = "REDIRECT"
                error_msg = f"Redirect: HTTP {status_code}"
            elif 400 <= status_code < 500:
                # Client/resource error — server IS reachable, request had an error
                status = "HTTP_ERROR"
                error_msg = f"Client Error: HTTP {status_code}"
            else:
                # 5xx Server errors — server is up but returned an error
                status = "SERVER_ERROR"
                error_msg = f"Server Error: HTTP {status_code}"
                
            # Response preview logic — show preview for all responses
            preview = None
            if response_size_bytes > 2000000:
                preview = f"[Response too large to preview: {response_size_bytes} bytes]"
            else:
                if "json" in content_type:
                    try:
                        preview = response.json()
                    except Exception:
                        try:
                            text_content = response.text
                            preview = text_content[:1000] + ("..." if len(text_content) > 1000 else "")
                        except Exception:
                            preview = "[Unable to parse response body]"
                else:
                    try:
                        text_content = response.text
                        preview = text_content[:1000] + ("..." if len(text_content) > 1000 else "")
                    except Exception:
                        preview = "[Unable to decode text body]"


            return {
                "url": url,
                "status": status,
                "status_code": status_code,
                "response_time_ms": response_time_ms,
                "response_size_bytes": response_size_bytes,
                "content_type": content_type,
                "timestamp": timestamp,
                "error": error_msg,
                "preview": preview
            }
            
        except Timeout:
            return {
                "url": url,
                "status": "DOWN",
                "status_code": None,
                "response_time_ms": 10000, # Show max timeout duration
                "response_size_bytes": 0,
                "content_type": "text/plain",
                "timestamp": timestamp,
                "error": "Request Timeout (exceeded 10 seconds limit)",
                "preview": None
            }
        except ConnectionError as e:
            return {
                "url": url,
                "status": "DOWN",
                "status_code": None,
                "response_time_ms": 0,
                "response_size_bytes": 0,
                "content_type": "text/plain",
                "timestamp": timestamp,
                "error": f"Connection Failure (DNS failed or Host refused connection): {type(e).__name__}",
                "preview": None
            }
        except SSLError as e:
            return {
                "url": url,
                "status": "DOWN",
                "status_code": None,
                "response_time_ms": 0,
                "response_size_bytes": 0,
                "content_type": "text/plain",
                "timestamp": timestamp,
                "error": f"SSL Handshake Error: {str(e)}",
                "preview": None
            }
        except RequestException as e:
            return {
                "url": url,
                "status": "DOWN",
                "status_code": None,
                "response_time_ms": 0,
                "response_size_bytes": 0,
                "content_type": "text/plain",
                "timestamp": timestamp,
                "error": f"Network Error: {str(e)}",
                "preview": None
            }
        except Exception as e:
            return {
                "url": url,
                "status": "DOWN",
                "status_code": None,
                "response_time_ms": 0,
                "response_size_bytes": 0,
                "content_type": "text/plain",
                "timestamp": timestamp,
                "error": f"Unexpected Exception: {str(e)}",
                "preview": None
            }
