import requests

BASE = 'http://127.0.0.1:5000'

requests.post(f'{BASE}/api/chat/clear')
print('[1] Chat cleared')

key = '10101'

r = requests.post(f'{BASE}/api/chat/send', json={'message': 'Secret test!', 'sender': 'alice', 'key': key})
entry = r.json().get('entry', {})
print(f'[2] Alice sent: success={r.json().get("success")} | enc={entry.get("encrypted_hex","")[:20]}')

r = requests.post(f'{BASE}/api/chat/messages', json={'key': key})
msgs = r.json().get('messages', [])
print(f'[3] Total messages: {len(msgs)}')
for m in msgs:
    print(f'    {m["sender"]}: "{m["plaintext"]}" (cipher: {m["encrypted_hex"][:12]}...)')
