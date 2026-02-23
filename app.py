
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from alice import Alice
from bob import Bob
import numpy as np
import os
import socket
from qiskit import QuantumCircuit

# Set template_folder to current directory to find ui.html
app = Flask(__name__, template_folder=os.getcwd())
CORS(app) # Enable CORS for all routes (Dev mode)

alice = Alice()
bob = Bob()

@app.route('/')
def index():
    return render_template('backend_landing.html')

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify({
        "local_ip": get_local_ip()
    })

@app.route('/api/generate_keys', methods=['POST'])
def generate_keys():
    data = request.json
    length = int(data.get('length', 5))
    
    # Standard BB84 - No pattern check logic needed


    # Alice generates keys (Standard BB84)
    alice.prepare_quantum_states(length)
    
    # Get the raw data from Alice
    raw_bits = alice.raw_bits
    bases = alice.bases
    
    # With pattern removed, masked_bits ARE the raw_bits (Verification view)
    # We display them as "Alice's Secret Bits"
    # masked_bits = raw_bits 
    
    symbols = []
    for i in range(length):
        if bases[i] == 0: # Rectilinear
             # 0 -> |0>, 1 -> |1>
             symbols.append("|0⟩" if raw_bits[i] == 0 else "|1⟩")
        else: # Diagonal
             # 0 -> |+>, 1 -> |- >
             symbols.append("|+⟩" if raw_bits[i] == 0 else "|-⟩")
             
    print(f"[Backend] Generated {length} qubits. Symbols: {symbols}")
    
    return jsonify({
        "aliceBits": raw_bits,
        "aliceBases": bases,
        "qubitSymbols": symbols
    })

@app.route('/api/bob_measure', methods=['POST'])
def bob_measure():
    # In a real network, 'alice.encoded_qubits' would be sent over the wire.
    # Here we simulate receiving them from the local Alice instance for now,
    # OR we receive them as serialized data if simulating network.
    # For simplicity in this logical phase, we access the global alice object 
    # BUT since we want to support two laptops, we should accept data in body.
    
    # However, sending QuantumCircuit objects over JSON HTTP is complex (serialization).
    # Ideally we'd use Qiskit QASM or similar.
    # For this "Phase 3" step, if we are on the SAME machine, we can use global.
    # If different machines, we need a way to transmit.
    
    # Let's assume for the "User's Phase 3" where they want to "ensure connection between 2 laptops",
    # we need to be able to SEND the qubit info.
    
    # Since we can't easily send actual Qubits over HTTP without serialization, 
    # and we are simulating the quantum channel anyway...
    # We will accept "bases" and "bits" (the classical info needed to reconstruct or verify) 
    # OR we just rely on the fact that this is a simulation.
    
    # For TRUE laptop-to-laptop simulation:
    # Alice generates bits + bases -> Encodes to Qubits.
    # She sends Qubits to Bob.
    # Since we can't send Qubits, Alice should send the ARGUMENTS for the state 
    # (e.g. "I prepared Qubit 1 as |+>").
    # But that defeats the security. Bob shouldn't know!
    
    # Solution: The simulation of the Quantum Channel happening "over the network" 
    # typically sends the *classical description* of the state (e.g. bit=1, basis=Rect) 
    # effectively "cheating" but encrypted/hidden, OR we just assume they are shared 
    # via a side-channel for the simulation's sake.
    
    # BETTER APPROACH for Simulation:
    # Alice sends a custom JSON payload representing the photon sequence.
    # Bob receives it, builds his own local QuantumCircuits (as if he received photons),
    # and measures them.
    
    data = request.json
    # Expecting 'qubit_data' which might be [{'bit': 0, 'basis': 1}, ...] from Alice
    # This allows Bob to reconstruct the quantum state locally to measure it.
    
    qubit_data = data.get('qubit_data')
    
    if not qubit_data:
        # Fallback for local testing if Alice is in memory
        if alice.encoded_qubits:
             # We can't really "measure" the global alice object safely if we want to be realistic.
             # Let's generate circuits from the global alice state if local.
             pass
        return jsonify({"error": "No qubit data received"}), 400

    # Reconstruct circuits for Bob to measure
    # Bob doesn't know 'bit' (secret), he just gets a photon. 
    # But to simulate 'getting a photon', we create the circuit representing that photon.
    received_qubits = []
    for q in qubit_data:
        qc = QuantumCircuit(1)
        bit = q['bit'] # The value encoded
        basis = q['basis'] # The basis used
        
        # Prepare the state exactly as Alice did
        if basis == 0: # Rectilinear
            if bit == 1:
                qc.x(0)
        else: # Diagonal
            if bit == 0:
                qc.h(0)
            else:
                qc.x(0)
                qc.h(0)
        received_qubits.append(qc)

    bob_bases, measured_bits = bob.measure_qubits(received_qubits)
    
    return jsonify({
        "bobBases": bob_bases,
        "measuredBits": measured_bits
    })

