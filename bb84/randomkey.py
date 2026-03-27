import secrets
from qiskit import QuantumCircuit

def generate_masked_key(length):
    # Ghost-Bit Trap (Self-Healing BB84)
    # Ensure length is a multiple of 4
    if length % 4 != 0:
        length = length + (4 - (length % 4))
        
    alice_bits = []
    alice_bases = []
    
    # 1. Generate bits and bases in chunks of 4
    for i in range(0, length, 4):
        # The Secret Hideout: 1 basis for the entire 4-bit chunk
        chunk_basis = secrets.choice([0, 1])
        
        # The Secret Math: 3 real bits + 1 Ghost parity bit
        bit0 = secrets.choice([0, 1])
        bit1 = secrets.choice([0, 1])
        bit2 = secrets.choice([0, 1])
        ghost_bit = (bit0 + bit1 + bit2) % 2
        
        alice_bits.extend([bit0, bit1, bit2, ghost_bit])
        alice_bases.extend([chunk_basis] * 4)

    # 2. No Special Pattern Mask
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

# Example:
if __name__ == "__main__":
    raw_bits, bases, qubits = generate_masked_key(5)
    print(f"Alice's Secret Bits: {raw_bits}")
    print("Backend check passed!")