# BB84 Quantum Key Distribution — Complete Project Description

> **Purpose**: This document contains the full technical description of our BB84 QKD simulation project — every file, every function, every API endpoint, every component, and the complete source code. Use this as context when asking AI assistants (GPT, Gemini, Claude) for improvements, extensions, or optimizations.

---

## PROJECT OVERVIEW

**Project Name**: BB84 Quantum Key Distribution Protocol Simulator  
**Tech Stack**:
- **Backend**: Python 3, Flask, Qiskit, Qiskit-Aer (AerSimulator with noise models), NumPy
- **Frontend**: React 18 + TypeScript, Vite, Framer Motion, Axios, Lucide Icons, React Router
- **Communication**: REST API (Flask ↔ React), P2P over LAN (HTTP between two Flask instances)

**What It Does**: Simulates the complete BB84 quantum key distribution protocol between Alice (sender) and Bob (receiver), including:
1. Quantum state preparation (Alice encodes random bits in random bases using Qiskit QuantumCircuits)
2. Quantum channel transmission (with 4 types of real-world noise simulation)
3. Bob's quantum measurement (using Qiskit AerSimulator, optionally with noise models)
4. Key sifting (discard bits where Alice & Bob used different bases)
5. QBER estimation (sample ~30% of sifted key for verification)
6. Key finalization
7. Encrypted messaging using the shared key (XOR one-time-pad)
8. Full network mode — Alice and Bob can run on separate machines on LAN

---

## ARCHITECTURE

```
bb84/
├── app.py                    # Flask REST API server (651 lines) — all endpoints
├── alice.py                  # Alice class — qubit preparation (38 lines)
├── bob.py                    # Bob class — measurement, sifting, verification (162 lines)
├── randomkey.py              # Random key + qubit encoding module (39 lines)
├── node.py                   # Base class for Alice/Bob (8 lines)
├── noise_simulator.py        # Qiskit noise model factory (122 lines)
├── requirements.txt          # Python dependencies
├── backend_landing.html      # Backend landing page
├── test_flow.py              # Local unit test
├── verify_quantum_channel.py # Qubit encoding verification
├── verify_sifting.py         # Key sifting verification
├── verify_network_sifting.py # LAN-mode sifting test
├── verify_network_error.py   # Network noise injection test
├── verify_full_flow.py       # End-to-end pipeline test
│
└── client/                   # React + TypeScript Frontend (Vite)
    └── src/
        ├── App.tsx           # Root layout with routing (86 lines)
        ├── main.tsx          # Vite entry point
        ├── index.css         # Global styles — dark theme (258 lines)
        ├── App.css           # Additional styles
        ├── context/
        │   └── ProjectContext.tsx  # React Context — global state (126 lines)
        └── components/
            ├── AlicePanel.tsx      # Alice's qubit generation UI (146 lines)
            ├── BobPanel.tsx        # Bob's measurement/sifting/verification (336 lines)
            ├── NoisePanel.tsx      # Noise simulation controls (341 lines)
            ├── Messaging.tsx       # Encrypted messaging (139 lines)
            ├── ConnectionPanel.tsx # LAN peer IP configuration (57 lines)
            ├── Header.tsx          # App header with connection status (45 lines)
            ├── LogTerminal.tsx     # Real-time log display (35 lines)
            └── QuantumOrb.tsx      # Animated background orb (52 lines)
```

---

## COMPLETE SOURCE CODE

---

### FILE: `node.py` — Base Class

```python
class Node:
    def __init__(self, name):
        self.name = name

    def log(self, message):
        print(f"[{self.name}] {message}")
```

---

### FILE: `randomkey.py` — Random Key Generation + Qubit Encoding

```python
import secrets
from qiskit import QuantumCircuit

def generate_masked_key(length):
    # 1. Generate cryptographically secure random bits and bases
    # using secrets module
    alice_bits = [secrets.choice([0, 1]) for _ in range(length)]
    alice_bases = [secrets.choice([0, 1]) for _ in range(length)] # 0=Rectilinear, 1=Diagonal

    # 2. No Special Pattern Mask (Standard BB84)
    # The "masked" bits are just the Alice bits in this standard version
    masked_bits = alice_bits

    encoded_qubits = []
    
    for i in range(length):
        qc = QuantumCircuit(1, 1)
        # 3. Encode based on masked bit and chosen basis
        if alice_bases[i] == 0: # Rectilinear basis
            if masked_bits[i] == 1:
                qc.x(0) # Pauli-X gate
        else: # Diagonal basis
            if masked_bits[i] == 0:
                qc.h(0) # Hadamard gate
            else:
                qc.x(0)
                qc.h(0)
        
        encoded_qubits.append(qc)
        
    return alice_bits, alice_bases, encoded_qubits
```

**Encoding Map:**
| Basis | Bit=0 | Bit=1 |
|-------|-------|-------|
| Rectilinear (0) | `|0⟩` (no gate) | `|1⟩` (X gate) |
| Diagonal (1) | `|+⟩` (H gate) | `|-⟩` (X then H) |