@app.route('/api/sift_keys', methods=['POST'])
def sift_keys():
    data = request.json
    alice_bases = data.get('aliceBases')
    bob_bases = data.get('bobBases')
    bob_bits = data.get('bobBits')
    
    if not alice_bases:
        # Fallback to global Alice for local simulation
        if alice.bases:
             alice_bases = alice.bases
        else:
             return jsonify({"error": "Missing Alice bases and no local state"}), 400

    if not (bob_bases and bob_bits):
         return jsonify({"error": "Missing Bob data for sifting"}), 400
         
    sifted_key, matches = bob.sift_keys(alice_bases, bob_bases, bob_bits)
    
    return jsonify({
        "siftedKey": sifted_key,
        "matches": matches
    })

@app.route('/api/verify_key', methods=['POST'])
def verify_key():
    data = request.json
    matches = data.get('matches')
    
    if not matches:
        return jsonify({"error": "Missing matches"}), 400
        
    if not alice.raw_bits:
        return jsonify({"error": "Alice has no bits"}), 400
        
    # Alice's key is the raw bits at the matching indices
    alice_key = [alice.raw_bits[i] for i in matches]
    
    return jsonify({
        "aliceKey": alice_key
    })

@app.route('/api/sample_key', methods=['POST'])
def sample_key():
    data = request.json
    sifted_key = data.get('siftedKey')
    
    if not sifted_key:
        return jsonify({"error": "Missing sifted key"}), 400
        
    indices, bits, remaining = bob.sample_for_verification(sifted_key)
    
    return jsonify({
        "sampleIndices": indices,
        "sampleBits": bits,
        "remainingKey": remaining
    })

@app.route('/api/compare_sample', methods=['POST'])
def compare_sample():
    data = request.json
    sample_indices = data.get('sampleIndices')
    bob_sample_bits = data.get('bobSampleBits')
    
    if not (sample_indices and bob_sample_bits):
        return jsonify({"error": "Missing sample data"}), 400
        
    # Alice compares with her raw bits
    # But wait, Alice's SIFTED bits might be at different indices than Raw bits?
    # NO. Sifted key is a subset. 
    # Bob has sifted key. Sample indices are indices into the SIFTED key, not Raw.
    # We need Alice's SIFTED key to compare correctly.
    
    # We need to reconstruction Alice's sifted key first.
    # In `sift_keys` endpoint, we returned `matches` (indices in raw key).
    # We can use that.
    
    # Ideally, client sends 'matches' too, or we store them.
    # Let's ask client to send 'originalMatches' (indices in raw key).
    
    matches = data.get('originalMatches') # The list of indices where bases matched
    if not matches:
         return jsonify({"error": "Missing original match indices"}), 400
         
    # Alice's sifted key
    alice_sifted = [alice.raw_bits[i] for i in matches]
    
    # Now get the specific sample bits from Alice's sifted key
    alice_sample_bits = [alice_sifted[i] for i in sample_indices]
    
    # Compare
    error_count = 0
    total = len(sample_indices)
    
    for a, b in zip(alice_sample_bits, bob_sample_bits):
        if a != b:
            error_count += 1
            
    qber = (error_count / total) * 100 if total > 0 else 0
    
    # Logic continues below to store key if verified

    # If verified (and low error), we can store the final key for Alice
    if qber == 0: # Strict check for this demo
        # Alice's remaining key = sifted key with sample indices removed.
        # Note: sample_indices are indices INTO the sifted key.
        alice_remaining = [alice_sifted[i] for i in range(len(alice_sifted)) if i not in sample_indices]
        alice.shared_key = alice_remaining
        print(f"[Alice] Key established: {len(alice.shared_key)} bits.")

    return jsonify({
        "aliceSampleBits": alice_sample_bits,
        "errorCount": error_count,
        "qber": qber,
        "verified": qber == 0
    })

