// @ts-nocheck
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChunkResult {
    chunk_index: number;
    original: number[];
    received: number[];
    passes: boolean;
    flipped_index: number | null;
    expected_ghost: number;
    received_ghost: number;
}

interface VerifyResult {
    verified_chunks: ChunkResult[];
    healed_key: number[];
    tampered_blocks: number[];
    total_chunks: number;
    passing_chunks: number;
    bits_saved: number;
    bits_original: number;
    efficiency_pct: number;
    std_bb84_pct: number;
    eve_was_active: boolean;
    flipped_count: number;
}

interface RunResult {
    raw_bits: number[];
    raw_length: number;
    chunks: { chunk_index: number; data: number[]; ghost: number; encoded: number[] }[];
    verify_result: VerifyResult;
    healed_key: number[];
    healed_length: number;
    eve_flip_rate: number;
    verdict: string;
}

// ─── Small visual helpers ─────────────────────────────────────────────────────

const Bit: React.FC<{
    val: number;
    ghost?: boolean;
    flipped?: boolean;
    dim?: boolean;
}> = ({ val, ghost = false, flipped = false, dim = false }) => (
    <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: dim ? 0.35 : 1 }}
        style={{
            width: 34,
            height: 34,
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 15,
            fontFamily: 'monospace',
            border: flipped ? '2px solid #ef4444' : ghost ? '2px solid #a855f7' : '2px solid transparent',
            background: ghost
                ? 'rgba(168,85,247,0.18)'
                : val === 1
                ? 'rgba(16,185,129,0.18)'
                : 'rgba(99,102,241,0.18)',
            color: ghost ? '#a855f7' : val === 1 ? '#10b981' : '#6366f1',
            position: 'relative',
            flexShrink: 0,
            transition: 'all 0.2s ease',
        }}
    >
        {val}
        {flipped && (
            <span style={{
                position: 'absolute', top: -8, right: -8, fontSize: 9,
                background: '#ef4444', color: '#fff', borderRadius: 4,
                padding: '1px 3px', fontWeight: 700, lineHeight: 1,
            }}>EVE</span>
        )}
        {ghost && (
            <span style={{
                position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
                fontSize: 8, color: '#a855f7', fontWeight: 700, whiteSpace: 'nowrap',
            }}>👻</span>
        )}
    </motion.div>
);

