import requests
try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None

url = 'https://www.1secmail.com/api/v1/?action=genEmailAddresses&count=3'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
}

print("Testing standard requests to 1secmail...")
try:
    r = requests.get(url, headers=headers, timeout=10)
    print(f"Standard Status: {r.status_code}")
    print(f"Standard Content: {r.text[:200]}")
except Exception as e:
    print(f"Standard Error: {e}")

if curl_requests:
    print("\nTesting curl_requests Chrome impersonation to 1secmail...")
    try:
        r = curl_requests.get(url, headers=headers, impersonate="chrome", timeout=10)
        print(f"Curl Status: {r.status_code}")
        print(f"Curl Content: {r.text[:200]}")
    except Exception as e:
        print(f"Curl Error: {e}")
else:
    print("\ncurl_cffi not available locally to test.")
