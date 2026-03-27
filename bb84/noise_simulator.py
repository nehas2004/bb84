"""
noise_simulator.py — Real-World Noise Model Factory for BB84 Simulation

Provides utilities to build Qiskit AerSimulator noise models that replicate
physical phenomena in fiber-optic quantum channels:

1. Depolarizing noise  — random Pauli errors on gate execution (models photon scattering)
2. Thermal relaxation  — T1 (amplitude damping) and T2 (dephasing) decay (models photon decay)

These are combined into a single NoiseModel that can be attached to AerSimulator
when Bob measures qubits, giving realistic QBER distributions that match real
IBM Quantum hardware behavior.
"""

from qiskit_aer.noise import (
    NoiseModel,
    depolarizing_error,
    thermal_relaxation_error,
)
from qiskit_aer import AerSimulator


def build_noise_model(depolar_rate: float = 0.0,
                      t1_us: float = 50.0,
                      t2_us: float = 30.0,
                      gate_time_ns: float = 50.0) -> NoiseModel:
    """
    Build a composite Qiskit NoiseModel.

    Parameters
    ----------
    depolar_rate : float
        Probability (0–1) of a random Pauli error after each single-qubit gate.
        Typical real hardware: 0.001–0.02.
    t1_us : float
        Qubit energy relaxation time T1 in microseconds.
        Typical: 50–200 µs on superconducting qubits.
    t2_us : float
        Qubit dephasing time T2 in microseconds. Must be ≤ 2*T1.
    gate_time_ns : float
        Gate duration in nanoseconds. Used to compute error probability from T1/T2.

    Returns
    -------
    NoiseModel
        A Qiskit noise model that can be passed to AerSimulator(noise_model=...).
    """
    noise_model = NoiseModel()

    single_qubit_gates = ['x', 'h', 'id', 'u1', 'u2', 'u3']

    # --- Depolarizing error ---
    if depolar_rate > 0.0:
        depolar_err = depolarizing_error(depolar_rate, 1)
        noise_model.add_all_qubit_quantum_error(depolar_err, single_qubit_gates)

    # --- Thermal relaxation (T1/T2 decay) ---
    # Only add if positive and physically valid T2 <= 2*T1
    if t1_us > 0 and t2_us > 0 and t2_us <= 2 * t1_us:
        t1_ns = t1_us * 1_000  # convert to nanoseconds
        t2_ns = t2_us * 1_000
        thermal_err = thermal_relaxation_error(t1_ns, t2_ns, gate_time_ns)
        noise_model.add_all_qubit_quantum_error(thermal_err, single_qubit_gates)

    return noise_model


def build_noisy_simulator(depolar_rate: float = 0.0,
                           t1_us: float = 0.0,
                           t2_us: float = 0.0) -> AerSimulator:
    """
    Convenience function: build and return a noisy AerSimulator.

    Parameters
    ----------
    depolar_rate : float
        Depolarizing error probability per gate (0 = no noise).
    t1_us : float
        T1 relaxation time in µs (0 = skip thermal noise).
    t2_us : float
        T2 dephasing time in µs (0 = skip thermal noise).

    Returns
    -------
    AerSimulator
        Simulator with the requested noise model attached, or ideal if all zero.
    """
    if depolar_rate == 0.0 and t1_us == 0.0:
        return AerSimulator()  # Ideal (fast)

    noise_model = build_noise_model(
        depolar_rate=depolar_rate,
        t1_us=t1_us if t1_us > 0 else 50.0,
        t2_us=t2_us if t2_us > 0 else 30.0,
    )
    return AerSimulator(noise_model=noise_model)


# ---------------------------------------------------------------------------
# Quick smoke-test
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    from qiskit import QuantumCircuit

    print("Testing noise_simulator.py...")

    # Build a noisy simulator at 5% depolarizing rate
    sim = build_noisy_simulator(depolar_rate=0.05, t1_us=50, t2_us=30)

    # Measure a |0> state — ideal result should always be 0,
    # but with noise we'll sometimes get 1
    qc = QuantumCircuit(1)
    qc.measure_all()

    results = sim.run(qc, shots=100).result()
    counts = results.get_counts()
    print(f"Noisy |0> measurement (100 shots): {counts}")

    errors = counts.get('1', 0)
    print(f"Errors: {errors}/100 = {errors}%   (expected ~5% with depolar=0.05)")
    print("Noise model smoke test complete ✓")
