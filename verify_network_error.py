
import requests
import time

# Wait for server to be up
time.sleep(2)

BASE_URL = "http://127.0.0.1:5000"

print("--- Testing Network Error Correction (Verification) ---")

# 1. Setup Alice (Generate)
print("\n1. Generating keys on Alice...")
resp = requests.post(f"{BASE_URL}/api/generate_keys", json={"length": 20})
if resp.status_code == 200:
    data = resp.json()
    alice_bits = data.get('aliceBits')
    alice_bases = data.get('aliceBases')
    print("✅ Alice keys generated.")
else:
    print(f"❌ Failed to generate keys: {resp.text}")
    exit(1)

# 2. Setup Bob (Measure & Sift Locally for test setup)
print("\n2. Simulating Bob Measurement & Sifting (Local)...")
# We need to simulate sifting to get a valid 'sifted_key' and 'matches' to send.
# Since we are local, we can cheat and use Alice's data to simulate a perfect or near-perfect key.

# Let's say Bob measures perfectly match Alice for simplicity of test
bob_bits = alice_bits
bob_bases = alice_bases # Perfect match -> 100% sifted
# Actually, let's just picking indices where bases match. 
# Oh wait, we set bob_bases = alice_bases, so they ALL match.
matches = list(range(len(alice_bits)))
sifted_key = bob_bits

print(f"Sifted Key (Length {len(sifted_key)})")

# 3. Bob calls 'verify_peer_sample' (The New Endpoint)
# This mimics Bob sending his sample to Alice over the network
print("\n3. Testing 'verify_peer_sample' Endpoint...")

payload = {
    "peer_ip": "127.0.0.1", # Loopback to Alice
    "sifted_key": sifted_key,
    "original_matches": matches
}

resp = requests.post(f"{BASE_URL}/api/verify_peer_sample", json=payload)

if resp.status_code == 200:
    data = resp.json()
    print("✅ Endpoint returned success.")
    print(f"Error Count: {data.get('errorCount')}")
    print(f"QBER: {data.get('qber')}%")
    print(f"Verified: {data.get('verified')}")
    
    if data.get('errorCount') == 0:
        print("✅ QBER is 0% as expected for perfect match.")
    else:
        print("❌ Unexpected errors found.")
else:
    print(f"❌ Endpoint failed: {resp.text}")
