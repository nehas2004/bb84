import requests
import time

BASE_URL = "http://localhost:5000/api"

def test_pipeline():
    print("=== Testing BB84 with Fiorini et al 2024 Noise Model ===\n")

    # 1. Configure Noise (p = 0.40, QBER_SN = 1.85, hardware noise = True)
    print("1. Updating Noise Configuration...")
    noise_cfg = {
        "interception_density": 0.40,
        "use_hardware_noise": True,
        "qber_sn": 1.85
    }
    res = requests.post(f"{BASE_URL}/set_noise_config", json=noise_cfg)
    assert res.status_code == 200, res.text
    print(f"Server Config Response: {res.json()['noise_config']}\n")

    # 2. Alice Generates Qubits
    print("2. Alice generating 100 qubits...")
    res = requests.post(f"{BASE_URL}/generate_keys", json={"length": 100})
    alice_data = res.json()
    print(f"Alice Bits generated: {len(alice_data['aliceBits'])}\n")

    # 3. Retrieve Qubits via Channel (Eve intercepts with p=0.40)
    print("3. Fetching Quantum Data (Passing through Eve & Channel)...")
    res = requests.get(f"{BASE_URL}/get_quantum_data")
    channel_data = res.json()
    print(f"Eve Active in Channel: {channel_data['eve_active']}")
    print(f"Original Count: {channel_data['original_count']} -> Survived: len(qubit_data)\n")

    # 4. Bob Measures the Data
    print("4. Bob Measuring Qubits (applying GenericBackendV2 Hardware Noise)...")
    payload = {"qubit_data": channel_data["qubit_data"]}
    res = requests.post(f"{BASE_URL}/bob_measure", json=payload)
    bob_data = res.json()
    print(f"Bob Measured: {len(bob_data['measuredBits'])} bits\n")

    # 5. Sift Keys
    print("5. Sifting Keys...")
    sift_payload = {
        "aliceBases": alice_data["aliceBases"],
        "bobBases": bob_data["bobBases"],
        "bobBits": bob_data["measuredBits"]
    }
    res = requests.post(f"{BASE_URL}/sift_keys", json=sift_payload)
    sift_data = res.json()
    sifted_key = sift_data["siftedKey"]
    matches = sift_data["matches"]
    print(f"Sifted Key length: {len(sifted_key)}\n")

    # 6. Verify and Sample (Calculate p_hat)
    print("6. Verifying Sample & Calculating Intrusion Metrics...")
    # Bob takes a sample
    res = requests.post(f"{BASE_URL}/sample_key", json={"siftedKey": sifted_key})
    sample_data = res.json()
    
    # Send sample to Alice for comparison
    compare_payload = {
        "sampleIndices": sample_data["sampleIndices"],
        "bobSampleBits": sample_data["sampleBits"],
        "originalMatches": matches
    }
    res = requests.post(f"{BASE_URL}/compare_sample", json=compare_payload)
    compare_data = res.json()

    print(f"---- VERIFICATION RESULTS ----")
    print(f"Total Errors: {compare_data['errorCount']}")
    print(f"Gross QBER:   {compare_data['qber']:.2f}%")
    print(f"QBER_SN:      {compare_data['qber_sn']}%")
    print(f"Estimated Interception Density (p_hat): {compare_data.get('p_hat', 0):.3f}")
    print(f"Algorithm Verified Status (p_hat < 0.1): {compare_data['verified']}")
    print("------------------------------")
    
    # The expected mathematical p_hat should be somewhat close to 0.40 since we set p=0.40.
    # It won't be exact due to small sample size (100 qubits -> ~50 sifted -> verify sample ~15 bits).
    
    print("\nSUCCESS! E2E execution reached the end without crashing.")

if __name__ == "__main__":
    test_pipeline()
