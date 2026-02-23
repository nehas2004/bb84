import requests

print("Generating keys...")
res = requests.post("http://localhost:5000/api/generate_keys", json={"length": 10})
alice_data = res.json()
print("Alice:", alice_data)

print("Bob Measuring...")
res = requests.post("http://localhost:5000/api/bob_measure", json={})
bob_data = res.json()
print("Bob:", bob_data)

print("Sifting keys...")
res = requests.post("http://localhost:5000/api/sift_keys", json={"bobBases": bob_data["bobBases"], "bobBits": bob_data["measuredBits"], "aliceBases": []})
sift_data = res.json()
print("Sift:", sift_data)

print("Sampling key...")
res = requests.post("http://localhost:5000/api/sample_key", json={"siftedKey": sift_data["siftedKey"]})
sample_data = res.json()
print("Sample:", sample_data)

print("Comparing sample...")
res = requests.post("http://localhost:5000/api/compare_sample", json={"sampleIndices": sample_data["sampleIndices"], "bobSampleBits": sample_data["sampleBits"], "originalMatches": sift_data["matches"]})
compare_data = res.json()
print("Compare:", compare_data)

print("Fetching Alice Key...")
res = requests.get("http://localhost:5000/api/alice/key_status")
alice_stored = res.json()
print("Alice Stored Key:", alice_stored)
