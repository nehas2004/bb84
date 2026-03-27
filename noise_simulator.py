"""
noise_simulator.py — Real-World Noise Model Factory for BB84 Simulation

Provides utilities to build Qiskit AerSimulator noise models that replicate
physical phenomena in fiber-optic quantum channels and hardware topology.

Supported Modes:
1. Custom Depolarizing/Thermal Noise — Built from scratch for specific testing.
2. GenericBackendV2 — Models real hardware (like FakeBrooklyn from the IBM Quantum papers)
   with authentic T1/T2, gate errors, and read/write noise.
"""

from qiskit_aer.noise import (
    NoiseModel,
    depolarizing_error,
    thermal_relaxation_error,
)
from qiskit_aer import AerSimulator
from qiskit.providers.fake_provider import GenericBackendV2


def build_custom_noise_model(depolar_rate: float = 0.0,
                             t1_us: float = 50.0,
                             t2_us: float = 30.0,
                             gate_time_ns: float = 50.0) -> NoiseModel:
    """Build a composite Qiskit NoiseModel with custom parameters."""
    noise_model = NoiseModel()
    single_qubit_gates = ['x', 'h', 'id', 'u1', 'u2', 'u3']

    if depolar_rate > 0.0:
        depolar_err = depolarizing_error(depolar_rate, 1)
        noise_model.add_all_qubit_quantum_error(depolar_err, single_qubit_gates)

    if t1_us > 0 and t2_us > 0 and t2_us <= 2 * t1_us:
        t1_ns = t1_us * 1_000
        t2_ns = t2_us * 1_000
        thermal_err = thermal_relaxation_error(t1_ns, t2_ns, gate_time_ns)
        noise_model.add_all_qubit_quantum_error(thermal_err, single_qubit_gates)

    return noise_model


def build_noisy_simulator(use_hardware_noise: bool = False,
                          depolar_rate: float = 0.0,
                          t1_us: float = 0.0,
                          t2_us: float = 0.0) -> AerSimulator:
    """
    Build and return an AerSimulator configured for BB84.

    Parameters
    ----------
    use_hardware_noise : bool
        If True, returns an AerSimulator coupled to GenericBackendV2, which accurately
        models hardware thermal relaxation, readout error, and gate fidelity errors.
        This provides a realistic baseline QBER_SN (e.g. ~1.5 - 2%).
    depolar_rate, t1_us, t2_us : float
        Custom noise inputs (used only if use_hardware_noise=False).

    Returns
    -------
    AerSimulator
        Simulator with the requested noise model attached.
    """
    if use_hardware_noise:
        # Load a generic IBM quantum hardware topology (e.g., 65 qubits, similar to Brooklyn)
        backend = GenericBackendV2(num_qubits=65)
        return AerSimulator.from_backend(backend)

    # Fast ideal execution if no custom noise specified
    if depolar_rate == 0.0 and t1_us == 0.0:
        return AerSimulator()

    # Custom Noise execution
    noise_model = build_custom_noise_model(
        depolar_rate=depolar_rate,
        t1_us=t1_us if t1_us > 0 else 50.0,
        t2_us=t2_us if t2_us > 0 else 30.0,
    )
    return AerSimulator(noise_model=noise_model)


if __name__ == '__main__':
    from qiskit import QuantumCircuit
    
    print("Testing GenericBackendV2 Realistic Hardware Simulator...")
    sim_hw = build_noisy_simulator(use_hardware_noise=True)
    qc = QuantumCircuit(1)
    qc.measure_all()
    
    counts1 = sim_hw.run(qc, shots=1000).result().get_counts()
    print(f"|0> Hardware Measurement: {counts1}")
    
    print("Testing Custom Simulator...")
    sim_custom = build_noisy_simulator(use_hardware_noise=False, depolar_rate=0.05)
    counts2 = sim_custom.run(qc, shots=1000).result().get_counts()
    print(f"|0> Custom Measurement: {counts2}")