---

### FILE: `alice.py` — Alice Class (Qubit Sender)

```python
import randomkey
from node import Node

class Alice(Node):
    def __init__(self):
        super().__init__("Alice")
        print("[DEBUG] Alice Initialized with shared_key field")
        self.raw_bits = None
        self.bases = None
        self.encoded_qubits = None
        self.shared_key = None

    def prepare_quantum_states(self, length):
        self.log(f"Generating {length} bits (Standard BB84)...")
        
        # Call the existing module to do the heavy lifting
        self.raw_bits, self.bases, self.encoded_qubits = randomkey.generate_masked_key(length)
        
        self.log(f"Generated {len(self.raw_bits)} raw bits.")
        self.log(f"Encoded {len(self.encoded_qubits)} qubits.")
        return self.encoded_qubits
```

**Key Points:**
- Uses `secrets` module for cryptographically secure random number generation (not `random`)
- Stores `raw_bits`, `bases`, `encoded_qubits` as instance state
- `shared_key` is set after successful verification by Bob

---

### FILE: `bob.py` — Bob Class (Qubit Receiver, Sifter, Verifier)

```python
import secrets
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator
from node import Node
from noise_simulator import build_noisy_simulator

class Bob(Node):
    def __init__(self):
        super().__init__("Bob")
        self.bob_bases = []
        self.measured_bits = []
        self.sifted_key = []
        self.simulator = AerSimulator()  # default: ideal

    def measure_qubits(self, encoded_qubits, noise_config=None):
        """
        Receives a list of QuantumCircuits (qubits) from Alice.
        Generates random bases for each qubit.
        Measures the qubits in those bases — optionally with channel noise.

        Parameters
        ----------
        encoded_qubits : list[QuantumCircuit]
        noise_config : dict | None
            Keys used:
              channel_noise_rate  (float 0-1)  depolarizing error rate
              t1_us               (float)       thermal T1 in µs (optional)
              t2_us               (float)       thermal T2 in µs (optional)

        Returns
        -------
        (bob_bases, measured_bits)
        """
        self.log(f"Received {len(encoded_qubits)} qubits to measure.")

        # Build the simulator — noisy or ideal based on noise_config
        if noise_config and noise_config.get('channel_noise_rate', 0) > 0:
            rate = float(noise_config['channel_noise_rate'])
            t1   = float(noise_config.get('t1_us', 50.0))
            t2   = float(noise_config.get('t2_us', 30.0))
            simulator = build_noisy_simulator(depolar_rate=rate, t1_us=t1, t2_us=t2)
            self.log(f"[Channel Noise] Depolarizing rate={rate:.3f}, T1={t1}µs, T2={t2}µs")
        else:
            simulator = self.simulator  # ideal

        num_qubits = len(encoded_qubits)
        # Generate random bases: 0 = Rectilinear (+), 1 = Diagonal (x)
        self.bob_bases = [secrets.choice([0, 1]) for _ in range(num_qubits)]
        self.measured_bits = []

        for i, qc in enumerate(encoded_qubits):
            measure_circuit = qc.copy()

            if self.bob_bases[i] == 1:
                measure_circuit.h(0)

            # Add measurement
            measure_circuit.measure_all()

            # Run simulation (single shot — as in physical photon detection)
            result = simulator.run(measure_circuit, shots=1, memory=True).result()
            measured_bit_str = result.get_memory()[0]

            # Parse first valid '0' or '1' character from result string
            valid_char = '0'
            for char in measured_bit_str:
                if char in ('0', '1'):
                    valid_char = char
                    break

            self.measured_bits.append(int(valid_char))

        self.log(f"Measurement complete. Bases: {self.bob_bases}, Bits: {self.measured_bits}")
        return self.bob_bases, self.measured_bits

    def sift_keys(self, alice_bases, bob_bases, measured_bits):
        """
        Compares Alice's bases and Bob's bases.
        Keeps the bits where bases match.
        """
        self.log("Sifting keys...")
        sifted_key = []
        matching_indices = []

        for i, (a_basis, b_basis) in enumerate(zip(alice_bases, bob_bases)):
            if a_basis == b_basis:
                sifted_key.append(measured_bits[i])
                matching_indices.append(i)

        self.sifted_key = sifted_key
        self.log(f"Sifting complete. Kept {len(sifted_key)} bits.")
        return sifted_key, matching_indices

    def finalize_key(self, sifted_key):
        """
        In standard BB84, this would clean up memory or persist the key.
        Here it acts as a pass through for state management.
        """
        self.log(f"Key finalized. Length: {len(sifted_key)}")
        return sifted_key

    def sample_for_verification(self, sifted_key, percentage=0.3):
        """
        Selects a random sample of the sifted key for public comparison.
        Returns:
            - sample_indices: list of indices in the sifted key to reveal
            - sample_bits: the actual bits at those indices
            - remaining_key: the safe key with those bits removed
        """
        total_len = len(sifted_key)
        if total_len < 10:
             sample_size = max(1, total_len // 2)
        else:
             sample_size = max(5, int(total_len * percentage))

        self.log(f"Sampling {sample_size} bits out of {total_len} for verification.")

        import random
        all_indices = list(range(total_len))
        random.shuffle(all_indices)

        sample_indices = sorted(all_indices[:sample_size])
        sample_bits = [sifted_key[i] for i in sample_indices]

        # Create the remaining secure key
        sample_set = set(sample_indices)
        remaining_key = [sifted_key[i] for i in range(total_len) if i not in sample_set]

        return sample_indices, sample_bits, remaining_key
```

