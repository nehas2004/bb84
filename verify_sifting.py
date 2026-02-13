
import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from bob import Bob

def verify_sifting():
    print("--- Verifying Basis Sifting ---")
    
    # User Example Data
    # Position:     0  1  2  3  4
    alice_bits =   [0, 1, 0, 1, 0]
    alice_bases =  [0, 1, 0, 1, 0] # 0=Rect, 1=Diag
    bob_bases =    [0, 0, 1, 1, 1] # 0=Rect, 1=Diag
    
    # Bob's measurements (Simulation)
    # Note: determining what Bob measures depends on physics, but for SIFTING logic test,
    # we just need to provide "what he measured".
    # User example says: 0  ?  ?  1  ?
    # We'll fill in the '?' with dummy values, as they should be discarded anyway.
    bob_measured = [0, 1, 0, 1, 1] 
    
    expected_sifted_key = [0, 1]
    expected_indices = [0, 3]
    
    bob = Bob()
    sifted_key, matches = bob.sift_keys(alice_bases, bob_bases, bob_measured)
    
    print(f"Alice Bases:  {alice_bases}")
    print(f"Bob Bases:    {bob_bases}")
    print(f"Bob Measured: {bob_measured}")
    print(f"\nSifted Key: {sifted_key}")
    print(f"Indices:    {matches}")
    
    if sifted_key == expected_sifted_key and matches == expected_indices:
        print("\n✅ Verification PASSED: Output matches user example exactly.")
    else:
        print("\n❌ Verification FAILED: Output does not match expected result.")
        print(f"Expected: {expected_sifted_key} at {expected_indices}")

if __name__ == "__main__":
    verify_sifting()
