

import randomkey
from node import Node

class Alice(Node):
    def __init__(self):
        super().__init__("Alice")
        self.raw_bits = None
        self.bases = None
        self.encoded_qubits = None

    def prepare_quantum_states(self, length):
        self.log(f"Generating {length} bits (Standard BB84)...")
        
        # Call the existing module to do the heavy lifting
        self.raw_bits, self.bases, self.encoded_qubits = randomkey.generate_masked_key(length)
        
        self.log(f"Generated {len(self.raw_bits)} raw bits.")
        self.log(f"Encoded {len(self.encoded_qubits)} qubits.")
        return self.encoded_qubits

if __name__ == "__main__":
    # Manual Verification
    alice = Alice()
    
    # Test with a small example
    test_len = 5
    
    qubits = alice.prepare_quantum_states(test_len)
    
    print("\nVerification - Quantum Circuit Dump:")
    for i, qc in enumerate(qubits):
        print(f"\nQubit {i}:")
        print(qc)
