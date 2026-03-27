
import random
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
import sys
import os

# Add current directory to path so we can import modules
sys.path.append(os.getcwd())

from randomkey import generate_masked_key
from bob import Bob

def run_test(name, alice_bit, alice_basis, bob_basis, expected_rate_0, num_runs=100):
    print(f"\n--- Test: {name} ---")
    print(f"Alice sends Bit={alice_bit}, Basis={'Rect' if alice_basis==0 else 'Diag'}")
    print(f"Bob measures in Basis={'Rect' if bob_basis==0 else 'Diag'}")
    
    results = []
    bob = Bob() # To use its simulator logic (though we might just call measure directly if exposed)
    
    # We can't reuse bob.measure_qubits exactly because it generates random bases.
    # We need a specific measure function for the test or force the basis.
    # Let's write a targeted measure function using the same logic as Bob.
    
    simulator = AerSimulator()
    
    for _ in range(num_runs):
        # 1. Alice Encode
        qc = QuantumCircuit(1, 1)
        if alice_basis == 0: # Rectilinear
            if alice_bit == 1:
                qc.x(0)
        else: # Diagonal
            if alice_bit == 0:
                qc.h(0)
            else:
                qc.x(0)
                qc.h(0)
                
        # 2. Bob Measure
        measure_qc = qc.copy()
        if bob_basis == 1: # Diagonal
            measure_qc.h(0)
            
        # measure_all adds a new register. let's use the existing one if present, 
        # or just take the first char of the result string. 
        # actually, QuantumCircuit(1, 1) has a clbit. 
        # measure_all might have created a second one.
        # Let's just measure qubit 0 to clbit 0.
        measure_qc.measure(0, 0)
        
        # 3. Simulate
        result = simulator.run(measure_qc, shots=1, memory=True).result()
        measured_bit_str = result.get_memory()[0]
        # It might be '1' or '0'. If multiple registers, '1 0' etc.
        # We just want the first bit (or the only bit if we fixed it).
        measured_bit = int(measured_bit_str.split()[0]) 
        results.append(measured_bit)
        
    zeros = results.count(0)
    ones = results.count(1)
    
    print(f"Results: 0s={zeros}, 1s={ones}")
    
    success = False
    if expected_rate_0 == 1.0:
        if zeros == num_runs: success = True
    elif expected_rate_0 == 0.5:
        # Allow some variance, e.g. 40-60
        if 35 <= zeros <= 65: success = True
        
    print(f"Test {'PASSED' if success else 'FAILED'}")
    return success

if __name__ == "__main__":
    print("Running Quantum Channel Verification...")
    
    # Test 1: Same basis (Rectilinear), Bit 0 -> Should be 0
    t1 = run_test("Same Basis (Rect, 0)", alice_bit=0, alice_basis=0, bob_basis=0, expected_rate_0=1.0)
    
    # Test 2: Different basis (Alice Diag |+>, Bob Rect) -> Should be random
    t2 = run_test("Diff Basis (Alice Diag 0, Bob Rect)", alice_bit=0, alice_basis=1, bob_basis=0, expected_rate_0=0.5)
    
    if t1 and t2:
        print("\nAll verification tests passed!")
    else:
        print("\nSome tests failed.")
