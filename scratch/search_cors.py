with open('app.py', 'r', encoding='utf-8') as f:
    text = f.read()

if 'CORS' in text or 'Access-Control-Allow-Origin' in text:
    print("CORS is configured on backend")
else:
    print("No CORS configuration found on backend")
