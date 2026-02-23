
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from alice import Alice
from bob import Bob
import numpy as np
import os
import random
import socket
from qiskit import QuantumCircuit

# Set template_folder to current directory to find ui.html
app = Flask(__name__, template_folder=os.getcwd())
CORS(app)  # Enable CORS for all routes (Dev mode)

alice = Alice()
bob = Bob()

# ---------------------------------------------------------------------------
# Global noise configuration — updated by /api/set_noise_config
# ---------------------------------------------------------------------------
noise_config = {
    "eve_active":          False,   # Intercept-resend attack by Eve
    "network_noise_rate":  0.0,     # Probability of bit-flip in the JSON stream (0–1)
    "channel_noise_rate":  0.0,     # Depolarizing error rate in AerSimulator (0–1)
    "t1_us":               50.0,    # Thermal T1 in microseconds
    "t2_us":               30.0,    # Thermal T2 in microseconds
    "packet_loss_rate":    0.0,     # Probability each qubit is dropped (0–1)
}


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP


def _apply_network_noise(qubit_data, rate):
    """
    Network Noise: randomly flip some decoded bit values in the qubit data list.
    Simulates classical-channel corruption (bit errors in the photon metadata).
    """
    if rate <= 0:
        return qubit_data, 0
    noisy = []
    flips = 0
    for q in qubit_data:
        entry = dict(q)
        if random.random() < rate:
            entry['bit'] = 1 - entry['bit']  # flip bit
            flips += 1
        noisy.append(entry)
    print(f"[Network Noise] Flipped {flips}/{len(qubit_data)} qubit descriptions.")
    return noisy, flips


def _apply_packet_loss(qubit_data, rate):
    """
    Packet Loss: randomly drop some qubits before Bob receives them.
    Simulates photon loss in fiber-optic cable.
    Returns the surviving qubits and corresponding Alice-side bit/basis lists.
    """
    if rate <= 0:
        return qubit_data, 0
    surviving = []
    dropped = 0
    for q in qubit_data:
        if random.random() < rate:
            dropped += 1
        else:
            surviving.append(q)
    print(f"[Packet Loss] Dropped {dropped}/{len(qubit_data)} qubits.")
    return surviving, dropped


def _apply_eve(qubit_data):
    """
    Eavesdropping (Eve): Intercept-Resend Attack.
    Eve randomly measures each qubit in a random basis (0=Rect, 1=Diag),
    then re-encodes in her measured basis — disturbing the state probabilistically.
    This produces QBER ≈ 25% on the sifted key.
    """
    tapped = []
    intercepts = 0
    for q in qubit_data:
        entry = dict(q)
        eve_basis = random.randint(0, 1)

        if eve_basis != q['basis']:
            # Eve measured in wrong basis — 50% chance of getting the wrong bit
            # She re-encodes whatever she got, corrupting Alice's original state
            entry['bit'] = random.randint(0, 1)
            intercepts += 1

        tapped.append(entry)
    print(f"[Eve] Intercepted and re-encoded. Basis mismatches: {intercepts}/{len(qubit_data)}")
    return tapped


def _build_circuits_from_qubit_data(qubit_data):
    """Reconstruct QuantumCircuits from serialised qubit_data dicts."""
    received_qubits = []
    for q in qubit_data:
        qc = QuantumCircuit(1)
        bit   = q['bit']
        basis = q['basis']
        if basis == 0:  # Rectilinear
            if bit == 1:
                qc.x(0)
        else:  # Diagonal
            if bit == 0:
                qc.h(0)
            else:
                qc.x(0)
                qc.h(0)
        received_qubits.append(qc)
    return received_qubits


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template('backend_landing.html')


@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify({"local_ip": get_local_ip()})


# ─── Noise Configuration ────────────────────────────────────────────────────

