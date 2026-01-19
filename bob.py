
import secrets
from qiskit import QuantumCircuit
from node import Node

class Bob(Node):
    def __init__(self):
        super().__init__("Bob")
        self.bases = None
        self.measured_bits = None

    def measure_qubits(self, quantum_channel):
        """
        Bob receives qubits from the quantum channel and measures them.
        He randomly chooses a basis for each qubit.
        """
        self.log(f"Received {len(quantum_channel)} qubits from Quantum Channel.")
        
        num_qubits = len(quantum_channel)
        
        # 1. Generate random bases for measurement
        # 0 = Rectilinear (+), 1 = Diagonal (x)
        self.bases = [secrets.choice([0, 1]) for _ in range(num_qubits)]
        
        self.measured_bits = []
        
        # 2. Measure each qubit
        for i, qc in enumerate(quantum_channel):
            bit = self._measure_single_qubit(qc, self.bases[i])
            self.measured_bits.append(bit)
            
        self.log(f"Measured {len(self.measured_bits)} bits.")
        return self.bases, self.measured_bits

    def _measure_single_qubit(self, qc, basis):
        """
        Simulates measurement of a single qubit circuit in the given basis.
        Note: Since we are using Qiskit circuits as the "carrier", we technically
        need to execute them. However, for this simulation without a real backend,
        we can simulate the measurement outcome based on the state.
        
        Ideally, we would run:
          qc.measure(0, 0)
          result = execute(qc, backend).result()
        
        To keep it simple and fast without heavy AER simulation if possible, 
        or we use Aer if we want true QM simulation.
        Let's use Aer for correctness if installed, or logical simulation.
        Previous code used Aer in randomkey.py but I removed it to use secrets?
        Wait, I removed Aer from randomkey.py because I just generated bits directly.
        But Alice returns 'encoded_qubits' which are QuantumCircuits.
        So we MUST use a simulator to measure them if we want to respect the quantum properties
        (e.g., basis mismatch = 50% random).
        """
        
        # Clone the circuit to avoid modifying the original 'transmission' (though physically measurement destroys it)
        # In Qiskit < 1.0 it's .copy(), later might be different.
        # Let's verify imports.
        # Check if we can do a simple simulation.
        
        from qiskit_aer import Aer
        
        # Prepare measurement circuit
        meas_qc = qc.copy()
        
        # Apply basis rotation if measuring in Diagonal basis
        if basis == 1:
            meas_qc.h(0) # Rotate X basis to Z basis for measurement
            
        meas_qc.measure_all()
        
        # Run simulation
        simulator = Aer.get_backend('qasm_simulator')
        # We only need 1 shot to simulate a single photon measurement
        result = simulator.run(meas_qc, shots=1, memory=True).result()
        memory = result.get_memory(meas_qc)
        measured_bit = int(memory[0])
        
        return measured_bit