**Key Points:**
- Each qubit measured individually (shots=1) — mimics real photon detection
- Noisy simulator built on-the-fly from noise_config
- Sifting keeps only bits where both Alice and Bob chose the same basis (~50% survive)
- Verification samples 30% of sifted key (or 50% if key < 10 bits)

---

### FILE: `noise_simulator.py` — Qiskit Noise Model Factory

```python
"""
noise_simulator.py — Real-World Noise Model Factory for BB84 Simulation

Provides utilities to build Qiskit AerSimulator noise models that replicate
physical phenomena in fiber-optic quantum channels:

1. Depolarizing noise  — random Pauli errors on gate execution (models photon scattering)
2. Thermal relaxation  — T1 (amplitude damping) and T2 (dephasing) decay (models photon decay)
"""

from qiskit_aer.noise import (
    NoiseModel,
    depolarizing_error,
    thermal_relaxation_error,
)
from qiskit_aer import AerSimulator


def build_noise_model(depolar_rate: float = 0.0,
                      t1_us: float = 50.0,
                      t2_us: float = 30.0,
                      gate_time_ns: float = 50.0) -> NoiseModel:
    """
    Build a composite Qiskit NoiseModel.

    Parameters
    ----------
    depolar_rate : float
        Probability (0–1) of a random Pauli error after each single-qubit gate.
        Typical real hardware: 0.001–0.02.
    t1_us : float
        Qubit energy relaxation time T1 in microseconds. Typical: 50–200 µs.
    t2_us : float
        Qubit dephasing time T2 in microseconds. Must be ≤ 2*T1.
    gate_time_ns : float
        Gate duration in nanoseconds.

    Returns
    -------
    NoiseModel
    """
    noise_model = NoiseModel()

    single_qubit_gates = ['x', 'h', 'id', 'u1', 'u2', 'u3']

    # --- Depolarizing error ---
    if depolar_rate > 0.0:
        depolar_err = depolarizing_error(depolar_rate, 1)
        noise_model.add_all_qubit_quantum_error(depolar_err, single_qubit_gates)

    # --- Thermal relaxation (T1/T2 decay) ---
    if t1_us > 0 and t2_us > 0 and t2_us <= 2 * t1_us:
        t1_ns = t1_us * 1_000
        t2_ns = t2_us * 1_000
        thermal_err = thermal_relaxation_error(t1_ns, t2_ns, gate_time_ns)
        noise_model.add_all_qubit_quantum_error(thermal_err, single_qubit_gates)

    return noise_model


def build_noisy_simulator(depolar_rate: float = 0.0,
                           t1_us: float = 0.0,
                           t2_us: float = 0.0) -> AerSimulator:
    """Convenience: build and return a noisy AerSimulator."""
    if depolar_rate == 0.0 and t1_us == 0.0:
        return AerSimulator()  # Ideal (fast)

    noise_model = build_noise_model(
        depolar_rate=depolar_rate,
        t1_us=t1_us if t1_us > 0 else 50.0,
        t2_us=t2_us if t2_us > 0 else 30.0,
    )
    return AerSimulator(noise_model=noise_model)
```

---

### FILE: `app.py` — Flask REST API Server (ALL Endpoints)