@app.route('/api/set_noise_config', methods=['POST'])
def set_noise_config():
    """
    Frontend sends the current noise settings here.
    Accepted keys (all optional — only provided keys are updated):
        eve_active           : bool
        network_noise_rate   : float 0-1
        channel_noise_rate   : float 0-1
        t1_us                : float (microseconds)
        t2_us                : float (microseconds)
        packet_loss_rate     : float 0-1
    """
    data = request.json or {}
    for key in noise_config:
        if key in data:
            noise_config[key] = data[key]
    print(f"[Noise Config] Updated: {noise_config}")
    return jsonify({"status": "ok", "noise_config": noise_config})


@app.route('/api/get_noise_config', methods=['GET'])
def get_noise_config():
    """Return current noise configuration to the frontend."""
    return jsonify(noise_config)


# ─── Alice: Generate Keys ────────────────────────────────────────────────────

@app.route('/api/generate_keys', methods=['POST'])
def generate_keys():
    data   = request.json
    length = int(data.get('length', 5))

    alice.prepare_quantum_states(length)
    alice.shared_key = None  # CLEAR PREVIOUS KEY

    raw_bits = alice.raw_bits
    bases    = alice.bases

    symbols = []
    for i in range(length):
        if bases[i] == 0:
            symbols.append("|0⟩" if raw_bits[i] == 0 else "|1⟩")
        else:
            symbols.append("|+⟩" if raw_bits[i] == 0 else "|-⟩")

    print(f"[Backend] Generated {length} qubits. Symbols: {symbols}")

    return jsonify({
        "aliceBits":    raw_bits,
        "aliceBases":   bases,
        "qubitSymbols": symbols,
    })


# ─── Quantum Channel: Get Data (with packet loss + network noise + eve) ─────

@app.route('/api/get_quantum_data', methods=['GET'])
def get_quantum_data():
    """
    Alice exposes her qubit stream.
    Packet loss and network noise (and Eve) are applied here — before Bob sees anything.
    """
    if not alice.encoded_qubits:
        return jsonify({"error": "No keys generated yet"}), 404

    qubit_data = []
    for bit, basis in zip(alice.raw_bits, alice.bases):
        qubit_data.append({"bit": int(bit), "basis": int(basis)})

    original_count = len(qubit_data)

    # 1. Eve intercepts (if active)
    if noise_config.get("eve_active", False):
        qubit_data = _apply_eve(qubit_data)

    # 2. Packet loss
    qubit_data, dropped = _apply_packet_loss(qubit_data, noise_config.get("packet_loss_rate", 0))

    # 3. Network noise (bit-level corruption in the classical description)
    qubit_data, flips = _apply_network_noise(qubit_data, noise_config.get("network_noise_rate", 0))

    return jsonify({
        "qubit_data":     qubit_data,
        "original_count": original_count,
        "dropped":        dropped,
        "flips":          flips,
        "eve_active":     noise_config.get("eve_active", False),
    })


# ─── Bob: Measure ────────────────────────────────────────────────────────────

@app.route('/api/bob_measure', methods=['POST'])
def bob_measure():
    data       = request.json
    qubit_data = data.get('qubit_data')

    noise_stats = {"dropped": 0, "flips": 0}

    if not qubit_data:
        # Fallback for local mode — get data directly from global alice
        if alice.encoded_qubits:
            # Build qubit_data list first so we can apply noise uniformly
            qubit_data = [{"bit": int(b), "basis": int(bs)}
                          for b, bs in zip(alice.raw_bits, alice.bases)]
        else:
            return jsonify({"error": "No qubit data received and no local state"}), 400

    original_count = len(qubit_data)

    # Apply noise pipeline
    if noise_config.get("eve_active", False):
        qubit_data = _apply_eve(qubit_data)

    qubit_data, dropped = _apply_packet_loss(qubit_data, noise_config.get("packet_loss_rate", 0))
    qubit_data, flips   = _apply_network_noise(qubit_data, noise_config.get("network_noise_rate", 0))

    noise_stats = {"dropped": dropped, "flips": flips,
                   "original_count": original_count}

    received_qubits = _build_circuits_from_qubit_data(qubit_data)
    bob_bases, measured_bits = bob.measure_qubits(received_qubits, noise_config=noise_config)

    return jsonify({
        "bobBases":       bob_bases,
        "measuredBits":   measured_bits,
        "noiseStats":     noise_stats,
    })


