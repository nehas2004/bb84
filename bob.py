
import secrets
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator
from node import Node

class Bob(Node):
    def __init__(self):
        super().__init__("Bob")
        self.bob_bases = []
        self.measured_bits = []
        self.sifted_key = []
        self.simulator = AerSimulator()

    def measure_qubits(self, encoded_qubits):
        """
        Receives a list of QuantumCircuits (qubits) from Alice.
        Generates random bases for each qubit.
        Measures the qubits in those bases.
        Returns the chosen bases and the measurement results.
        """
        self.log(f"Received {len(encoded_qubits)} qubits to measure.")
        
        num_qubits = len(encoded_qubits)
        # Generate random bases: 0 = Rectilinear (+), 1 = Diagonal (x)
        self.bob_bases = [secrets.choice([0, 1]) for _ in range(num_qubits)]
        self.measured_bits = []

        for i, qc in enumerate(encoded_qubits):
            # We need to act on a copy or the original circuit
            # The circuit 'qc' is already prepared by Alice (state |0>, |1>, |+>, or |->)
            
            # If Bob chooses Rectilinear (0):
            #   Measure directly in Z-basis (standard computational basis).
            #   No additional gates needed before measurement if we assume standard measure is Z.
            
            # If Bob chooses Diagonal (1):
            #   We need to change basis to X-basis before measurement.
            #   Apply Hadamard (H) gate.
            
            measure_circuit = qc.copy()
            
            if self.bob_bases[i] == 1:
                measure_circuit.h(0)
            
            # Add measurement
            measure_circuit.measure_all()
            
            # Run simulation (ideal, single shot)
            # In a real system, this would be a physical detector click
            result = self.simulator.run(measure_circuit, shots=1, memory=True).result()
            measured_bit_str = result.get_memory()[0]
            self.measured_bits.append(int(measured_bit_str))

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
        
        # Ensure lengths match (or zip until shortest)
        for i, (a_basis, b_basis) in enumerate(zip(alice_bases, bob_bases)):
            if a_basis == b_basis:
                sifted_key.append(measured_bits[i])
                matching_indices.append(i)
                
        self.sifted_key = sifted_key
        self.log(f"Sifting complete. Kept {len(sifted_key)} bits.")
        return sifted_key, matching_indices

    def finalize_key(self, sifted_key):
        """
        In standard BB84, the sifted key is the final key (absent error correction/privacy amp).
        We keep this method to verify the flow.
        """
        self.log(f"Finalizing key: {sifted_key}")
        return sifted_key

if __name__ == "__main__":
    # Smoke test
    print("Testing Bob...")
    from qiskit import QuantumCircuit
    
    # Mock Alice sending a |1> (Rectilinear basis)
    qc = QuantumCircuit(1)
    qc.x(0) # |1>
    
    bob = Bob()
    bases, bits = bob.measure_qubits([qc])
    print(f"Basis: {bases[0]} (0=Rect, 1=Diag)")
    print(f"Measured: {bits[0]}")
