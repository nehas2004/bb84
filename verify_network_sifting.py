
import requests
import time

# Wait for server to be up
time.sleep(2)

BASE_URL = "http://127.0.0.1:5000"

print("--- Testing Network Sifting Endpoints ---")

# 1. Generate keys (Alice) to populate internal state
print("\n1. Generating keys on Alice...")
resp = requests.post(f"{BASE_URL}/api/generate_keys", json={"length": 10})
if resp.status_code == 200:
    print("✅ Keys generated.")
    alice_bases = resp.json().get('aliceBases')
    print(f"Alice Bases (from gen): {alice_bases}")
else:
    print(f"❌ Failed to generate keys: {resp.text}")
    exit(1)

# 2. Fetch public bases (Alice Endpoint)
print("\n2. Fetching public bases from Alice...")
resp = requests.get(f"{BASE_URL}/api/public/bases")
if resp.status_code == 200:
    fetched_bases = resp.json().get('bases')
    print(f"Fetched Bases: {fetched_bases}")
    if fetched_bases == alice_bases:
        print("✅ Fetched bases match generated bases.")
    else:
        print("❌ Bases do not match!")
else:
    print(f"❌ Failed to fetch bases: {resp.text}")

# 3. Bob fetch peer bases (Bob Endpoint -> Alice Endpoint)
# Since we are on localhost, we can tell Bob to fetch from '127.0.0.1' (himself/Alice)
print("\n3. Bob fetching peer bases (Loopback)...")
resp = requests.post(f"{BASE_URL}/api/fetch_peer_bases", json={"peer_ip": "127.0.0.1"})
if resp.status_code == 200:
    bob_fetched_bases = resp.json().get('aliceBases')
    print(f"Bob Fetched: {bob_fetched_bases}")
    if bob_fetched_bases == alice_bases:
        print("✅ Bob successfully fetched Alice's bases via network endpoint.")
    else:
        print("❌ Bob fetched incorrect bases.")
else:
    print(f"❌ Bob failed to fetch bases: {resp.text}")
