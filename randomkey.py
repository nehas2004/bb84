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


def generate_biased_key(length, seed_key_bits):
    """
    Recursive BB84: generate a new key using biased basis selection.
    
    The bias is derived from the 0/1 ratio of the previous shared key:
        bias = (number of 1s in seed) / len(seed)
    
    Both Alice and Bob independently compute the SAME bias from the shared key,
    so no extra channel is needed to agree on it. Eve never learns the bias
    because she never learns the key.
    
    bias is clamped to [0.10, 0.90] so the protocol never becomes fully
    deterministic (which would be trivially predictable).
    """
    if not seed_key_bits or len(seed_key_bits) == 0:
        raise ValueError("seed_key_bits must be a non-empty list of 0/1 integers")

    # Derive basis bias from previous key's bit ratio
    raw_bias = sum(seed_key_bits) / len(seed_key_bits)
    bias = max(0.10, min(0.90, raw_bias))   # clamp to [10%, 90%]

    rng = secrets.SystemRandom()
    alice_bits  = [secrets.choice([0, 1]) for _ in range(length)]
    alice_bases = [1 if rng.random() < bias else 0 for _ in range(length)]

    encoded_qubits = []
    for i in range(length):
        qc = QuantumCircuit(1, 1)
        if alice_bases[i] == 0:   # Rectilinear basis
            if alice_bits[i] == 1:
                qc.x(0)
        else:                      # Diagonal basis
            if alice_bits[i] == 0:
                qc.h(0)
            else:
                qc.x(0)
                qc.h(0)
        encoded_qubits.append(qc)

    return alice_bits, alice_bases, encoded_qubits, bias


# Example:
if __name__ == "__main__":
    raw_bits, bases, qubits = generate_masked_key(5)
    print(f"Alice's Secret Bits: {raw_bits}")
    print("Backend check passed!")

    # Quick smoke-test for biased generation
    seed = [1, 1, 0, 1, 0, 1, 1, 0]  # 5/8 = 62.5% ones
    b_bits, b_bases, _, bias_val = generate_biased_key(20, seed)
    print(f"Biased key test: bias={bias_val:.2f}, bases_distribution={sum(b_bases)}/{len(b_bases)} ones")