# ─── Sifting ─────────────────────────────────────────────────────────────────

@app.route('/api/sift_keys', methods=['POST'])
def sift_keys():
    data        = request.json
    alice_bases = data.get('aliceBases')
    bob_bases   = data.get('bobBases')
    bob_bits    = data.get('bobBits')

    if not alice_bases:
        if alice.bases:
            alice_bases = alice.bases
        else:
            return jsonify({"error": "Missing Alice bases and no local state"}), 400

    if not (bob_bases and bob_bits):
        return jsonify({"error": "Missing Bob data for sifting"}), 400

    # Handle mismatched lengths caused by packet loss:
    # Only compare up to min(len(alice_bases), len(bob_bases))
    min_len = min(len(alice_bases), len(bob_bases))
    alice_bases_trimmed = alice_bases[:min_len]
    bob_bases_trimmed   = bob_bases[:min_len]
    bob_bits_trimmed    = bob_bits[:min_len]

    sifted_key, matches = bob.sift_keys(alice_bases_trimmed, bob_bases_trimmed, bob_bits_trimmed)

    return jsonify({
        "siftedKey": sifted_key,
        "matches":   matches,
    })


# ─── Verification ────────────────────────────────────────────────────────────

@app.route('/api/verify_key', methods=['POST'])
def verify_key():
    data    = request.json
    matches = data.get('matches')

    if not matches:
        return jsonify({"error": "Missing matches"}), 400

    if not alice.raw_bits:
        return jsonify({"error": "Alice has no bits"}), 400

    alice_key = [alice.raw_bits[i] for i in matches if i < len(alice.raw_bits)]

    return jsonify({"aliceKey": alice_key})


@app.route('/api/sample_key', methods=['POST'])
def sample_key():
    data       = request.json
    sifted_key = data.get('siftedKey')

    if not sifted_key:
        return jsonify({"error": "Missing sifted key"}), 400

    indices, bits, remaining = bob.sample_for_verification(sifted_key)

    return jsonify({
        "sampleIndices": indices,
        "sampleBits":    bits,
        "remainingKey":  remaining,
    })


@app.route('/api/compare_sample', methods=['POST'])
def compare_sample():
    data             = request.json
    sample_indices   = data.get('sampleIndices', [])
    bob_sample_bits  = data.get('bobSampleBits', [])
    matches          = data.get('originalMatches')

    if not matches:
        return jsonify({"error": "Missing original match indices"}), 400

    if not alice.raw_bits:
        print("[Backend Error] compare_sample called but alice.raw_bits is None!")
        return jsonify({"error": "Alice has no raw bits. Did she generate them?"}), 400

    # Alice's sifted key — only use indices within bounds
    alice_sifted = [alice.raw_bits[i] for i in matches if i < len(alice.raw_bits)]

    alice_sample_bits = []
    try:
        alice_sample_bits = [alice_sifted[i] for i in sample_indices]
    except IndexError as e:
        print(f"[Backend Error] Index out of bounds in sample: {e}. Sifted len: {len(alice_sifted)}")
        return jsonify({"error": "Invalid sample indices"}), 400

    # Compare
    error_count = 0
    total = len(sample_indices)

    for a, b in zip(alice_sample_bits, bob_sample_bits):
        if a != b:
            error_count += 1

    qber = (error_count / total) * 100 if total > 0 else 0

    if qber == 0:
        alice_remaining = [alice_sifted[i] for i in range(len(alice_sifted)) if i not in sample_indices]
        alice.shared_key = alice_remaining
        print(f"[Alice] Verified Phase: Key established: {len(alice.shared_key)} bits.")
    else:
        print(f"[Alice] Verification failed. QBER: {qber:.2f}% "
              f"({'Eve detected!' if noise_config.get('eve_active') else 'Noise interference'})")

    return jsonify({
        "aliceSampleBits": alice_sample_bits,
        "errorCount":      error_count,
        "qber":            qber,
        "verified":        qber == 0,
        "noiseConfig":     noise_config,
    })