const ChunkCard: React.FC<{ chunk: ChunkResult; idx: number }> = ({ chunk, idx }) => {
    const delay = idx * 0.06;
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay, duration: 0.3 }}
            style={{
                borderRadius: 12,
                border: `1px solid ${chunk.passes ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
                background: chunk.passes ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
            }}
        >
            {/* Block number */}
            <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: chunk.passes
                    ? 'linear-gradient(135deg,#10b981,#059669)'
                    : 'linear-gradient(135deg,#ef4444,#dc2626)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 13, color: '#fff', flexShrink: 0,
            }}>
                {chunk.chunk_index}
            </div>

            {/* Received bits */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {chunk.received.slice(0, 3).map((b, i) => (
                    <Bit
                        key={i}
                        val={b}
                        flipped={chunk.flipped_index === i}
                        dim={!chunk.passes}
                    />
                ))}
                <div style={{ width: 1, height: 28, background: 'var(--border-light)', margin: '0 4px' }} />
                <Bit
                    val={chunk.received[3]}
                    ghost
                    flipped={chunk.flipped_index === 3}
                    dim={!chunk.passes}
                />
            </div>

            {/* Verdict */}
            <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{
                    fontWeight: 700, fontSize: 13,
                    color: chunk.passes ? '#10b981' : '#ef4444',
                }}>
                    {chunk.passes ? '✅ PASS — Parity OK' : '❌ COMPROMISED — Parity Mismatch'}
                </div>
                {!chunk.passes && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        Expected ghost: <b>{chunk.expected_ghost}</b> · Got: <b>{chunk.received_ghost}</b>
                        {chunk.flipped_index !== null && (
                            <> · Eve flipped bit #{chunk.flipped_index}</>
                        )}
                    </div>
                )}
                {chunk.passes && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        Data bits kept: <b>{chunk.received.slice(0,3).join('')}</b>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const GhostBitTrap: React.FC = () => {
    const [aliceKey, setAliceKey] = useState<number[] | null>(null);
    const [keyLoading, setKeyLoading] = useState(false);
    const [keyError, setKeyError] = useState('');
    const [eveRate, setEveRate] = useState(0);
    const [result, setResult] = useState<RunResult | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');

    // Fetch Alice's current shared key from backend
    const fetchAliceKey = async () => {
        setKeyLoading(true);
        setKeyError('');
        setResult(null);
        try {
            const res = await axios.get('/api/alice/key_status');
            const key = res.data.sharedKey;
            const keyLen = res.data.keyLength ?? (key ? key.length : 0);
            if (!key || keyLen < 3) {
                setAliceKey(null);
                setKeyError(
                    keyLen > 0 && keyLen < 3
                        ? `Key too short (${keyLen} bit). Need at least 3 bits for one Ghost-Bit block. Run a longer BB84 exchange.`
                        : 'No quantum key found. Please complete a BB84 key exchange in Quantum Lab first (generate → measure → sift → verify).'
                );
            } else {
                setAliceKey(key);
            }
        } catch {
            setKeyError('Could not reach backend.');
        } finally {
            setKeyLoading(false);
        }
    };

    const handleRun = async () => {
        if (!aliceKey) return;
        setRunning(true);
        setError('');
        try {
            const res = await axios.post('/api/ghost_bit/run', {
                key_bits: aliceKey,
                eve_flip_rate: eveRate / 100,
            });
            setResult(res.data);
        } catch (e: any) {
            setError(e.response?.data?.error || 'Failed to run simulation');
        } finally {
            setRunning(false);
        }
    };

    const vr = result?.verify_result;

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: 24,
            height: '100%', overflowY: 'auto', padding: '32px 0',
        }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 28 }}>👻</span> Ghost-Bit Trap
                        <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                            background: 'rgba(168,85,247,0.15)', color: '#a855f7',
                            border: '1px solid rgba(168,85,247,0.3)', letterSpacing: '0.5px',
                        }}>SELF-HEALING BB84</span>
                    </h2>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 14, maxWidth: 620, lineHeight: 1.6 }}>
                        Alice adds one parity "ghost bit" per 3 data bits. If Eve tampers with a chunk, the parity check fails and <em>only that 4-bit block</em> is discarded — the rest of the key is preserved.
                    </p>
                </div>
            </div>

            {/* ── How It Works ── */}
            <div className="card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    📐 The Math
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {[
                        { icon: '🔢', title: 'Data Bits', body: 'Alice sends 3 real data bits per block. These carry the actual key.' },
                        { icon: '👻', title: 'Ghost Bit = Parity', body: 'The 4th bit = (b₀ ⊕ b₁ ⊕ b₂). It looks like any other bit to Eve.' },
                        { icon: '🕵️', title: "Eve's Dilemma", body: 'Eve has no way to know which bit is the ghost, so any flip breaks the parity math.' },
                        { icon: '🩹', title: 'Self-Healing', body: 'Only the tampered 4-bit block is discarded. All clean blocks form the key.' },
                    ].map(c => (
                        <div key={c.title} style={{
                            padding: '14px 16px', borderRadius: 10,
                            background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)',
                        }}>
                            <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>{c.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{c.body}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Controls ── */}
            <div className="card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16 }}>
                    ⚙️ Simulation Controls
                </div>

                {/* Step A: Load Alice's Key */}
                <div style={{ marginBottom: 20, padding: '16px', borderRadius: 10, border: '1px solid var(--border-light)', background: 'var(--bg-sidebar)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
                        Step 1 — Load BB84 Key from Quantum Lab
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={fetchAliceKey}
                            disabled={keyLoading}
                            style={{
                                padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                color: '#fff', fontWeight: 700, fontSize: 13,
                                opacity: keyLoading ? 0.6 : 1,
                            }}
                        >
                            {keyLoading ? '⏳ Loading…' : '🔑 Load Alice\'s Key'}
                        </motion.button>

                        {aliceKey && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                style={{
                                    padding: '8px 14px', borderRadius: 8,
                                    background: 'rgba(16,185,129,0.08)',
                                    border: '1px solid rgba(16,185,129,0.3)',
                                    fontSize: 13, color: '#10b981', fontWeight: 600,
                                }}
                            >
                                ✅ {aliceKey.length}-bit BB84 key loaded
                            </motion.div>
                        )}
                    </div>
                    {keyError && (
                        <div style={{ marginTop: 10, color: '#f59e0b', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>⚠️</span> {keyError}
                        </div>
                    )}
                    {!aliceKey && !keyError && (
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                            Go to <strong>Quantum Lab → Alice panel</strong>, generate qubits, measure, sift and verify — then come back here.
                        </div>
                    )}
                </div>

                {/* Step B: Eve rate + Run */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                            Step 2 — Eve's Interception Rate: <span style={{ color: eveRate > 0 ? '#ef4444' : '#10b981', fontWeight: 800 }}>{eveRate}%</span>
                        </label>
                        <input
                            type="range" min={0} max={100} step={10}
                            value={eveRate}
                            onChange={e => setEveRate(Number(e.target.value))}
                            disabled={!aliceKey}
                            style={{ width: '100%', accentColor: eveRate > 0 ? '#ef4444' : '#6366f1', opacity: aliceKey ? 1 : 0.4 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            <span>0% (No Eve)</span><span>100% (Full Tap)</span>
                        </div>
                    </div>

                    <motion.button
                        whileHover={{ scale: aliceKey ? 1.03 : 1 }}
                        whileTap={{ scale: aliceKey ? 0.96 : 1 }}
                        onClick={handleRun}
                        disabled={!aliceKey || running}
                        style={{
                            padding: '12px 28px', borderRadius: 10, border: 'none',
                            cursor: aliceKey ? 'pointer' : 'not-allowed',
                            background: aliceKey
                                ? 'linear-gradient(135deg, #a855f7, #7c3aed)'
                                : 'var(--bg-sidebar)',
                            color: aliceKey ? '#fff' : 'var(--text-muted)',
                            fontWeight: 700, fontSize: 14,
                            opacity: (!aliceKey || running) ? 0.5 : 1,
                            border: aliceKey ? 'none' : '1px solid var(--border-light)',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {running ? '⏳ Running…' : '👻 Run Ghost-Bit Trap'}
                    </motion.button>
                </div>
                {error && <div style={{ marginTop: 12, color: '#ef4444', fontSize: 13 }}>{error}</div>}
            </div>

            <AnimatePresence>
                {result && vr && (
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
                    >
                        {/* ── Raw Bits Display ── */}
                        <div className="card" style={{ padding: '20px 24px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
                                Step 1 — Raw Key Bits ({result.raw_length} bits)
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {result.raw_bits.map((b, i) => (
                                    <Bit key={i} val={b} />
                                ))}
                            </div>
                        </div>

                        {/* ── Encoded Chunks Display ── */}
                        <div className="card" style={{ padding: '20px 24px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Step 2 — Encoded with Ghost Bits ({result.chunks.length} blocks of 4)
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
                                Purple = ghost bit (👻). It equals (b₀ ⊕ b₁ ⊕ b₂). Eve sees all 4 bits identically.
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                {result.chunks.map((chunk, ci) => (
                                    <motion.div
                                        key={ci}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: ci * 0.07 }}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                            padding: '12px 14px', borderRadius: 10,
                                            border: '1px solid var(--border-light)',
                                            background: 'var(--bg-sidebar)',
                                        }}
                                    >
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                                            Block {chunk.chunk_index}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            {chunk.data.map((b, bi) => <Bit key={bi} val={b} />)}
                                            <div style={{ width: 1, height: 24, background: 'var(--border-light)', margin: '0 2px' }} />
                                            <Bit val={chunk.ghost} ghost />
                                        </div>
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                            {chunk.data.join('')} | 👻{chunk.ghost}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* ── Block Verification Results ── */}
                        <div className="card" style={{ padding: '20px 24px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Step 3 — Block-by-Block Verification
                                {vr.eve_was_active && (
                                    <span style={{
                                        marginLeft: 12, fontSize: 11, padding: '2px 10px',
                                        borderRadius: 99, background: 'rgba(239,68,68,0.12)',
                                        color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                                        fontWeight: 700,
                                    }}>
                                        ⚠️ Eve Active — {vr.flipped_count}/{vr.total_chunks} blocks intercepted
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                                {vr.verified_chunks.map((chunk, i) => (
                                    <ChunkCard key={i} chunk={chunk} idx={i} />
                                ))}
                            </div>
                        </div>

                        {/* ── Self-Healing Stats + Comparison ── */}
                        <div className="card" style={{ padding: '20px 24px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16 }}>
                                Step 4 — Self-Healing Result & Comparison
                            </div>

                            {/* Verdict banner */}
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    padding: '14px 18px', borderRadius: 10, marginBottom: 20,
                                    background: vr.tampered_blocks.length === 0
                                        ? 'rgba(16,185,129,0.08)'
                                        : 'rgba(168,85,247,0.08)',
                                    border: `1px solid ${vr.tampered_blocks.length === 0
                                        ? 'rgba(16,185,129,0.3)'
                                        : 'rgba(168,85,247,0.3)'}`,
                                    fontSize: 13, fontWeight: 600,
                                    color: vr.tampered_blocks.length === 0 ? '#10b981' : '#a855f7',
                                    lineHeight: 1.5,
                                }}
                            >
                                {vr.tampered_blocks.length === 0
                                    ? '🔒 ' + result.verdict
                                    : '🩹 ' + result.verdict}
                            </motion.div>

                            {/* Stats grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                                {[
                                    { label: 'Total Blocks', val: vr.total_chunks, color: 'var(--text-primary)' },
                                    { label: 'Clean Blocks', val: vr.passing_chunks, color: '#10b981' },
                                    { label: 'Compromised', val: vr.tampered_blocks.length, color: vr.tampered_blocks.length > 0 ? '#ef4444' : 'var(--text-muted)' },
                                    { label: 'Bits Recovered', val: `${vr.bits_saved} / ${vr.bits_original}`, color: '#a855f7' },
                                    { label: 'Ghost-Bit Efficiency', val: `${vr.efficiency_pct}%`, color: '#10b981' },
                                    { label: 'Std BB84 Efficiency', val: `${vr.std_bb84_pct}%`, color: vr.std_bb84_pct === 0 ? '#ef4444' : '#10b981' },
                                ].map(stat => (
                                    <div key={stat.label} style={{
                                        padding: '12px 14px', borderRadius: 10,
                                        background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)',
                                    }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                                            {stat.label}
                                        </div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>
                                            {stat.val}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Comparison bar */}
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
                                Efficiency Comparison
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {/* Ghost-Bit bar */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                                        <span>👻 Ghost-Bit Trap (This Invention)</span>
                                        <span style={{ fontWeight: 700, color: '#a855f7' }}>{vr.efficiency_pct}%</span>
                                    </div>
                                    <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-sidebar)', overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${vr.efficiency_pct}%` }}
                                            transition={{ duration: 0.8, ease: 'easeOut' }}
                                            style={{ height: '100%', background: 'linear-gradient(90deg,#a855f7,#7c3aed)', borderRadius: 5 }}
                                        />
                                    </div>
                                </div>
                                {/* Standard BB84 bar */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                                        <span>⚡ Standard BB84</span>
                                        <span style={{ fontWeight: 700, color: vr.std_bb84_pct === 0 ? '#ef4444' : '#10b981' }}>{vr.std_bb84_pct}%</span>
                                    </div>
                                    <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-sidebar)', overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${vr.std_bb84_pct}%` }}
                                            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                                            style={{ height: '100%', background: vr.std_bb84_pct === 0 ? '#ef4444' : '#10b981', borderRadius: 5 }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {vr.tampered_blocks.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    style={{
                                        marginTop: 16, padding: '12px 16px', borderRadius: 8,
                                        background: 'rgba(168,85,247,0.06)',
                                        border: '1px solid rgba(168,85,247,0.2)',
                                        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
                                    }}
                                >
                                    <strong style={{ color: '#a855f7' }}>🩹 Self-Healing in Action:</strong> Standard BB84 would have thrown away
                                    all <strong>{vr.bits_original}</strong> bits and declared the key compromised.
                                    Ghost-Bit Trap <strong style={{ color: '#10b981' }}>saved {vr.bits_saved} bits</strong> ({vr.efficiency_pct}%)
                                    by pinpointing and discarding only the {vr.tampered_blocks.length} corrupted
                                    block{vr.tampered_blocks.length !== 1 ? 's' : ''}.
                                </motion.div>
                            )}

                            {/* Healed Key display */}
                            {result.healed_key.length > 0 && (
                                <div style={{ marginTop: 20 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                        Healed Key ({result.healed_length} bits)
                                    </div>
                                    <div style={{
                                        fontFamily: 'monospace', fontSize: 13,
                                        background: 'var(--bg-sidebar)', borderRadius: 8,
                                        padding: '10px 14px', wordBreak: 'break-all',
                                        border: '1px solid rgba(168,85,247,0.3)',
                                        color: '#a855f7', letterSpacing: '3px',
                                    }}>
                                        {result.healed_key.join('')}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default GhostBitTrap;
