
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from alice import Alice
from bob import Bob
import numpy as np
import os
import random
import socket
from qiskit import QuantumCircuit
import uuid
import time
from scipy.stats import entropy as scipy_entropy

# Set template_folder to current directory to find ui.html
app = Flask(__name__, template_folder=os.getcwd())
CORS(app)  # Enable CORS for all routes (Dev mode)

alice = Alice()
bob = Bob()

# ---------------------------------------------------------------------------
# Global noise configuration — updated by /api/set_noise_config
# ---------------------------------------------------------------------------
noise_config = {
    "interception_density": 0.0,    # 'p' - Probability [0,1] Eve intercepts each qubit
    "use_hardware_noise":  False,   # Toggles GenericBackendV2 (simulates hardware)
    "qber_sn":             0.0,     # Baseline QBER of the hardware noise (used for p_hat estimation)
    "network_noise_rate":  0.0,     # Probability of bit-flip in the JSON stream (0–1)
    "channel_noise_rate":  0.0,     # Depolarizing error rate in AerSimulator (0–1)
    "t1_us":               50.0,    # Thermal T1 in microseconds
    "t2_us":               30.0,    # Thermal T2 in microseconds
    "packet_loss_rate":    0.0,     # Probability each qubit is dropped (0–1)
    "attack_mode":         "none",  # "none" | "eavesdrop" | "mitm" | "dos"
}

# ---------------------------------------------------------------------------
# Noise & Attack API Routes
# ---------------------------------------------------------------------------

@app.route('/api/set_noise_config', methods=['POST'])
def update_noise_config():
    data = request.json or {}
    global noise_config
    noise_config.update(data)
    print(f"[Config] Updated noise_config: {data}")
    return jsonify({"status": "success", "config": noise_config})