```python
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from alice import Alice
from bob import Bob
import numpy as np
import os
import random
import socket
from qiskit import QuantumCircuit

app = Flask(__name__, template_folder=os.getcwd())
CORS(app)

alice = Alice()
bob = Bob()

# Global noise configuration
noise_config = {
    "eve_active":          False,   # Intercept-resend attack by Eve
    "network_noise_rate":  0.0,     # Probability of bit-flip in JSON stream (0–1)
    "channel_noise_rate":  0.0,     # Depolarizing error rate in AerSimulator (0–1)
    "t1_us":               50.0,    # Thermal T1 in microseconds
    "t2_us":               30.0,    # Thermal T2 in microseconds
    "packet_loss_rate":    0.0,     # Probability each qubit is dropped (0–1)
}

# ─── Helper: Get LAN IP ─────────────────────────────────────────
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

# ─── Noise Functions ─────────────────────────────────────────────

def _apply_network_noise(qubit_data, rate):
    """Network Noise: randomly flip some decoded bit values."""
    if rate <= 0:
        return qubit_data, 0
    noisy = []
    flips = 0
    for q in qubit_data:
        entry = dict(q)
        if random.random() < rate:
            entry['bit'] = 1 - entry['bit']
            flips += 1
        noisy.append(entry)
    print(f"[Network Noise] Flipped {flips}/{len(qubit_data)} qubit descriptions.")
    return noisy, flips

def _apply_packet_loss(qubit_data, rate):
    """Packet Loss: randomly drop some qubits (fiber photon loss)."""
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
    """Eavesdropping (Eve): Intercept-Resend Attack.
    Eve randomly measures each qubit in a random basis,
    then re-encodes — producing QBER ≈ 25% on sifted key.
    """
    tapped = []
    intercepts = 0
    for q in qubit_data:
        entry = dict(q)
        eve_basis = random.randint(0, 1)
        if eve_basis != q['basis']:
            entry['bit'] = random.randint(0, 1)
            intercepts += 1
        tapped.append(entry)
    print(f"[Eve] Intercepted. Basis mismatches: {intercepts}/{len(qubit_data)}")
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


# ═══════════════════════════════════════════════════════════════════
# API ENDPOINTS — COMPLETE LIST
# ═══════════════════════════════════════════════════════════════════

# GET  /                          → Backend landing page
# GET  /api/config                → Returns local IP
# POST /api/set_noise_config      → Update noise settings
# GET  /api/get_noise_config      → Return current noise settings
# POST /api/generate_keys         → Alice generates N qubits
# GET  /api/get_quantum_data      → Alice's qubit stream (with noise + Eve + packet loss applied)
# POST /api/bob_measure           → Bob measures received qubits (local mode)
# POST /api/sift_keys             → Basis reconciliation
# POST /api/verify_key            → Alice returns her sifted key fragment
# POST /api/sample_key            → Bob samples 30% for QBER check
# POST /api/compare_sample        → Alice verifies sample → computes QBER
# GET  /api/alice/key_status      → Alice's shared key status
# POST /api/finalize_key          → Bob finalizes key
# POST /api/fetch_from_peer       → Network: Bob fetches qubits from Alice's IP
# GET  /api/public/bases          → Alice exposes her bases (classical channel)
# POST /api/fetch_peer_bases      → Bob fetches Alice's bases over network
# POST /api/verify_peer_sample    → Network: full verification flow
# POST /api/encrypt_message       → XOR encrypt message with shared key
# GET  /api/get_message           → Alice's outbox of encrypted messages
# POST /api/fetch_message_from_peer → Bob polls Alice's outbox over network
# POST /api/decrypt_message       → XOR decrypt message with shared key

# ─── Noise Configuration ────────────────────────────────────────
@app.route('/api/set_noise_config', methods=['POST'])
def set_noise_config():
    data = request.json or {}
    for key in noise_config:
        if key in data:
            noise_config[key] = data[key]
    return jsonify({"status": "ok", "noise_config": noise_config})

@app.route('/api/get_noise_config', methods=['GET'])
def get_noise_config():
    return jsonify(noise_config)

# ─── Alice: Generate Keys ────────────────────────────────────────
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
    return jsonify({
        "aliceBits":    raw_bits,
        "aliceBases":   bases,
        "qubitSymbols": symbols,
    })

# ─── Quantum Channel: Get Data (with noise pipeline) ─────────────
@app.route('/api/get_quantum_data', methods=['GET'])
def get_quantum_data():
    if not alice.encoded_qubits:
        return jsonify({"error": "No keys generated yet"}), 404
    qubit_data = []
    for bit, basis in zip(alice.raw_bits, alice.bases):
        qubit_data.append({"bit": int(bit), "basis": int(basis)})
    original_count = len(qubit_data)
    # Noise pipeline: Eve → Packet Loss → Network Noise
    if noise_config.get("eve_active", False):
        qubit_data = _apply_eve(qubit_data)
    qubit_data, dropped = _apply_packet_loss(qubit_data, noise_config.get("packet_loss_rate", 0))
    qubit_data, flips = _apply_network_noise(qubit_data, noise_config.get("network_noise_rate", 0))
    return jsonify({
        "qubit_data": qubit_data, "original_count": original_count,
        "dropped": dropped, "flips": flips,
        "eve_active": noise_config.get("eve_active", False),
    })

# ─── Bob: Measure ────────────────────────────────────────────────
@app.route('/api/bob_measure', methods=['POST'])
def bob_measure():
    data = request.json
    qubit_data = data.get('qubit_data')
    noise_stats = {"dropped": 0, "flips": 0}
    if not qubit_data:
        if alice.encoded_qubits:
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
    noise_stats = {"dropped": dropped, "flips": flips, "original_count": original_count}
    received_qubits = _build_circuits_from_qubit_data(qubit_data)
    bob_bases, measured_bits = bob.measure_qubits(received_qubits, noise_config=noise_config)
    return jsonify({
        "bobBases": bob_bases, "measuredBits": measured_bits, "noiseStats": noise_stats,
    })

# ─── Sifting ─────────────────────────────────────────────────────
@app.route('/api/sift_keys', methods=['POST'])
def sift_keys():
    data = request.json
    alice_bases = data.get('aliceBases')
    bob_bases = data.get('bobBases')
    bob_bits = data.get('bobBits')
    if not alice_bases:
        if alice.bases:
            alice_bases = alice.bases
        else:
            return jsonify({"error": "Missing Alice bases and no local state"}), 400
    if not (bob_bases and bob_bits):
        return jsonify({"error": "Missing Bob data for sifting"}), 400
    # Handle mismatched lengths caused by packet loss
    min_len = min(len(alice_bases), len(bob_bases))
    alice_bases_trimmed = alice_bases[:min_len]
    bob_bases_trimmed   = bob_bases[:min_len]
    bob_bits_trimmed    = bob_bits[:min_len]
    sifted_key, matches = bob.sift_keys(alice_bases_trimmed, bob_bases_trimmed, bob_bits_trimmed)
    return jsonify({"siftedKey": sifted_key, "matches": matches})

# ─── Verification ────────────────────────────────────────────────
@app.route('/api/verify_key', methods=['POST'])
def verify_key():
    data = request.json
    matches = data.get('matches')
    if not matches:
        return jsonify({"error": "Missing matches"}), 400
    if not alice.raw_bits:
        return jsonify({"error": "Alice has no bits"}), 400
    alice_key = [alice.raw_bits[i] for i in matches if i < len(alice.raw_bits)]
    return jsonify({"aliceKey": alice_key})

@app.route('/api/sample_key', methods=['POST'])
def sample_key():
    data = request.json
    sifted_key = data.get('siftedKey')
    if not sifted_key:
        return jsonify({"error": "Missing sifted key"}), 400
    indices, bits, remaining = bob.sample_for_verification(sifted_key)
    return jsonify({
        "sampleIndices": indices, "sampleBits": bits, "remainingKey": remaining,
    })

@app.route('/api/compare_sample', methods=['POST'])
def compare_sample():
    data = request.json
    sample_indices = data.get('sampleIndices', [])
    bob_sample_bits = data.get('bobSampleBits', [])
    matches = data.get('originalMatches')
    if not matches:
        return jsonify({"error": "Missing original match indices"}), 400
    if not alice.raw_bits:
        return jsonify({"error": "Alice has no raw bits."}), 400
    alice_sifted = [alice.raw_bits[i] for i in matches if i < len(alice.raw_bits)]
    alice_sample_bits = []
    try:
        alice_sample_bits = [alice_sifted[i] for i in sample_indices]
    except IndexError as e:
        return jsonify({"error": "Invalid sample indices"}), 400
    error_count = 0
    total = len(sample_indices)
    for a, b in zip(alice_sample_bits, bob_sample_bits):
        if a != b:
            error_count += 1
    qber = (error_count / total) * 100 if total > 0 else 0
    if qber == 0:
        alice_remaining = [alice_sifted[i] for i in range(len(alice_sifted)) if i not in sample_indices]
        alice.shared_key = alice_remaining
    return jsonify({
        "aliceSampleBits": alice_sample_bits, "errorCount": error_count,
        "qber": qber, "verified": qber == 0, "noiseConfig": noise_config,
    })

# ─── Key Status & Finalization ───────────────────────────────────
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
    return jsonify({"finalKey": final_key})

# ─── Network Mode: P2P ───────────────────────────────────────────
@app.route('/api/fetch_from_peer', methods=['POST'])
def fetch_from_peer():
    """Bob fetches qubit data from Alice's IP over LAN."""
    import requests
    data = request.json
    peer_ip = data.get('peer_ip')
    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400
    try:
        target_url = f"http://{peer_ip}:5000/api/get_quantum_data"
        resp = requests.get(target_url, timeout=5)
        if resp.status_code != 200:
            return jsonify({"error": f"Failed to fetch from Alice: {resp.text}"}), 500
        alice_data = resp.json()
        qubit_data = alice_data.get('qubit_data')
        noise_stats = {
            "dropped": alice_data.get("dropped", 0),
            "flips": alice_data.get("flips", 0),
            "original_count": alice_data.get("original_count", len(qubit_data)),
        }
        received_qubits = _build_circuits_from_qubit_data(qubit_data)
        bob_bases, measured_bits = bob.measure_qubits(received_qubits, noise_config=noise_config)
        return jsonify({
            "status": "success", "message": f"Received and measured {len(measured_bits)} qubits",
            "bobBases": bob_bases, "measuredBits": measured_bits, "noiseStats": noise_stats,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/public/bases', methods=['GET'])
def get_public_bases():
    """Alice exposes ONLY her bases (Classical Channel)."""
    if not alice.bases:
        return jsonify({"error": "No bases available"}), 404
    return jsonify({"bases": alice.bases})

@app.route('/api/fetch_peer_bases', methods=['POST'])
def fetch_peer_bases():
    """Bob fetches Alice's bases via classical channel."""
    import requests
    data = request.json
    peer_ip = data.get('peer_ip')
    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400
    try:
        target_url = f"http://{peer_ip}:5000/api/public/bases"
        resp = requests.get(target_url, timeout=5)
        if resp.status_code != 200:
            return jsonify({"error": f"Failed to fetch bases: {resp.text}"}), 500
        data = resp.json()
        return jsonify({"aliceBases": data.get('bases')})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/verify_peer_sample', methods=['POST'])
def verify_peer_sample():
    """Bob calculates sample, sends to Alice for comparison."""
    import requests
    data = request.json
    peer_ip = data.get('peer_ip')
    sifted_key = data.get('sifted_key')
    original_matches = data.get('original_matches')
    if not (peer_ip and sifted_key and original_matches):
        return jsonify({"error": "Missing parameters"}), 400
    indices, bits, remaining = bob.sample_for_verification(sifted_key)
    try:
        target_url = f"http://{peer_ip}:5000/api/compare_sample"
        payload = {
            "sampleIndices": indices, "bobSampleBits": bits,
            "originalMatches": original_matches,
        }
        resp = requests.post(target_url, json=payload, timeout=5)
        if resp.status_code != 200:
            return jsonify({"error": f"Verification failed: {resp.text}"}), 500
        alice_res = resp.json()
        return jsonify({
            "sampleIndices": indices, "sampleBits": bits,
            "remainingKey": remaining, "errorCount": alice_res.get('errorCount'),
            "qber": alice_res.get('qber'), "verified": alice_res.get('verified'),
            "noiseConfig": alice_res.get('noiseConfig'),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── Messaging (Encrypt/Decrypt with shared key) ────────────────
@app.route('/api/encrypt_message', methods=['POST'])
def encrypt_message():
    data = request.json
    message = data.get('message', '')
    key_str = data.get('key', '')
    if not message or not key_str:
        return jsonify({"error": "Message and key required"}), 400
    msg_bytes = message.encode('utf-8')
    msg_bits = []
    for byte in msg_bytes:
        msg_bits.extend([int(b) for b in format(byte, '08b')])
    encrypted_bits = []
    key_len = len(key_str)
    for i, bit in enumerate(msg_bits):
        k_bit = int(key_str[i % key_len])
        encrypted_bits.append(bit ^ k_bit)
    while len(encrypted_bits) % 4 != 0:
        encrypted_bits.insert(0, 0)
    enc_int = int(''.join(map(str, encrypted_bits)), 2)
    hex_len = (len(encrypted_bits) + 3) // 4
    encrypted_hex = f"{enc_int:0{hex_len}x}"
    if not hasattr(alice, 'outbox'):
        alice.outbox = []
    alice.outbox.append(encrypted_hex)
    return jsonify({"encrypted_hex": encrypted_hex})

@app.route('/api/get_message', methods=['GET'])
def get_message():
    if not hasattr(alice, 'outbox') or len(alice.outbox) == 0:
        return jsonify({"messages": []})
    return jsonify({"messages": alice.outbox})

@app.route('/api/fetch_message_from_peer', methods=['POST'])
def fetch_message_from_peer():
    import requests
    data = request.json
    peer_ip = data.get('peer_ip')
    if not peer_ip:
        return jsonify({"error": "Peer IP required"}), 400
    try:
        target_url = f"http://{peer_ip}:5000/api/get_message"
        resp = requests.get(target_url, timeout=5)
        if resp.status_code != 200:
            return jsonify({"error": f"Failed to fetch messages: {resp.text}"}), 500
        data = resp.json()
        messages = data.get('messages', [])
        return jsonify({"messages": messages})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/decrypt_message', methods=['POST'])
def decrypt_message():
    data = request.json
    encrypted_hex = data.get('encrypted_hex', '')
    key_str = data.get('key', '')
    if not encrypted_hex or not key_str:
        return jsonify({"error": "Encrypted message and key required"}), 400
    hex_len = len(encrypted_hex)
    enc_int = int(encrypted_hex, 16)
    encrypted_bitsStr = format(enc_int, f'0{hex_len*4}b')
    encrypted_bits = [int(b) for b in encrypted_bitsStr]
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
```

