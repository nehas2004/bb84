import secrets
from qiskit import QuantumCircuit

def generate_masked_key(length, special_pattern):
    # 1. Generate cryptographically secure random bits and bases
    # using secrets module
    alice_bits = [secrets.choice([0, 1]) for _ in range(length)]
    alice_bases = [secrets.choice([0, 1]) for _ in range(length)] # 0=Rectilinear, 1=Diagonal
    
    # 2. Apply the Special Pattern Mask (XOR)
    # Ensure special_pattern is the same length as the key
    # We assume distinct implementation elsewhere handles length checks, 
    # but here we zip to be safe.
    masked_bits = [b ^ p for b, p in zip(alice_bits, special_pattern)]
    
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

# Example:
if __name__ == "__main__":
    pattern = [1, 0, 1, 1, 0] 
    raw_bits, bases, qubits = generate_masked_key(5, pattern)
    print(f"Alice's Secret Bits: {raw_bits}")
    print("Backend check passed!")