@app.route('/api/set_attack_mode', methods=['POST'])
def update_attack_mode():
    data = request.json or {}
    mode = data.get("mode", "none")
    global noise_config
    noise_config["attack_mode"] = mode
    
    # Auto-configure based on attack mode
    if mode == "none":
        noise_config["interception_density"] = 0.0
        noise_config["network_noise_rate"]   = 0.0
        noise_config["packet_loss_rate"]     = 0.0
    elif mode == "eavesdrop":
        noise_config["interception_density"] = 0.5  # 50% tap
        noise_config["network_noise_rate"]   = 0.0
        noise_config["packet_loss_rate"]     = 0.0
    elif mode == "mitm":
        noise_config["interception_density"] = 1.0  # full intercept
        noise_config["network_noise_rate"]   = 0.2  # 20% classical flip
        noise_config["packet_loss_rate"]     = 0.0
    elif mode == "dos":
        noise_config["interception_density"] = 0.0  # irrelevant because high loss
        noise_config["network_noise_rate"]   = 0.5  # high channel noise 
        noise_config["packet_loss_rate"]     = 0.4  # 40% loss
        
    print(f"[Attack Mode] Changed to '{mode}'. Config updated automatically.")
    return jsonify({"status": "success", "config": noise_config})

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def get_local_ip():
    # Method 1: UDP socket trick (most reliable on open networks)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith('127.'):
            return ip
    except Exception:
        pass

    # Method 2: getaddrinfo — scan all addresses, pick first real LAN IP
    try:
        addrs = socket.getaddrinfo(socket.gethostname(), None)
        for addr in addrs:
            ip = addr[4][0]
            if ':' not in ip and not ip.startswith('127.'):  # skip IPv6 and loopback
                return ip
    except Exception:
        pass

    # Method 3: gethostbyname
    try:
        ip = socket.gethostbyname(socket.gethostname())
        if ip and not ip.startswith('127.'):
            return ip
    except Exception:
        pass

    return '127.0.0.1'


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
    Eavesdropping (Eve): Partial Intercept-and-Resend Attack.
    Based on 'interception_density' (p). Eve randomly intercepts each qubit with probability p.
    If intercepted, she measures in a random basis and re-encodes it.
    """
    p = float(noise_config.get("interception_density", 0.0))
    if p <= 0:
        return qubit_data

    tapped = []
    intercepts = 0
    for q in qubit_data:
        entry = dict(q)
        # Does Eve intercept this specific qubit?
        if random.random() < p:
            eve_basis = random.randint(0, 1)
            # If she guesses the wrong basis, she fundamentally disturbs the qubit bit
            if eve_basis != q['basis']:
                entry['bit'] = random.randint(0, 1)
            intercepts += 1
        tapped.append(entry)
        
    print(f"[Eve] Partial Intercept-Resend (p={p:.2f}). Intercepted: {intercepts}/{len(qubit_data)}")
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


# ============================================================
# IoT Security Paper (Guitouni et al. 2024) — Key Quality Metrics
# ============================================================

def compute_key_entropy(key_bits: list) -> float:
    """
    Shannon entropy of the key bit distribution.
    Paper benchmark: 0.93 (small keys) to 1.00 (large keys).
    Formula: H = -Σ p_i * log2(p_i)
    """
    if not key_bits or len(key_bits) < 2:
        return 0.0
    arr = np.array(key_bits)
    counts = np.bincount(arr, minlength=2)
    probs = counts / len(arr)
    probs = probs[probs > 0]
    return float(-np.sum(probs * np.log2(probs)))


def compute_adjacent_correlation(key_bits: list) -> float:
    """
    Pearson correlation between adjacent bits.
    Paper benchmark: average ≈ -0.01 (ideal near zero).
    High positive correlation = predictable key = weak.
    """
    if not key_bits or len(key_bits) < 3:
        return 0.0
    arr = np.array(key_bits, dtype=float)
    std_a = np.std(arr[:-1])
    std_b = np.std(arr[1:])
    if std_a == 0 or std_b == 0:
        return 1.0 if len(set(key_bits)) == 1 else 0.0
    return float(np.corrcoef(arr[:-1], arr[1:])[0, 1])


def compute_key_efficiency(key_length: int, bits_used: int) -> float:
    """
    Protocol efficiency = useful key bits / total bits transmitted.
    Paper benchmark: average 50.00%, range 48.62%–50.75%.
    Formula (Eq. 2): E = (key_length / bits_used) * 100
    """
    if bits_used == 0:
        return 0.0
    return round((key_length / bits_used) * 100, 2)


def compute_all_key_metrics(key_bits: list, bits_used: int) -> dict:
    """Compute all 4 IoT paper metrics for a given key."""
    return {
        "entropy":     round(compute_key_entropy(key_bits), 4),
        "correlation": round(compute_adjacent_correlation(key_bits), 4),
        "efficiency":  compute_key_efficiency(len(key_bits), bits_used),
        "key_length":  len(key_bits),
        "bits_used":   bits_used,
    }


def _apply_attack_mode_preset(mode: str):
    """
    IoT paper Section 4.1 — Threats and Attack Vectors.
    Maps named attack types to noise_config parameter presets.
    """
    if mode == "eavesdrop":
        noise_config["eve_active"] = True
        noise_config["packet_loss_rate"]     = 0.0
        noise_config["network_noise_rate"]   = 0.0
    elif mode == "mitm":
        noise_config["eve_active"] = True
        noise_config["network_noise_rate"]   = 0.05
        noise_config["packet_loss_rate"]     = 0.0
    elif mode == "dos":
        noise_config["eve_active"] = False
        noise_config["packet_loss_rate"]     = 0.40
        noise_config["network_noise_rate"]   = 0.10
    elif mode == "none":
        noise_config["eve_active"] = False
        noise_config["packet_loss_rate"]     = 0.0
        noise_config["network_noise_rate"]   = 0.0


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
        interception_density : float 0-1 (p)
        use_hardware_noise   : bool
        qber_sn              : float 0-100
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


@app.route('/api/set_attack_mode', methods=['POST'])
def set_attack_mode():
    """
    IoT paper Section 4.1: Threats and Attack Vectors in IoT Networks.
    Accepts: { "mode": "none" | "eavesdrop" | "mitm" | "dos" }
    """
    data = request.json or {}
    mode = data.get("mode", "none")
    if mode not in ("none", "eavesdrop", "mitm", "dos"):
        return jsonify({"error": "Invalid mode"}), 400

    noise_config["attack_mode"] = mode
    _apply_attack_mode_preset(mode)
    print(f"[Attack Mode] Set to: {mode}. Config: {noise_config}")
    return jsonify({"status": "ok", "attack_mode": mode, "noise_config": noise_config})


@app.route('/api/key_metrics', methods=['GET'])
def get_key_metrics():
    """
    Returns IoT paper security metrics for the most recently established key.
    """
    key = alice.shared_key
    if not key:
        return jsonify({"error": "No key established yet"}), 404

    bits_used = len(alice.raw_bits) if alice.raw_bits else len(key)
    metrics = compute_all_key_metrics(key, bits_used)
    metrics["qber_sn"] = noise_config.get("qber_sn", 0.0)

    return jsonify(metrics)


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

    # 1. Eve intercepts (Partial Intercept-and-Resend p-density)
    if noise_config.get("interception_density", 0.0) > 0:
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
        "eve_active":     noise_config.get("interception_density", 0.0) > 0,
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
    if noise_config.get("interception_density", 0.0) > 0:
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
    # --- Advanced Intrusion Detection Math (Future Internet 2024 paper) ---
    # Equation: p_hat = 4 * (QBER_hat - QBER_SN)
    # We use decimals [0..1] for math
    qber_decimal = qber / 100.0
    qber_sn_decimal = float(noise_config.get("qber_sn", 0.0)) / 100.0
    
    # Calculate estimated interception density
    p_hat = 4.0 * (qber_decimal - qber_sn_decimal)
    
    # p_hat logically ranges [0, 1]. Values < 0 mean noise was lower than expected.
    # Values > 1 mean noise was exceptionally high (e.g. from network flips).
    p_hat = max(0.0, p_hat) 

    # Determine "verified" status based on math thresholds instead of pure zero
    # If p_hat is significantly above 0 (e.g. > 0.05 margin), assume Eve or severe channel noise.
    verified = (p_hat < 0.10) and (error_count == 0 or noise_config.get("use_hardware_noise", False))
    alice_remaining = None
    if verified:
        alice_remaining = [alice_sifted[i] for i in range(len(alice_sifted)) if i not in sample_indices]
        alice.shared_key = alice_remaining
        print(f"[Alice] Verified Phase: Key established: {len(alice.shared_key)} bits. (QBER: {qber:.2f}%)")
    else:
        print(f"[Alice] Verification failed. QBER: {qber:.2f}%, p_hat: {p_hat:.3f}")

    key_metrics = {}
    if verified and alice_remaining is not None:
        start_metrics = time.time()
        key_metrics = compute_all_key_metrics(alice_remaining, len(alice_sifted))
        key_metrics["execution_time_ms"] = round((time.time() - start_metrics) * 1000, 3)

    return jsonify({
        "aliceSampleBits": alice_sample_bits,
        "errorCount":      error_count,
        "qber":            qber,
        "p_hat":           p_hat,
        "qber_sn":         noise_config.get("qber_sn", 0.0),
        "verified":        verified,
        "noiseConfig":     noise_config,
        "keyMetrics":      key_metrics,
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

@app.route('/api/network/initiate', methods=['POST'])
def network_initiate():
    """
    Frontend calls this to initiate a connection to a peer.
    It tells the backend to reach out to the peer's /api/network/connect endpoint,
    passing our own IP address so the peer knows who we are.
    """
    import requests
    data = request.json or {}
    target_ip = data.get('target_ip')

    if not target_ip:
        return jsonify({"error": "Target IP required"}), 400

    local_ip = get_local_ip()
    target_url = f"http://{target_ip}:5000/api/network/connect"

    try:
        print(f"[Network] Initiating connection to {target_ip}...")
        resp = requests.post(target_url, json={"peer_ip": local_ip}, timeout=3)
        
        if resp.status_code == 200:
            global noise_config
            noise_config['connected_peer_ip'] = target_ip
            return jsonify({
                "status": "success", 
                "message": f"Successfully connected to {target_ip}",
                "peer_ip": target_ip
            })
        else:
            return jsonify({"error": f"Peer rejected connection: {resp.text}"}), 500
            
    except Exception as e:
        print(f"[Network ERROR] Failed to connect to {target_ip}: {e}")
        return jsonify({"error": f"Could not reach {target_ip}: {str(e)}"}), 500

@app.route('/api/network/connect', methods=['POST'])
def network_connect():
    """
    Called by the peer to initiate a connection.
    Bob receives this from Alice, stores her IP, and responds with success.
    """
    data = request.json or {}
    peer_ip = data.get('peer_ip')

    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400

    global noise_config
    noise_config['connected_peer_ip'] = peer_ip
    print(f"[Network] Connection established with peer: {peer_ip}")
    
    return jsonify({"status": "success", "message": f"Connected to {peer_ip}"})

@app.route('/api/network/status', methods=['GET'])
def network_status():
    """
    Frontend polls this to see if a peer has connected to us.
    """
    peer_ip = noise_config.get('connected_peer_ip', '')
    return jsonify({
        "connected": bool(peer_ip),
        "peer_ip": peer_ip
    })

@app.route('/api/network/disconnect', methods=['POST'])
def network_disconnect():
    """
    Frontend calls this to sever the connection, and optionally notifies the peer.
    """
    global noise_config
    peer_ip = noise_config.get('connected_peer_ip', '')
    noise_config['connected_peer_ip'] = ''
    
    # Notify peer if possible
    data = request.json or {}
    notify = data.get('notify_peer', True)
    if notify and peer_ip:
        try:
            import requests
            requests.post(f"http://{peer_ip}:5000/api/network/disconnect", json={"notify_peer": False}, timeout=2)
        except Exception:
            pass

    return jsonify({"status": "success", "message": "Disconnected"})

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
            "p_hat":         alice_res.get('p_hat'),
            "verified":      alice_res.get('verified'),
            "noiseConfig":   alice_res.get('noiseConfig'),
            "keyMetrics":    alice_res.get('keyMetrics'),
        })

    except Exception as e:
        print(f"Error during network verification: {e}")
        return jsonify({"error": str(e)}), 500


# ─── Messaging (Encrypt/Decrypt) ─────────────────────────────────────────────

@app.route('/api/old_encrypt_message', methods=['POST'])
def old_encrypt_message():
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


@app.route('/api/old_get_message', methods=['GET'])
def old_get_message():
    """Alice exposes her outbox via this endpoint."""
    if not hasattr(alice, 'outbox') or len(alice.outbox) == 0:
        return jsonify({"messages": []})
    return jsonify({"messages": alice.outbox})


@app.route('/api/old_fetch_message_from_peer', methods=['POST'])
def old_fetch_message_from_peer():
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


@app.route('/api/old_decrypt_message', methods=['POST'])
def old_decrypt_message():
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


# ---------------------------------------------------------------------------
# QChat New API Endpoints
# ---------------------------------------------------------------------------

chat_messages = []
shared_key_str = ""

def _xor_encrypt(plaintext, key_str):
    if not key_str:
        return "", "", "", "", ""
    msg_bytes = plaintext.encode('utf-8')
    msg_bits_arr = []
    for b in msg_bytes:
        msg_bits_arr.append(format(b, '08b'))
    msg_bits = "".join(msg_bits_arr)

    key_len = len(key_str)
    encrypted_bits = []
    for i, bit_char in enumerate(msg_bits):
        k_bit = int(key_str[i % key_len]) if key_len > 0 else 0
        encrypted_bits.append(str(int(bit_char) ^ k_bit))
    
    enc_bits_str = "".join(encrypted_bits)
    # pad to multiple of 4
    pad = (4 - len(enc_bits_str) % 4) % 4
    enc_bits_str = "0"*pad + enc_bits_str
    
    msg_hex = hex(int(msg_bits, 2))[2:].upper() if msg_bits else ""
    enc_hex = hex(int(enc_bits_str, 2))[2:].upper() if enc_bits_str else ""
    
    key_used = ""
    for i in range(len(msg_bits)):
        key_used += key_str[i % key_len] if key_len > 0 else "0"
        
    return msg_hex, msg_bits, key_used, enc_hex, enc_bits_str


def _xor_decrypt(enc_hex, key_str):
    """Decrypt a hex-encoded ciphertext using XOR with key_str."""
    if not enc_hex or not key_str:
        return ""
    try:
        hex_len = len(enc_hex)
        enc_int = int(enc_hex, 16)
        enc_bits_str = format(enc_int, f'0{hex_len * 4}b')
        enc_bits = [int(b) for b in enc_bits_str]

        key_len = len(key_str)
        decrypted_bits = []
        for i, bit in enumerate(enc_bits):
            k_bit = int(key_str[i % key_len]) if key_len > 0 else 0
            decrypted_bits.append(bit ^ k_bit)

        msg_bytes = bytearray()
        for i in range(0, len(decrypted_bits), 8):
            byte_bits = decrypted_bits[i:i + 8]
            if len(byte_bits) == 8:
                msg_bytes.append(int(''.join(map(str, byte_bits)), 2))

        return msg_bytes.decode('utf-8').rstrip('\x00')
    except Exception:
        return "<decryption failed>"


@app.route('/api/qkd/quick_generate', methods=['POST'])
def qkd_quick_generate():
    start_time = time.time()
    global shared_key_str
    data = request.json or {}
    length = int(data.get('length', 20))
    
    from randomkey import generate_masked_key
    raw_bits, alice_bases, _ = generate_masked_key(length)
    
    noisy_data = [{"bit": int(b), "basis": int(bs)} for b, bs in zip(raw_bits, alice_bases)]
    if noise_config.get("eve_active", False):
        noisy_data = _apply_eve(noisy_data)
        
    noisy_data, _ = _apply_packet_loss(noisy_data, noise_config.get("packet_loss_rate", 0))
    noisy_data, _ = _apply_network_noise(noisy_data, noise_config.get("network_noise_rate", 0))
    
    received_qubits = _build_circuits_from_qubit_data(noisy_data)
    bob_bases, measured_bits = bob.measure_qubits(received_qubits, noise_config=noise_config)
    
    sifted_bob, matches = bob.sift_keys(alice_bases, bob_bases, measured_bits)
    alice_sifted = [raw_bits[i] for i in matches]
    
    sample_size = min(len(sifted_bob)//3, 8)
    if sample_size == 0:
        sample_size = len(sifted_bob)
    alice_sample = alice_sifted[:sample_size]
    bob_sample = sifted_bob[:sample_size]
    
    errors = sum(1 for a, b in zip(alice_sample, bob_sample) if a != b)
    qber = (errors / sample_size * 100) if sample_size > 0 else 0.0
    
    final_key = alice_sifted[sample_size:]
    
    shared_key_str = "".join(map(str, final_key))
    if not shared_key_str:
        shared_key_str = "0"
        
    key_metrics = compute_all_key_metrics(final_key, length)
    key_metrics["execution_time_ms"] = round((time.time() - start_time) * 1000, 3)

    return jsonify({
        "rawBits": raw_bits,
        "aliceBases": alice_bases,
        "bobBases": bob_bases,
        "measuredBits": measured_bits,
        "siftedKey": sifted_bob,
        "matches": matches,
        "finalKey": final_key,
        "keyLength": len(final_key),
        "qber": qber,
        "shared_key": shared_key_str,
        "keyMetrics": key_metrics
    })

# ─── P2P Secure Messaging Endpoints ──────────────────────────────────────────

@app.route('/api/encrypt_message', methods=['POST'])
def encrypt_message():
    data = request.json or {}
    message = data.get('message', '')
    key = data.get('key', '')
    
    if not message or not key:
        return jsonify({"error": "Message and key required"}), 400
        
    msg_hex, msg_bits, key_used, enc_hex, enc_bits_str = _xor_encrypt(message, key)
    
    # Store locally for peer to fetch
    global chat_messages
    chat_messages.append(enc_hex) 
    
    return jsonify({
        "encrypted_hex": enc_hex, 
        "msg_bits": msg_bits, 
        "encrypted_bits": enc_bits_str
    })

@app.route('/api/decrypt_message', methods=['POST'])
def decrypt_message():
    data = request.json or {}
    enc_hex = data.get('encrypted_hex', '')
    key = data.get('key', '')
    
    if not enc_hex or not key:
        return jsonify({"error": "Encrypted hex and key required"}), 400
        
    plaintext = _xor_decrypt(enc_hex, key)
    return jsonify({"decrypted_message": plaintext})

@app.route('/api/get_message', methods=['GET'])
def get_message():
    # Returns Alice's stored encrypted messages
    return jsonify({"messages": chat_messages})

@app.route('/api/fetch_message_from_peer', methods=['POST'])
def fetch_message_from_peer():
    import requests
    data = request.json or {}
    peer_ip = data.get('peer_ip')
    
    if not peer_ip:
        return jsonify({"error": "peer_ip required"}), 400
        
    try:
        resp = requests.get(f"http://{peer_ip}:5000/api/get_message", timeout=3)
        if resp.status_code == 200:
            return jsonify(resp.json())
        else:
            return jsonify({"error": "Failed to fetch from peer"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/send', methods=['POST'])
def chat_send():
    import requests as req_lib
    data = request.json or {}
    message = data.get('message', '')
    sender = data.get('sender', 'unknown')
    key_str = data.get('key', '')
    
    if not message:
        return jsonify({"error": "Message is required"}), 400
    if not key_str:
        return jsonify({"error": "No quantum key established yet. Generate keys first."}), 400
    
    msg_hex, msg_bits, key_used, enc_hex, enc_bits_str = _xor_encrypt(message, key_str)
    
    entry = {
        "id": str(uuid.uuid4()),
        "sender": sender,
        "plaintext": message,
        "encrypted_hex": enc_hex,
        "msg_hex": msg_hex,
        "msg_bits": msg_bits,
        "key_used": key_used,
        "encrypted_bits": enc_bits_str,
        "timestamp": int(time.time())
    }
    chat_messages.append(entry)
    
    # Push to the connected peer
    peer_ip = noise_config.get('connected_peer_ip', '')
    if peer_ip:
        try:
            peer_entry = dict(entry)
            peer_entry['sender'] = sender  # keep original sender tag
            # DO NOT send plaintext over the wire!
            peer_entry['plaintext'] = "" 
            req_lib.post(f"http://{peer_ip}:5000/api/chat/receive", json=peer_entry, timeout=3)
            print(f"[Chat] Pushed encrypted message to peer {peer_ip}")
        except Exception as e:
            print(f"[Chat] Failed to push to peer: {e}")
    
    return jsonify({"success": True, "entry": entry})

@app.route('/api/chat/messages', methods=['POST'])
def chat_messages_get():
    data = request.json or {}
    key_str = data.get('key', '')
    
    processed = []
    for msg in chat_messages:
        m = dict(msg)
        # If we received it from a peer, plaintext is stripped over the wire
        if not m.get('plaintext') and m.get('encrypted_hex') and key_str:
            m['plaintext'] = _xor_decrypt(m['encrypted_hex'], key_str)
        processed.append(m)
        
    return jsonify({"messages": processed})

@app.route('/api/eve/intercept', methods=['GET'])
def eve_intercept():
    eve_msgs = [{
        "id": m["id"],
        "sender": m["sender"],
        "encrypted_hex": m["encrypted_hex"],
        "timestamp": m["timestamp"]
    } for m in chat_messages]
    return jsonify({"messages": eve_msgs})

@app.route('/api/chat/clear', methods=['POST'])
def chat_clear():
    global chat_messages, shared_key_str
    chat_messages = []
    shared_key_str = ""
    return jsonify({"success": True})


@app.route('/api/qkd/p2p_generate', methods=['POST'])
def qkd_p2p_generate():
    """
    True distributed BB84 between two laptops.
    Alice generates qubits locally, Bob (on another machine) measures them
    over the network. Sifting and QBER happen on Alice's side (she has both).
    Final key is then synced to Bob.

    Request body: { "bob_ip": "172.x.x.x", "length": 20 }
    """
    import requests as req_lib
    global shared_key_str

    data     = request.json or {}
    bob_ip   = data.get('bob_ip')
    length   = int(data.get('length', 20))
    alice_ip = get_local_ip()

    if not bob_ip:
        return jsonify({"error": "bob_ip is required"}), 400

    # ── Step 1: Alice generates qubits locally ───────────────────────────────
    from randomkey import generate_masked_key
    raw_bits, alice_bases, _ = generate_masked_key(length)
    alice.raw_bits = list(raw_bits)
    alice.bases    = list(alice_bases)
    alice.encoded_qubits = [True] * length   # mark as prepared
    alice.shared_key = None
    print(f"[Alice] Generated {length} qubits. Bases: {alice_bases[:8]}...")

    # ── Step 2: Tell Bob to fetch Alice's qubits and measure them ────────────
    try:
        bob_url = f"http://{bob_ip}:5000/api/fetch_from_peer"
        print(f"[Alice] Instructing Bob ({bob_ip}) to fetch qubits from {alice_ip}...")
        resp = req_lib.post(bob_url, json={"peer_ip": alice_ip}, timeout=10)
        if resp.status_code != 200:
            return jsonify({"error": f"Bob failed to fetch qubits: {resp.text}"}), 500
        bob_result   = resp.json()
        bob_bases    = bob_result.get("bobBases", [])
        measured_bits = bob_result.get("measuredBits", [])
        noise_stats  = bob_result.get("noiseStats", {})
        print(f"[Bob via network] Measured {len(measured_bits)} qubits. Bases: {bob_bases[:8]}...")
    except Exception as e:
        return jsonify({"error": f"Could not reach Bob at {bob_ip}: {str(e)}"}), 500

    # ── Step 3: Sifting — compare bases, keep matching positions ────────────
    min_len = min(len(alice_bases), len(bob_bases))
    alice_bases_t = list(alice_bases)[:min_len]
    bob_bases_t   = bob_bases[:min_len]
    raw_bits_t    = list(raw_bits)[:min_len]
    meas_bits_t   = measured_bits[:min_len]

    sifted_alice = []
    sifted_bob   = []
    matches      = []
    for i in range(min_len):
        if alice_bases_t[i] == bob_bases_t[i]:
            sifted_alice.append(int(raw_bits_t[i]))
            sifted_bob.append(int(meas_bits_t[i]))
            matches.append(i)

    print(f"[Sifting] {len(matches)} matching positions out of {min_len}")

    # ── Step 4: QBER — sample a portion and count errors ────────────────────
    sample_size = max(1, min(len(sifted_bob) // 3, 8))
    alice_sample = sifted_alice[:sample_size]
    bob_sample   = sifted_bob[:sample_size]
    errors = sum(1 for a, b in zip(alice_sample, bob_sample) if a != b)
    qber   = (errors / sample_size * 100) if sample_size > 0 else 0.0
    print(f"[QBER] {errors}/{sample_size} errors = {qber:.1f}%")

    # ── Step 5: Finalize key (remove sample bits used for QBER) ─────────────
    final_key = sifted_alice[sample_size:]
    shared_key_str = "".join(map(str, final_key))
    if not shared_key_str:
        shared_key_str = "0"
    alice.shared_key = final_key
    print(f"[Alice] Final key established: {len(final_key)} bits")

    # ── Step 6: Push final key to Bob's backend ──────────────────────────────
    try:
        sync_url = f"http://{bob_ip}:5000/api/qkd/sync_key"
        req_lib.post(sync_url, json={"shared_key": shared_key_str}, timeout=5)
        print(f"[Alice] Synced key to Bob at {sync_url}")
    except Exception as e:
        print(f"[Warning] Could not sync key to Bob: {e}")

    return jsonify({
        "rawBits":      list(raw_bits),
        "aliceBases":   list(alice_bases),
        "bobBases":     bob_bases,
        "measuredBits": measured_bits,
        "siftedKey":    sifted_bob,
        "matches":      matches,
        "finalKey":     final_key,
        "keyLength":    len(final_key),
        "qber":         qber,
        "shared_key":   shared_key_str,
        "noiseStats":   noise_stats,
        "aliceIP":      alice_ip,
        "bobIP":        bob_ip,
    })


@app.route('/api/qkd/sync_key', methods=['POST'])
def qkd_sync_key():
    """Alice pushes her shared key to Bob's backend over WiFi."""
    global shared_key_str
    data = request.json or {}
    key = data.get('shared_key', '')
    if not key:
        return jsonify({"error": "No key provided"}), 400
    shared_key_str = key
    print(f"[Bob] Received synced quantum key: {len(key)} bits | preview: {key[:10]}...")
    return jsonify({"success": True, "key_length": len(key)})