---

### FILE: `client/src/context/ProjectContext.tsx` — Global State

```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { defaultConfig } from '../components/NoisePanel';
import type { NoiseConfig } from '../components/NoisePanel';

interface LogEntry {
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    time: string;
}

interface ProjectContextType {
    role: 'alice' | 'bob';
    setRole: (role: 'alice' | 'bob') => void;
    logs: LogEntry[];
    addLog: (type: LogEntry['type'], msg: string) => void;
    localIP: string;
    peerIP: string;
    setPeerIP: (ip: string) => void;
    connected: boolean;
    setConnected: (status: boolean) => void;
    aliceBits: number[];
    aliceBases: number[];
    setAliceState: (bits: number[], bases: number[]) => void;
    bobBases: number[];
    bobBits: number[];
    setBobState: (bases: number[], bits: number[]) => void;
    sharedKey: number[];
    setSharedKey: (key: number[]) => void;
    resetState: () => void;
    noiseConfig: NoiseConfig;
    setNoiseConfig: (cfg: NoiseConfig) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProject = () => {
    const context = useContext(ProjectContext);
    if (!context) throw new Error('useProject must be used within a ProjectProvider');
    return context;
};

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [role, setRole] = useState<'alice' | 'bob'>('alice');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [localIP, setLocalIP] = useState<string>('Fetching...');
    const [peerIP, setPeerIP] = useState<string>('');
    const [connected, setConnected] = useState<boolean>(false);
    const [aliceBits, setAliceBits] = useState<number[]>([]);
    const [aliceBases, setAliceBases] = useState<number[]>([]);
    const [bobBases, setBobBases] = useState<number[]>([]);
    const [bobBits, setBobBits] = useState<number[]>([]);
    const [sharedKey, setSharedKey] = useState<number[]>([]);
    const [noiseConfig, setNoiseConfig] = useState<NoiseConfig>(defaultConfig);

    useEffect(() => {
        axios.get('/api/config')
            .then(res => {
                if (res.data.local_ip) {
                    setLocalIP(res.data.local_ip);
                    addLog('info', `System initialized. Your IP: ${res.data.local_ip}`);
                }
            })
            .catch(err => {
                console.error(err);
                addLog('error', 'Failed to fetch local configuration.');
            });
    }, []);

    const addLog = (type: LogEntry['type'], message: string) => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { type, message, time }]);
    };

    const setAliceState = (bits: number[], bases: number[]) => {
        setAliceBits(bits);
        setAliceBases(bases);
    };

    const setBobState = (bases: number[], bits: number[]) => {
        setBobBases(bases);
        setBobBits(bits);
    };

    const resetState = () => {
        setAliceBits([]);
        setAliceBases([]);
        setBobBases([]);
        setBobBits([]);
        setSharedKey([]);
        addLog('info', 'State reset.');
    };

    const value = {
        role, setRole,
        logs, addLog,
        localIP, peerIP, setPeerIP, connected, setConnected,
        aliceBits, aliceBases, setAliceState,
        bobBases, bobBits, setBobState,
        sharedKey, setSharedKey,
        resetState,
        noiseConfig, setNoiseConfig,
    };

    return (
        <ProjectContext.Provider value={value}>
            {children}
        </ProjectContext.Provider>
    );
};
```

