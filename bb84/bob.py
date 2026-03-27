
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

        # ---------------------------------------------------------------
        # Build the simulator — noisy or ideal based on noise_config
        # ---------------------------------------------------------------
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
            # The circuit 'qc' is already prepared by Alice (state |0>, |1>, |+>, or |->)

            # If Bob chooses Rectilinear (0): Measure in Z-basis (no extra gate)
            # If Bob chooses Diagonal (1):  Apply H then measure (X-basis)

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
        # Ensure we check at least 5 bits if possible, otherwise 50%
        if total_len < 10:
             sample_size = max(1, total_len // 2)
        else:
             sample_size = max(5, int(total_len * percentage))

        self.log(f"Sampling {sample_size} bits out of {total_len} for verification.")

        # Randomly select indices using a simple Fisher-Yates shuffle
        import random
        all_indices = list(range(total_len))
        random.shuffle(all_indices)

        sample_indices = sorted(all_indices[:sample_size])

        sample_bits = [sifted_key[i] for i in sample_indices]

        # Create the remaining secure key
        sample_set = set(sample_indices)
        remaining_key = [sifted_key[i] for i in range(total_len) if i not in sample_set]

        return sample_indices, sample_bits, remaining_key

if __name__ == "__main__":
    # Smoke test
    print("Testing Bob...")
    from qiskit import QuantumCircuit

    # Mock Alice sending a |1> (Rectilinear basis)
    qc = QuantumCircuit(1)
    qc.x(0)  # |1>

    bob = Bob()
    bases, bits = bob.measure_qubits([qc])
    print(f"Basis: {bases[0]} (0=Rect, 1=Diag)")
    print(f"Measured: {bits[0]}")

    # Test with channel noise
    print("\nTesting with channel noise (5% depolarizing)...")
    noise_cfg = {"channel_noise_rate": 0.05, "t1_us": 50, "t2_us": 30}
    bases_n, bits_n = bob.measure_qubits([qc], noise_config=noise_cfg)
    print(f"Noisy Basis: {bases_n[0]}, Noisy Measured: {bits_n[0]}")