@app.route('/api/alice/key_status', methods=['GET'])
def get_alice_key():
    if alice.shared_key:
        return jsonify({"sharedKey": alice.shared_key})
    return jsonify({"sharedKey": None})

@app.route('/api/finalize_key', methods=['POST'])
def finalize_key():
    data = request.json
    sifted_key = data.get('siftedKey')
    
    if not sifted_key:
        return jsonify({"error": "Missing data for key finalization"}), 400
        
    final_key = bob.finalize_key(sifted_key)
    
    return jsonify({
        "finalKey": final_key
    })

@app.route('/api/get_quantum_data', methods=['GET'])
def get_quantum_data():
    """Alice exposes this so Bob can fetch the 'quantum' states."""
    if not alice.encoded_qubits:
        return jsonify({"error": "No keys generated yet"}), 404
        
    # Serialize the global Alice state to send to Bob
    # We send bits and bases. In a real physical implementation, this is impossible.
    # But this is the "Quantum Channel" simulation over HTTP.
    
    # We structure it as 'qubit_data'
    qubit_data = []
    # Alice's raw bits and bases should be same length
    for bit, basis in zip(alice.raw_bits, alice.bases):
        qubit_data.append({"bit": int(bit), "basis": int(basis)})
        
    return jsonify({"qubit_data": qubit_data})