---

### FILE: `client/src/components/AlicePanel.tsx`

Alice's UI panel — generates qubits, shows bits and bases visually, displays shared key after verification. Uses Framer Motion for animations. Polls `/api/alice/key_status` every 2 seconds to detect when Bob has verified the key.

---

### FILE: `client/src/components/BobPanel.tsx`

Bob's UI panel — 3-step flow:
1. **Receive Qubits** → calls `/api/bob_measure` (local) or `/api/fetch_from_peer` (network)
2. **Sift Keys** → calls `/api/sift_keys` with Alice's bases
3. **Verify & Finalize** → calls `/api/sample_key` + `/api/compare_sample` or `/api/verify_peer_sample`

Displays: measured bits, noise stats banner, QBER indicator (color-coded: green=secure, yellow=marginal, orange=elevated, red=attack), and final shared key.

---

### FILE: `client/src/components/NoisePanel.tsx`

Collapsible noise simulation control panel with:
- **Eve Toggle** — intercept-resend attack ON/OFF
- **Network Noise Slider** — bit-flip rate 0-30%
- **Channel Noise Slider** — Qiskit depolarizing rate 0-25% with T1/T2 thermal parameters
- **Packet Loss Slider** — qubit drop rate 0-50%
- Active noise count badge, per-noise status badges
- Debounced sync to backend (300ms) via `/api/set_noise_config`