@app.route('/api/chat/receive', methods=['POST'])
def chat_receive():
    """Bob receives a message pushed directly from Alice's machine."""
    entry = request.json or {}
    if not entry.get('id'):
        return jsonify({"error": "Invalid message entry — missing id"}), 400
    # Deduplicate by message id
    existing_ids = {m['id'] for m in chat_messages}
    if entry['id'] not in existing_ids:
        chat_messages.append(entry)
        print(f"[Bob] Received message from {entry.get('sender')}: {entry.get('encrypted_hex')}")
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# Recursive BB84 — Biased Basis Protocol
# ---------------------------------------------------------------------------

from recursive_session import RecursiveSession
recursive_session = RecursiveSession()


@app.route('/api/recursive/status', methods=['GET'])
def recursive_status():
    """Returns the current recursive session state."""
    return jsonify(recursive_session.to_status_dict())


@app.route('/api/recursive/plant_seed', methods=['POST'])
def recursive_plant_seed():
    """
    Store the current alice.shared_key (or a provided key list) as K_0.
    Called once after a successful standard 50/50 BB84 run.
    """
    data = request.json or {}
    key_bits = data.get('key_bits')

    # If no explicit key provided, fall back to alice's last shared key
    if not key_bits:
        key_bits = alice.shared_key

    if not key_bits:
        return jsonify({"error": "No key available. Run standard BB84 first."}), 400

    key_list = [int(b) for b in key_bits]
    recursive_session.plant_seed(key_list)

    return jsonify({
        "status":     "ok",
        "round_num":  recursive_session.round_num,
        "key_length": recursive_session.key_length,
        "bias":       round(recursive_session.get_bias(), 4),
    })


