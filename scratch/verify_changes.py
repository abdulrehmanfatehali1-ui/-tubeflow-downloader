import requests

def test_endpoints():
    print("Testing SMS Countries Endpoint...")
    try:
        r = requests.get('http://127.0.0.1:7860/api/sms/countries', timeout=10)
        print(f"SMS Countries API Status: {r.status_code}")
        print(f"SMS Countries API Content-Type: {r.headers.get('content-type')}")
        if r.status_code == 200:
            data = r.json()
            print(f"SMS Countries Count: {len(data)}")
            if len(data) > 0:
                print(f"Sample Country: {data[0]}")
        else:
            print("Failed content:", r.text[:200])
    except Exception as e:
        print(f"Error testing SMS countries: {e}")
        
    print("\nTesting Mail.tm Proxy Domains Endpoint...")
    try:
        r = requests.get('http://127.0.0.1:7860/api/mail/tm/domains', timeout=10)
        print(f"Mail Proxy API Status: {r.status_code}")
        print(f"Mail Proxy API Content-Type: {r.headers.get('content-type')}")
        if r.status_code == 200:
            data = r.json()
            domains = data.get('hydra:member', [])
            print(f"Mail Domains Count: {len(domains)}")
            if len(domains) > 0:
                print(f"Sample Domain: {domains[0]}")
        else:
            print("Failed content:", r.text[:200])
    except Exception as e:
        print(f"Error testing Mail proxy: {e}")

if __name__ == '__main__':
    test_endpoints()
