
from flask import Flask, render_template, request, jsonify
from alice import Alice
import numpy as np
import os

# Set template_folder to current directory to find ui.html
app = Flask(__name__, template_folder=os.getcwd())

alice = Alice()

@app.route('/')
def index():
    return render_template('ui.html')

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
    raw_bits = alice.raw_bits.tolist()
    bases = alice.bases.tolist()
    
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

if __name__ == '__main__':
    print("Starting Antigravity Quantum Server...")
    app.run(port=5000, debug=True)
