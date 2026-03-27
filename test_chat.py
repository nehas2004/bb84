import requests

BASE = 'http://127.0.0.1:5000'

# 1. Clear previous state
requests.post(f'{BASE}/api/chat/clear')
print('[1] Chat cleared')

# 2. Generate quantum key
r = requests.post(f'{BASE}/api/qkd/quick_generate', json={'length': 20})
d = r.json()
key = d.get('shared_key', '')
print(f'[2] Key generated: {key} (QBER: {d.get("qber")})')

# 3. Send a message as Alice
r = requests.post(f'{BASE}/api/chat/send', json={'message': 'Hello Bob!', 'sender': 'alice'})
entry = r.json().get('entry', {})
print(f'[3] Alice sent: success={r.json().get("success")} | enc={entry.get("encrypted_hex","")[:20]}')

# 4. Send a message as Bob
r = requests.post(f'{BASE}/api/chat/send', json={'message': 'Hi Alice!', 'sender': 'bob'})
entry2 = r.json().get('entry', {})
print(f'[4] Bob sent: success={r.json().get("success")} | enc={entry2.get("encrypted_hex","")[:20]}')

# 5. Fetch all messages
r = requests.get(f'{BASE}/api/chat/messages')
msgs = r.json().get('messages', [])
print(f'[5] Total messages: {len(msgs)}')
for m in msgs:
    print(f'    {m["sender"]}: "{m["plaintext"]}" (cipher: {m["encrypted_hex"][:12]}...)')

# 6. Test decryption endpoint
r = requests.post(f'{BASE}/api/decrypt_message', json={'encrypted_hex': msgs[0]['encrypted_hex'], 'key': key})
dec = r.json().get('decrypted_message', '')
print(f'[6] Decrypt test: "{dec}"')
assert dec == 'Hello Bob!', f'Decryption failed! Got: {dec}'

# 7. Test sending without key (should fail)
requests.post(f'{BASE}/api/chat/clear')
r = requests.post(f'{BASE}/api/chat/send', json={'message': 'No key test', 'sender': 'alice'})
print(f'[7] No-key guard: status={r.status_code} error="{r.json().get("error","")}"')
assert r.status_code == 400, 'Expected 400 for no-key send'

print('\n[DONE] All tests passed!')
