
from flask import Flask, render_template, request, jsonify
from alice import Alice
from bob import Bob
import numpy as np
import os
import socket

# Set template_folder to current directory to find ui.html
app = Flask(__name__, template_folder=os.getcwd())

alice = Alice()
bob = Bob()

@app.route('/')
def index():
    return render_template('ui.html')

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
    pattern = data.get('pattern', []) # List of ints
    
    if len(pattern) != length:
        return jsonify({"error": "Pattern length mismatch"}), 400

    # Alice generates keys
    # pattern needs to be list or array, Alice handles it
    alice.prepare_quantum_states(length, pattern)
    
    # Get the raw data from Alice
    raw_bits = alice.raw_bits
    bases = alice.bases
    
    # Derive masked bits and symbols for UI
    # masked_bits = raw_bits ^ pattern
    masked_bits = [r ^ p for r, p in zip(raw_bits, pattern)]
    
    symbols = []
    for i in range(length):
        if bases[i] == 0: # Rectilinear
             # 0 -> |0>, 1 -> |1>
             symbols.append("|0⟩" if masked_bits[i] == 0 else "|1⟩")
        else: # Diagonal
             # 0 -> |+>, 1 -> |- >
             symbols.append("|+⟩" if masked_bits[i] == 0 else "|-⟩")
             
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
    
    if not (alice_bases and bob_bases and bob_bits):
         return jsonify({"error": "Missing data for sifting"}), 400
         
    sifted_key, matches = bob.sift_keys(alice_bases, bob_bases, bob_bits)
    
    return jsonify({
        "siftedKey": sifted_key,
        "matches": matches
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

if __name__ == '__main__':
    print("Starting Antigravity Quantum Server...")
    app.run(host='0.0.0.0', port=5000, debug=True)
