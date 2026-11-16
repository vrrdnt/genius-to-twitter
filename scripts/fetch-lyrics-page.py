"""Fetch a public Genius lyric page using curl_cffi's browser HTTP support."""

import sys
from urllib.parse import urlparse

from curl_cffi import requests


def main():
    url = sys.argv[1]
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"genius.com", "www.genius.com"}
        or parsed.username
        or parsed.password
        or parsed.port
    ):
        raise ValueError("Expected an HTTPS Genius URL")

    response = requests.get(url, impersonate="chrome", timeout=20)
    if response.status_code != 200 or response.headers.get("cf-mitigated") == "challenge":
        raise RuntimeError(f"Genius returned HTTP {response.status_code} or a challenge")
    sys.stdout.buffer.write(response.content)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