# ─── Alice Key Status ────────────────────────────────────────────────────────

@app.route('/api/alice/key_status', methods=['GET'])
def get_alice_key():
    if alice.shared_key:
        return jsonify({"sharedKey": alice.shared_key})
    return jsonify({"sharedKey": None})


@app.route('/api/finalize_key', methods=['POST'])
def finalize_key():
    data       = request.json
    sifted_key = data.get('siftedKey')

    if not sifted_key:
        return jsonify({"error": "Missing data for key finalization"}), 400

    final_key = bob.finalize_key(sifted_key)

    return jsonify({"finalKey": final_key})


# ─── Network Mode: Peer-to-Peer ──────────────────────────────────────────────

@app.route('/api/fetch_from_peer', methods=['POST'])
def fetch_from_peer():
    """Bob calls this to tell his backend to go fetch data from Alice's IP."""
    import requests
    data    = request.json
    peer_ip = data.get('peer_ip')

    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400

    try:
        target_url = f"http://{peer_ip}:5000/api/get_quantum_data"
        print(f"[Bob] Fetching from {target_url}...")
        resp = requests.get(target_url, timeout=5)

        if resp.status_code != 200:
            return jsonify({"error": f"Failed to fetch from Alice: {resp.text}"}), 500

        alice_data = resp.json()
        qubit_data = alice_data.get('qubit_data')
        noise_stats = {
            "dropped":        alice_data.get("dropped", 0),
            "flips":          alice_data.get("flips", 0),
            "original_count": alice_data.get("original_count", len(qubit_data)),
        }

        # Bob measures with channel noise config
        received_qubits = _build_circuits_from_qubit_data(qubit_data)
        bob_bases, measured_bits = bob.measure_qubits(received_qubits, noise_config=noise_config)

        return jsonify({
            "status":       "success",
            "message":      f"Received and measured {len(measured_bits)} qubits",
            "bobBases":     bob_bases,
            "measuredBits": measured_bits,
            "noiseStats":   noise_stats,
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
    data    = request.json
    peer_ip = data.get('peer_ip')

    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400

    try:
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
    data             = request.json
    peer_ip          = data.get('peer_ip')
    sifted_key       = data.get('sifted_key')
    original_matches = data.get('original_matches')

    if not (peer_ip and sifted_key and original_matches):
        return jsonify({"error": "Missing parameters for network verification"}), 400

    indices, bits, remaining = bob.sample_for_verification(sifted_key)

    try:
        target_url = f"http://{peer_ip}:5000/api/compare_sample"
        payload = {
            "sampleIndices":  indices,
            "bobSampleBits":  bits,
            "originalMatches": original_matches,
        }
        print(f"[Bob] Sending sample to Alice for verification at {target_url}...")
        resp = requests.post(target_url, json=payload, timeout=5)

        if resp.status_code != 200:
            return jsonify({"error": f"Verification failed at Alice: {resp.text}"}), 500

        alice_res = resp.json()

        return jsonify({
            "sampleIndices": indices,
            "sampleBits":    bits,
            "remainingKey":  remaining,
            "errorCount":    alice_res.get('errorCount'),
            "qber":          alice_res.get('qber'),
            "verified":      alice_res.get('verified'),
            "noiseConfig":   alice_res.get('noiseConfig'),
        })

    except Exception as e:
        print(f"Error during network verification: {e}")
        return jsonify({"error": str(e)}), 500


# ─── Messaging (Encrypt/Decrypt) ─────────────────────────────────────────────

@app.route('/api/encrypt_message', methods=['POST'])
def encrypt_message():
    data    = request.json
    message = data.get('message', '')
    key_str = data.get('key', '')

    if not message or not key_str:
        return jsonify({"error": "Message and key required"}), 400

    msg_bytes = message.encode('utf-8')
    msg_bits  = []
    for byte in msg_bytes:
        msg_bits.extend([int(b) for b in format(byte, '08b')])

    encrypted_bits = []
    key_len = len(key_str)
    for i, bit in enumerate(msg_bits):
        k_bit = int(key_str[i % key_len])
        encrypted_bits.append(bit ^ k_bit)

    while len(encrypted_bits) % 4 != 0:
        encrypted_bits.insert(0, 0)

    enc_int     = int(''.join(map(str, encrypted_bits)), 2)
    hex_len     = (len(encrypted_bits) + 3) // 4
    encrypted_hex = f"{enc_int:0{hex_len}x}"

    if not hasattr(alice, 'outbox'):
        alice.outbox = []
    alice.outbox.append(encrypted_hex)
    print(f"[Backend] Message stored in outbox. Total: {len(alice.outbox)}")

    return jsonify({"encrypted_hex": encrypted_hex})


@app.route('/api/get_message', methods=['GET'])
def get_message():
    """Alice exposes her outbox via this endpoint."""
    if not hasattr(alice, 'outbox') or len(alice.outbox) == 0:
        return jsonify({"messages": []})
    return jsonify({"messages": alice.outbox})


@app.route('/api/fetch_message_from_peer', methods=['POST'])
def fetch_message_from_peer():
    """Bob asks his backend to poll Alice's backend for messages."""
    import requests
    data    = request.json
    peer_ip = data.get('peer_ip')

    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400

    try:
        target_url = f"http://{peer_ip}:5000/api/get_message"
        print(f"[Bob] Polling for messages from {target_url}...")
        resp = requests.get(target_url, timeout=5)

        if resp.status_code != 200:
            return jsonify({"error": f"Failed to fetch messages from peer: {resp.text}"}), 500

        data     = resp.json()
        messages = data.get('messages', [])
        return jsonify({"messages": messages})

    except Exception as e:
        print(f"Error fetching messages from peer: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/decrypt_message', methods=['POST'])
def decrypt_message():
    data          = request.json
    encrypted_hex = data.get('encrypted_hex', '')
    key_str       = data.get('key', '')

    if not encrypted_hex or not key_str:
        return jsonify({"error": "Encrypted message and key required"}), 400

    hex_len          = len(encrypted_hex)
    enc_int          = int(encrypted_hex, 16)
    encrypted_bitsStr = format(enc_int, f'0{hex_len*4}b')
    encrypted_bits   = [int(b) for b in encrypted_bitsStr]

    decrypted_bits = []
    key_len = len(key_str)
    for i, bit in enumerate(encrypted_bits):
        k_bit = int(key_str[i % key_len]) if key_len > 0 else 0
        decrypted_bits.append(bit ^ k_bit)

    msg_bytes = bytearray()
    for i in range(0, len(decrypted_bits), 8):
        byte_bits = decrypted_bits[i:i+8]
        if len(byte_bits) == 8:
            msg_bytes.append(int(''.join(map(str, byte_bits)), 2))

    try:
        decrypted_message = msg_bytes.decode('utf-8').rstrip('\x00')
    except Exception:
        decrypted_message = "<decryption failed>"

    return jsonify({"decrypted_message": decrypted_message})


if __name__ == '__main__':
    print("Starting BB84 Quantum Server with Noise Simulation...")
    print(f"Noise Config: {noise_config}")
    app.run(host='0.0.0.0', port=5000, debug=True)
