import os, requests
from datetime import datetime
token=os.getenv('API_TOKEN','change-me')
r=requests.post('http://127.0.0.1:8000/api/messages',headers={'Authorization':f'Bearer {token}'},json={'sender':'Amazon','body':'Your package is arriving today.','timestamp':datetime.now().astimezone().isoformat()})
print(r.status_code); print(r.text)
