"""
recursive_session.py
--------------------
Holds the per-session state for the Recursive BB84 protocol.

One global RecursiveSession instance lives in app.py.
The seed key K_{n-1} is stored in plain RAM (list of ints) and is
zeroed-out deterministically the moment K_n is safely generated.
"""

import ctypes
import sys


class RecursiveSession:
    """
    Tracks the rolling seed key and round counter for Recursive BB84.

    Lifecycle per message send:
        1. get_seed_and_purge()  -- fetch K_{n-1}, wipe it from this object
        2. [run biased BB84 to produce K_n]
        3. plant_seed(K_n)       -- store K_n; K_{n-1} is already gone
    """

    def __init__(self):
        self._seed_key: list[int] | None = None   # K_{n-1}
        self.round_num: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def plant_seed(self, key_bits: list[int]) -> None:
        """Store key_bits as the current seed (overwrites any previous seed)."""
        if not key_bits:
            raise ValueError("Cannot plant an empty seed key")
        self._seed_key = list(key_bits)   # defensive copy
        self.round_num += 1
        print(f"[RecursiveSession] Seed planted. Round={self.round_num}, "
              f"key_len={len(self._seed_key)}, bias={self.get_bias():.2f}")

    def get_seed_and_purge(self) -> list[int] | None:
        """
        Return the current seed key and immediately purge it from RAM.
        The caller MUST use the returned value before calling plant_seed().
        Returns None if no seed has been planted yet.
        """
        key = self._seed_key
        self._purge()
        return key

    def peek_bias(self) -> float | None:
        """Return the bias that WOULD be derived from the current seed, without purging."""
        if self._seed_key is None or len(self._seed_key) == 0:
            return None
        raw = sum(self._seed_key) / len(self._seed_key)
        return max(0.10, min(0.90, raw))

    def get_bias(self) -> float:
        """Same as peek_bias() but returns 0.50 if no seed."""
        b = self.peek_bias()
        return b if b is not None else 0.50

    @property
    def has_seed(self) -> bool:
        return self._seed_key is not None

    @property
    def key_length(self) -> int:
        return len(self._seed_key) if self._seed_key else 0

    def to_status_dict(self) -> dict:
        return {
            "round_num":   self.round_num,
            "has_seed":    self.has_seed,
            "bias":        round(self.get_bias(), 4),
            "key_length":  self.key_length,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _purge(self) -> None:
        """Best-effort in-process memory wipe of the seed key list."""
        if self._seed_key is None:
            return
        # Overwrite list elements with zeros before releasing the reference.
        # CPython keeps list elements as pointers to int objects; setting to 0
        # replaces each pointer, allowing GC to reclaim the original ints.
        for i in range(len(self._seed_key)):
            self._seed_key[i] = 0
        self._seed_key = None
        print("[RecursiveSession] Seed purged from RAM.")