@app.route('/api/recursive/send_message', methods=['POST'])
def recursive_send_message():
    """
    Core Recursive BB84 route. Per-message lifecycle:
      1. Derive bias from K_{n-1} and purge it from RAM
      2. Run full biased BB84  →  K_n
      3. XOR-encrypt message with K_n
      4. Store K_n as the new seed (it enters RAM here)
      5. Return full audit trail for the Activity Log
    """
    start_time = time.time()
    data    = request.json or {}
    message = data.get('message', '')
    length  = int(data.get('length', 40))

    if not message:
        return jsonify({"error": "Message is required"}), 400

    if not recursive_session.has_seed:
        return jsonify({"error": "No seed key. Plant a seed from a completed BB84 run first."}), 400

    round_num_before = recursive_session.round_num
    bias_used        = recursive_session.get_bias()   # peek without purging yet

    # ── Step 1: Derive bias, fetch seed, purge old key ───────────────────────
    seed_bits = recursive_session.get_seed_and_purge()   # K_{n-1} leaves RAM here
    # (seed_bits is a local variable; original list is zeroed inside RecursiveSession)

    # ── Step 2: Generate biased BB84 key ─────────────────────────────────────
    from randomkey import generate_biased_key
    raw_bits, alice_bases, _, confirmed_bias = generate_biased_key(length, seed_bits)

    # ── Step 3: Noise pipeline ────────────────────────────────────────────────
    noisy_data = [{"bit": int(b), "basis": int(bs)} for b, bs in zip(raw_bits, alice_bases)]

    if noise_config.get("interception_density", 0.0) > 0:
        noisy_data = _apply_eve(noisy_data)

    noisy_data, dropped = _apply_packet_loss(noisy_data, noise_config.get("packet_loss_rate", 0))
    noisy_data, flips   = _apply_network_noise(noisy_data, noise_config.get("network_noise_rate", 0))

    received_qubits = _build_circuits_from_qubit_data(noisy_data)
    bob_bases, measured_bits = bob.measure_qubits(received_qubits, noise_config=noise_config)

    # ── Step 4: Trim to matching length (packet loss) ─────────────────────────
    min_len          = min(len(alice_bases), len(bob_bases))
    alice_bases_t    = alice_bases[:min_len]
    raw_bits_t       = raw_bits[:min_len]
    bob_bases_t      = bob_bases[:min_len]
    measured_bits_t  = measured_bits[:min_len]

    # ── Step 5: Sifting ───────────────────────────────────────────────────────
    sifted_alice = []
    sifted_bob   = []
    matches      = []
    for i in range(min_len):
        if alice_bases_t[i] == bob_bases_t[i]:
            sifted_alice.append(int(raw_bits_t[i]))
            sifted_bob.append(int(measured_bits_t[i]))
            matches.append(i)

    if not sifted_alice:
        # Replant seed from seed_bits so user can retry
        recursive_session.plant_seed(seed_bits)
        return jsonify({"error": "Sifting yielded 0 bits. Try again or reduce packet loss."}), 400

    # ── Step 6: QBER & Verification ───────────────────────────────────────────
    sample_size  = max(1, min(len(sifted_bob) // 3, 8))
    alice_sample = sifted_alice[:sample_size]
    bob_sample   = sifted_bob[:sample_size]
    errors       = sum(1 for a, b in zip(alice_sample, bob_sample) if a != b)
    qber         = (errors / sample_size * 100) if sample_size > 0 else 0.0

    qber_decimal = qber / 100.0
    qber_sn_decimal = float(noise_config.get("qber_sn", 0.0)) / 100.0
    p_hat = max(0.0, 4.0 * (qber_decimal - qber_sn_decimal))
    
    verified = (p_hat < 0.10) and (errors == 0)

    if not verified:
        # Restore the seed so the user can try sending again once channel is secure
        recursive_session.plant_seed(seed_bits)
        return jsonify({
            "error": f"Security Alert! Eve detected. QBER: {qber:.1f}%, Est. Interception: {p_hat:.2f}. Message aborted."
        }), 400

    # ── Step 7: Finalize key K_n ──────────────────────────────────────────────
    final_key = sifted_alice[sample_size:]
    if not final_key:
        final_key = sifted_alice   # fallback: very short key

    key_str   = "".join(map(str, final_key))
    key_metrics = compute_all_key_metrics(final_key, length)

    # ── Step 8: Encrypt message with K_n ─────────────────────────────────────
    msg_hex, msg_bits, key_used, enc_hex, enc_bits_str = _xor_encrypt(message, key_str)

    # ── Step 9: Store K_n as the NEW seed (K_{n-1} already purged) ───────────
    recursive_session.plant_seed(final_key)

    execution_ms = round((time.time() - start_time) * 1000, 2)

    # Build basis distribution summary for the activity log
    total_bases = len(alice_bases)
    ones_count  = sum(alice_bases)
    basis_dist  = {
        "total":     total_bases,
        "diagonal":  ones_count,
        "rect":      total_bases - ones_count,
        "pct_diag":  round(ones_count / total_bases * 100, 1) if total_bases > 0 else 0,
    }

    # ── Step 10: Store message in chat feed ───────────────────────────────────
    sender = data.get("sender", "alice")
    chat_entry = {
        "id":            str(uuid.uuid4()),
        "sender":        sender,
        "plaintext":     message,
        "encrypted_hex": enc_hex,
        "msg_bits":      msg_bits[:80] if msg_bits else "",
        "key_used":      key_str[:40] if key_str else "",
        "encrypted_bits": enc_bits_str[:80] if enc_bits_str else "",
        "timestamp":     int(time.time()),
    }
    chat_messages.append(chat_entry)

    # Push to connected peer (no plaintext over the wire)
    peer_ip = noise_config.get("connected_peer_ip", "")
    if peer_ip:
        try:
            import requests as req_lib
            peer_entry = dict(chat_entry)
            peer_entry["plaintext"] = ""
            req_lib.post(f"http://{peer_ip}:5000/api/chat/receive", json=peer_entry, timeout=3)
        except Exception:
            pass

    return jsonify({
        # Protocol metadata
        "round_num":      recursive_session.round_num,
        "round_before":   round_num_before,
        "bias_used":      round(bias_used, 4),
        "confirmed_bias": round(confirmed_bias, 4),
        # Raw BB84 data (for the Activity Log)
        "raw_bits":       list(raw_bits),
        "alice_bases":    list(alice_bases),
        "bob_bases":      bob_bases,
        "measured_bits":  measured_bits,
        "sifted_length":  len(sifted_alice),
        "matches":        matches,
        "basis_dist":     basis_dist,
        # Quality
        "qber":           round(qber, 2),
        "errors":         errors,
        "sample_size":    sample_size,
        "dropped":        dropped,
        "flips":          flips,
        # Key
        "final_key":        final_key,
        "final_key_length": len(final_key),
        "key_metrics":    key_metrics,
        # Encryption
        "message":        message,
        "encrypted_hex":  enc_hex,
        "msg_bits":       msg_bits,
        "encrypted_bits": enc_bits_str,
        # Timing
        "execution_ms":   execution_ms,
    })


if __name__ == '__main__':

    print("Starting BB84 Quantum Server with Noise Simulation...")
    print(f"Noise Config: {noise_config}")
    app.run(host='0.0.0.0', port=5000, debug=True)
