import requests
import json

BASE_URL = "http://localhost:5000"

def test_sync_key():
    print("Testing /api/qkd/sync_key...")
    payload = {"shared_key": "101010"}
    res = requests.post(f"{BASE_URL}/api/qkd/sync_key", json=payload)
    print(res.json())
    assert res.status_code == 200

def test_receive_message():
    print("Testing /api/chat/receive...")
    payload = {
        "id": "test-uuid",
        "sender": "alice",
        "plaintext": "Hello Peer!",
        "encrypted_hex": "4A",
        "timestamp": 123456789
    }
    res = requests.post(f"{BASE_URL}/api/chat/receive", json=payload)
    print(res.json())
    assert res.status_code == 200

def test_get_messages():
    print("Verifying messages in /api/chat/messages...")
    res = requests.get(f"{BASE_URL}/api/chat/messages")
    messages = res.json().get('messages', [])
    print(f"Messages count: {len(messages)}")
    assert any(m['plaintext'] == "Hello Peer!" for m in messages)

if __name__ == "__main__":
    try:
        test_sync_key()
        test_receive_message()
        test_get_messages()
        print("\nAll backend sync tests PASSED!")
    except Exception as e:
        print(f"\nTest FAILED: {e}")
