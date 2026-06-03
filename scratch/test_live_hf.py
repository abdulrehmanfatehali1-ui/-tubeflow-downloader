import requests
import random
import string

base_url = 'https://abdulrehmanfatehali1-tubeflow-downloader.hf.space/api/mail/tm'

def test_mail_flow():
    # 1. Fetch domains
    print("1. Fetching domains...")
    r = requests.get(f"{base_url}/domains", headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
    print(f"Status: {r.status_code}")
    print(f"Content: {r.text[:300]}")
    if r.status_code != 200:
        return
        
    domains = r.json()
    if isinstance(domains, dict) and 'hydra:member' in domains:
        domain_list = [d['domain'] for d in domains['hydra:member']]
    elif isinstance(domains, list):
        domain_list = [d['domain'] for d in domains]
    else:
        domain_list = ['wshu.net']
        
    domain = domain_list[0]
    print(f"Selected Domain: {domain}")
    
    # 2. Create account
    username = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    email = f"test_{username}@{domain}"
    password = "SuperPassword123!"
    print(f"\n2. Creating account: {email}")
    
    payload = {'address': email, 'password': password}
    r = requests.post(f"{base_url}/accounts", json=payload, headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'}, timeout=10)
    print(f"Status: {r.status_code}")
    print(f"Content: {r.text[:300]}")
    if r.status_code not in [200, 201]:
        return
        
    # 3. Get token
    print(f"\n3. Getting token for: {email}")
    r = requests.post(f"{base_url}/token", json=payload, headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'}, timeout=10)
    print(f"Status: {r.status_code}")
    print(f"Content: {r.text[:300]}")
    if r.status_code != 200:
        return
        
    token = r.json().get('token')
    print(f"Token: {token[:20]}...")
    
    # 4. List messages
    print(f"\n4. Listing messages for token...")
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Authorization': f"Bearer {token}"
    }
    r = requests.get(f"{base_url}/messages", headers=headers, timeout=10)
    print(f"Status: {r.status_code}")
    print(f"Content: {r.text[:300]}")

if __name__ == '__main__':
    test_mail_flow()