---

### FILE: `client/src/components/Messaging.tsx`

Post-key-exchange encrypted messaging:
- **Alice mode**: Text input → encrypt with XOR → store in outbox
- **Bob mode**: Poll Alice's outbox → fetch ciphertext → decrypt with shared key
- Works both locally and over network (via `/api/fetch_message_from_peer`)

---

### FILE: `client/src/components/ConnectionPanel.tsx`

LAN peer-to-peer configuration — IP input + connect/disconnect button.

### FILE: `client/src/components/Header.tsx`

App header showing "Quantum Key Distribution — BB84 Protocol", local IP, and connection status.

### FILE: `client/src/components/LogTerminal.tsx`

Real-time scrolling log display (auto-scrolls to bottom) showing color-coded INFO/SUCCESS/WARNING/ERROR entries.

### FILE: `client/src/components/QuantumOrb.tsx`

Animated background decoration — two counter-rotating blurred gradient orbs using Framer Motion.

---

## 4 NOISE TYPES IMPLEMENTED

| # | Noise Type | Where Applied | Mechanism | Expected QBER Impact |
|---|---|---|---|---|
| 1 | **Network Noise** | `app.py → _apply_network_noise()` | Randomly flips bit values in the qubit JSON data (classical channel corruption) | Proportional to flip rate |
| 2 | **Channel Noise** | `noise_simulator.py` → `bob.py` measurement | Qiskit depolarizing error + T1/T2 thermal relaxation applied to AerSimulator | Proportional to depolar rate |
| 3 | **Eavesdropping (Eve)** | `app.py → _apply_eve()` | Intercept-resend: Eve measures in random basis, re-encodes — 50% wrong basis × 50% wrong bit = 25% error | ~25% QBER on sifted key |
| 4 | **Packet Loss** | `app.py → _apply_packet_loss()` | Random qubit drop before Bob receives (fiber photon loss) | Reduces key length, not QBER directly |

