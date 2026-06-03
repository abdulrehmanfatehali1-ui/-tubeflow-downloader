import requests
import time

url = 'https://abdulrehmanfatehali1-tubeflow-downloader.hf.space/api/sms/countries'
headers = {
    'User-Agent': 'Mozilla/5.0',
    'Origin': 'https://abdulrehmanfatehali1-ui.github.io'
}

for i in range(12):
    try:
        r = requests.get(url, headers=headers, timeout=5)
        cors = r.headers.get('Access-Control-Allow-Origin')
        print(f"Attempt {i+1}: Status {r.status_code}, CORS Origin Allowed: {cors}")
        if cors == '*':
            print("CORS DEPLOYED SUCCESS!")
            break
    except Exception as e:
        print(f"Error: {e}")
    time.sleep(5)
