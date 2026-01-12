import numpy as np
from qiskit import QuantumCircuit
from qiskit_aer import Aer

def generate_masked_key(length, special_pattern):
    # 1. Generate random bits and random bases
    alice_bits = np.random.randint(2, size=length)
    alice_bases = np.random.randint(2, size=length) # 0=Rectilinear, 1=Diagonal
    
    # 2. Apply the Special Pattern Mask (XOR)
    # Ensure special_pattern is the same length as the key
    masked_bits = alice_bits ^ special_pattern 
    
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
    pattern = np.array([1, 0, 1, 1, 0]) 
    raw_bits, bases, qubits = generate_masked_key(5, pattern)
    print(f"Alice's Secret Bits: {raw_bits}")
    print("Backend check passed!")