**Noise Pipeline Order**: Eve → Packet Loss → Network Noise → Channel Noise (at measurement)

---

## PROTOCOL FLOW (Step-by-Step)

```
1. Alice generates N random bits and N random bases (secrets module — CSPRNG)
2. Alice encodes each bit in its basis as a Qiskit QuantumCircuit:
   - Rectilinear + bit=0 → |0⟩ (no gate)
   - Rectilinear + bit=1 → |1⟩ (X gate)
   - Diagonal + bit=0 → |+⟩ (H gate)
   - Diagonal + bit=1 → |-⟩ (X+H gates)
3. Qubits transmitted through "quantum channel" (with noise pipeline applied)
4. Bob generates random measurement bases
5. Bob measures each qubit — if his basis matches Alice's, result is deterministic;
   if different, result is random (50/50)
6. Classical channel: Alice reveals her bases (NOT her bits)
7. Sifting: keep only bits where bases matched (~50%)
8. Verification: Bob reveals 30% of sifted key for QBER estimation
9. Alice compares → QBER computed
   - QBER = 0%: Secure key established
   - QBER > 0% but < 20%: Marginal (noise interference)
   - QBER > 20%: Abort (eavesdropper detected)
10. Remaining 70% of sifted key becomes the shared secret key
11. Alice & Bob can now XOR-encrypt messages with the shared key
```

---

## WHAT IS NOT YET IMPLEMENTED (Known Gaps)

1. **Cascade Error Reconciliation** — Interactive binary-parity protocol to fix mismatched bits between Alice and Bob's sifted keys. Without this, any noise causes different keys.

2. **Privacy Amplification (Toeplitz Hashing)** — Compresses the reconciled key using a random Toeplitz matrix hash to eliminate Eve's partial knowledge from the QBER estimation and error correction parity leaks.

3. **Decoy State Protocol** — Alice sends 3 intensity levels (signal, decoy, vacuum) to detect Photon Number Splitting attacks on multi-photon pulses.

4. **Authentication (HMAC)** — Classical channel messages (basis exchange, verification) are unauthenticated → vulnerable to man-in-the-middle attacks.

5. **Key Rate Analytics** — Formula: R = 1 - H(QBER) - leak_EC. Charts showing secure key rate vs. distance/noise/QBER.

6. **Information Leakage Tracking** — Track bits leaked at each protocol stage (sampling, error correction parity bits).

7. **E91 (Ekert) Protocol** — Entangled Bell pair alternative. Security via CHSH Bell inequality violation.

8. **B92 Protocol** — Simplified 2-state protocol for comparison.

---

## DEPENDENCIES

```
# requirements.txt
flask
numpy
qiskit
qiskit-aer
requests
flask-cors

# Frontend (package.json — key deps)
react, react-dom, react-router-dom
typescript, vite
axios
framer-motion
lucide-react
```

---

## HOW TO RUN

```bash
# Backend (port 5000)
cd bb84
pip install -r requirements.txt
python app.py

# Frontend (port 5173, proxied to :5000)
cd bb84/client
npm install
npx vite
```

**Network Mode (2 machines on same LAN)**:
- Machine 1 (Alice): Run `python app.py` — note the IP shown
- Machine 2 (Bob): Run `python app.py` + `npx vite` — enter Alice's IP in ConnectionPanel
- Bob clicks "Receive Qubits" → fetches from Alice's server

---

## ACADEMIC REFERENCES

1. Bennett & Brassard (1984) — "Quantum Cryptography: Public Key Distribution and Coin Tossing" — *Original BB84*
2. Brassard & Salvail (1994) — "Secret-Key Reconciliation by Public Discussion" — *Cascade protocol*
3. Bennett et al. (1995) — "Generalized Privacy Amplification" — *Toeplitz hashing*
4. Lo, Ma & Chen (2005) — "Decoy State Quantum Key Distribution" — *Decoy states*
5. Ekert (1991) — "Quantum Cryptography Based on Bell's Theorem" — *E91 protocol*
6. Scarani et al. (2009) — "The Security of Practical Quantum Key Distribution" — *Review paper*
7. Hayashi (2011) — "Exponential Decreasing Rate of Leaked Information on Universal Hashing"
8. Lütkenhaus (2000) — "Security against individual attacks for realistic QKD"

---

*This document contains the complete source code and technical details of the project as of March 2026. Feed this to any AI assistant for context-aware improvement suggestions.*