@app.route('/api/fetch_from_peer', methods=['POST'])
def fetch_from_peer():
    """Bob calls this to tell his backend to go fetch data from Alice's IP."""
    import requests
    data = request.json
    peer_ip = data.get('peer_ip')
    
    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400
        
    # Bob's backend talks to Alice's backend
    try:
        # Assuming default port 5000
        target_url = f"http://{peer_ip}:5000/api/get_quantum_data"
        print(f"[Bob] Fetching from {target_url}...")
        resp = requests.get(target_url, timeout=5)
        
        if resp.status_code != 200:
             return jsonify({"error": f"Failed to fetch from Alice: {resp.text}"}), 500
             
        alice_data = resp.json()
        qubit_data = alice_data.get('qubit_data')
        
        # Now Bob measures immediately upon receipt (simulating detection)
        # We reuse the logic from bob_measure but now triggered via fetch
        
        # 1. Reconstruct circuits (logical)
        # We actually don't need to reconstruct FULL circuits if we just trust the math,
        # but let's stick to the bob.measure_qubits contract if possible 
        # OR just do the math here for speed/simplicity if circuit overhead is high.
        # Bob.io: measure_qubits takes encoded_qubits.
        
        # Let's create the circuits to be consistent with the simulation check
        received_qubits = []
        for q in qubit_data:
            qc = QuantumCircuit(1)
            bit = q['bit'] 
            basis = q['basis'] 
            if basis == 0: # Rectilinear
                if bit == 1: qc.x(0)
            else: # Diagonal
                if bit == 0: qc.h(0)
                else: qc.x(0); qc.h(0)
            received_qubits.append(qc)
            
        bob_bases, measured_bits = bob.measure_qubits(received_qubits)
        
        return jsonify({
            "status": "success",
            "message": f"Received and measured {len(measured_bits)} qubits",
            "bobBases": bob_bases,
            "measuredBits": measured_bits
        })
        
    except Exception as e:
        print(f"Error fetching from peer: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/public/bases', methods=['GET'])
def get_public_bases():
    """Alice exposes ONLY her bases (Classical Channel)."""
    if not alice.bases:
         return jsonify({"error": "No bases available"}), 404
    return jsonify({"bases": alice.bases})

@app.route('/api/fetch_peer_bases', methods=['POST'])
def fetch_peer_bases():
    """Bob fetches Alice's bases via the classical channel."""
    import requests
    data = request.json
    peer_ip = data.get('peer_ip')

    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400

    try:
        # Assuming default port 5000
        target_url = f"http://{peer_ip}:5000/api/public/bases"
        print(f"[Bob] Fetching bases from {target_url}...")
        resp = requests.get(target_url, timeout=5)

        if resp.status_code != 200:
             return jsonify({"error": f"Failed to fetch bases from Alice: {resp.text}"}), 500

        data = resp.json()
        return jsonify({"aliceBases": data.get('bases')})

    except Exception as e:
        print(f"Error fetching peer bases: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/verify_peer_sample', methods=['POST'])
def verify_peer_sample():
    """Bob calculates sample locally, then sends it to Alice for comparison."""
    import requests
    data = request.json
    peer_ip = data.get('peer_ip')
    sifted_key = data.get('sifted_key')
    original_matches = data.get('original_matches')
    
    if not (peer_ip and sifted_key and original_matches):
         return jsonify({"error": "Missing parameters for network verification"}), 400
         
    # 1. Bob samples his key locally
    indices, bits, remaining = bob.sample_for_verification(sifted_key)
    
    # 2. Bob sends sample to Alice
    try:
        target_url = f"http://{peer_ip}:5000/api/compare_sample"
        payload = {
            "sampleIndices": indices,
            "bobSampleBits": bits,
            "originalMatches": original_matches
        }
        print(f"[Bob] Sending sample to Alice for verification at {target_url}...")
        
        resp = requests.post(target_url, json=payload, timeout=5)
        
        if resp.status_code != 200:
             return jsonify({"error": f"Verification failed at Alice: {resp.text}"}), 500
             
        # Alice returns the QBER result
        alice_res = resp.json()
        
        # Combine local Bob info (remaining key) with Alice' result
        return jsonify({
            "sampleIndices": indices,
            "sampleBits": bits,
            "remainingKey": remaining,
            "errorCount": alice_res.get('errorCount'),
            "qber": alice_res.get('qber'),
            "verified": alice_res.get('verified')
        })
        
    except Exception as e:
        print(f"Error during network verification: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/encrypt_message', methods=['POST'])
def encrypt_message():
    data = request.json
    message = data.get('message', '')
    key_str = data.get('key', '')
    
    if not message or not key_str:
        return jsonify({"error": "Message and key required"}), 400
        
    # Convert message to bits
    msg_bytes = message.encode('utf-8')
    msg_bits = []
    for byte in msg_bytes:
        msg_bits.extend([int(b) for b in format(byte, '08b')])
        
    # XOR with key (OTP simulation)
    encrypted_bits = []
    key_len = len(key_str)
    for i, bit in enumerate(msg_bits):
        k_bit = int(key_str[i % key_len])
        encrypted_bits.append(bit ^ k_bit)
        
    # Convert encrypted bits to hex stream
    while len(encrypted_bits) % 4 != 0:
        encrypted_bits.insert(0, 0)
        
    enc_int = int(''.join(map(str, encrypted_bits)), 2)
    hex_len = (len(encrypted_bits) + 3) // 4
    encrypted_hex = f"{enc_int:0{hex_len}x}"
    
    # Save the encrypted hex to the 'outbox'
    # Actually need to add 'outbox' to the Alice class 
    # but for simplicity, just attach it dynamically or use a global dict
    if not hasattr(alice, 'outbox'):
        alice.outbox = []
    alice.outbox.append(encrypted_hex)
    print(f"[Backend] Message stored in outbox. Total messages: {len(alice.outbox)}")
    
    return jsonify({"encrypted_hex": encrypted_hex})

@app.route('/api/get_message', methods=['GET'])
def get_message():
    """Alice exposes her outbox via this endpoint."""
    if not hasattr(alice, 'outbox') or len(alice.outbox) == 0:
        return jsonify({"messages": []})
    
    # Return all messages in the outbox
    return jsonify({"messages": alice.outbox})

@app.route('/api/fetch_message_from_peer', methods=['POST'])
def fetch_message_from_peer():
    """Bob uses this endpoint to ask his backend to poll Alice's backend for messages."""
    import requests
    data = request.json
    peer_ip = data.get('peer_ip')
    
    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400
        
    try:
        # Ask Alice's backend for her outbox
        target_url = f"http://{peer_ip}:5000/api/get_message"
        print(f"[Bob] Polling for messages from {target_url}...")
        resp = requests.get(target_url, timeout=5)
        
        if resp.status_code != 200:
             return jsonify({"error": f"Failed to fetch messages from peer: {resp.text}"}), 500
             
        data = resp.json()
        messages = data.get('messages', [])
        
        return jsonify({"messages": messages})

    except Exception as e:
        print(f"Error fetching messages from peer: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/decrypt_message', methods=['POST'])
def decrypt_message():
    data = request.json
    encrypted_hex = data.get('encrypted_hex', '')
    key_str = data.get('key', '')
    
    if not encrypted_hex or not key_str:
        return jsonify({"error": "Encrypted message and key required"}), 400
        
    # Convert hex to bits
    hex_len = len(encrypted_hex)
    enc_int = int(encrypted_hex, 16)
    encrypted_bitsStr = format(enc_int, f'0{hex_len*4}b')
    encrypted_bits = [int(b) for b in encrypted_bitsStr]
    
    # Remove padding if any (for simple XOR, we padded front? No, wait)
    # Actually my previous Python 3 padding for bits was:
    # while len(encrypted_bits) % 8 != 0:
    # We should be careful about padding.
    # Let's write a safer pad:
    
    # Better logic:
    
    # XOR with key
    decrypted_bits = []
    key_len = len(key_str)
    
    # To avoid padding issues: let's pad at the end with 0s so it doesn't affect the string prefix
    
    # Let's just do a direct XOR for the bits we have. But the length from HEX might be larger.
    # We will just XOR all bits. Extra bits at the end will just form null bytes.
    for i, bit in enumerate(encrypted_bits):
        # Prevent out of bounds if encrypted_bits is smaller than expected, but it should be exact.
        k_bit = int(key_str[i % key_len]) if key_len > 0 else 0
        decrypted_bits.append(bit ^ k_bit)
        
    # Convert bits to string
    msg_bytes = bytearray()
    for i in range(0, len(decrypted_bits), 8):
        byte_bits = decrypted_bits[i:i+8]
        if len(byte_bits) == 8:
            msg_bytes.append(int(''.join(map(str, byte_bits)), 2))
            
    try:
        # Strip null bytes in case of padding
        decrypted_message = msg_bytes.decode('utf-8').rstrip('\x00')
    except:
        decrypted_message = "<decryption failed>"
        
    return jsonify({"decrypted_message": decrypted_message})

if __name__ == '__main__':
    print("Starting Antigravity Quantum Server...")
    app.run(host='0.0.0.0', port=5000, debug=True)
