// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionStatus {
    round_num: number;
    has_seed: boolean;
    bias: number;
    key_length: number;
}

interface ActivityEntry {
    id: string;
    round_num: number;
    bias_used: number;
    message: string;
    encrypted_hex: string;
    final_key_length: number;
    sifted_length: number;
    qber: number;
    errors: number;
    basis_dist: { total: number; diagonal: number; rect: number; pct_diag: number };
    key_metrics: { entropy: number; efficiency: number; correlation: number };
    execution_ms: number;
    expanded: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const biasColor = (bias: number) => {
    const dist = Math.abs(bias - 0.5);  // 0 = perfectly balanced, 0.4 = max
    const t = dist / 0.4;               // normalise to [0,1]
    // Interpolate: grey(0.5) → teal/green(>0≠0.5)
    const r = Math.round(100 + (16 - 100) * t);
    const g = Math.round(116 + (185 - 116) * t);
    const b = Math.round(139 + (129 - 139) * t);
    return `rgb(${r},${g},${b})`;
};

const uid = () => Math.random().toString(36).slice(2);

// ─── Sub-components ──────────────────────────────────────────────────────────

const BiasGauge: React.FC<{ bias: number }> = ({ bias }) => {
    const pct = Math.round(bias * 100);
    const color = biasColor(bias);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                <span>Rectilinear (+)</span>
                <span style={{ fontWeight: 700, color, fontSize: 14 }}>{100 - pct}% / {pct}%</span>
                <span>Diagonal (×)</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-sidebar)', overflow: 'hidden', position: 'relative' }}>
                {/* Left segment */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${100 - pct}%`, background: '#6366f1', borderRadius: '5px 0 0 5px', transition: 'width 0.5s ease' }} />
                {/* Right segment */}
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: '0 5px 5px 0', transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                Basis bias derived from previous key · {pct === 50 ? 'Balanced (Bootstrap)' : `Skewed ${pct > 50 ? 'diagonal' : 'rectilinear'}`}
            </div>
        </div>
    );
};

const BasisBar: React.FC<{ dist: ActivityEntry['basis_dist'] }> = ({ dist }) => {
    if (!dist) return null;
    const pctD = dist.pct_diag;
    const pctR = 100 - pctD;
    return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80 }}>Basis split</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-sidebar)', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${pctR}%`, background: '#6366f1', transition: 'width 0.4s' }} />
                <div style={{ width: `${pctD}%`, background: '#10b981', transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80, textAlign: 'right' }}>
                {pctR.toFixed(0)}% + {pctD.toFixed(0)}%
            </span>
        </div>
    );
};

const PurgedBadge: React.FC = () => (
    <motion.span
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 99,
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.3)',
            color: '#10b981', fontSize: 11, fontWeight: 600,
        }}
    >
        🗑 K&#8345;₋₁ purged
    </motion.span>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const RecursiveBB84: React.FC = () => {
    const [status, setStatus] = useState<SessionStatus | null>(null);
    const [message, setMessage] = useState('');
    const [log, setLog] = useState<ActivityEntry[]>([]);
    const [seeding, setSeeding] = useState(false);
    const [sending, setSending] = useState(false);
    const [seedError, setSeedError] = useState('');
    const [sendError, setSendError] = useState('');
    const [seedFlash, setSeedFlash] = useState(false);
    const logEndRef = useRef<HTMLDivElement>(null);

    const pollStatus = async () => {
        try {
            const res = await axios.get('/api/recursive/status');
            setStatus(res.data);
        } catch { }
    };

    useEffect(() => {
        pollStatus();
        const t = setInterval(pollStatus, 4000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [log]);

    const handlePlantSeed = async () => {
        setSeeding(true);
        setSeedError('');
        try {
            const res = await axios.post('/api/recursive/plant_seed', {});
            if (res.data.error) { setSeedError(res.data.error); return; }
            await pollStatus();
            setSeedFlash(true);
            setTimeout(() => setSeedFlash(false), 1500);
        } catch (e: any) {
            setSeedError(e.response?.data?.error || 'Failed to plant seed');
        } finally {
            setSeeding(false);
        }
    };

    const handleSend = async () => {
        if (!message.trim()) return;
        setSending(true);
        setSendError('');
        try {
            const res = await axios.post('/api/recursive/send_message', { message: message.trim(), length: 40 });
            if (res.data.error) { setSendError(res.data.error); return; }
            const d = res.data;
            const entry: ActivityEntry = {
                id: uid(),
                round_num: d.round_num,
                bias_used: d.bias_used,
                message: d.message,
                encrypted_hex: d.encrypted_hex,
                final_key_length: d.final_key_length,
                sifted_length: d.sifted_length,
                qber: d.qber,
                errors: d.errors,
                basis_dist: d.basis_dist,
                key_metrics: d.key_metrics,
                execution_ms: d.execution_ms,
                expanded: true,
            };
            setLog(prev => [...prev, entry]);
            setMessage('');
            await pollStatus();
        } catch (e: any) {
            setSendError(e.response?.data?.error || 'Send failed');
        } finally {
            setSending(false);
        }
    };

    const toggleExpand = (id: string) =>
        setLog(prev => prev.map(e => e.id === id ? { ...e, expanded: !e.expanded } : e));

    const bias = status?.bias ?? 0.5;
    const hasSeed = status?.has_seed ?? false;
    const roundNum = status?.round_num ?? 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%', overflowY: 'auto', padding: '32px 0' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 28 }}>🔁</span> Recursive BB84
                    </h2>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
                        Each message is encrypted with a fresh quantum key whose basis bias is derived from the previous key — a secret only Alice &amp; Bob share.
                    </p>
                </div>
                <div style={{
                    display: 'flex', flexdirection: 'column', alignItems: 'flex-end', gap: 4,
                    padding: '10px 18px', borderRadius: 10,
                    background: hasSeed ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${hasSeed ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Session</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: hasSeed ? '#10b981' : '#ef4444' }}>
                        {hasSeed ? `Round ${roundNum}` : 'No Seed'}
                    </span>
                    {hasSeed && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>K&#8345;₋₁ {status?.key_length} bits</span>
                    )}
                </div>
            </div>

            {/* ── Status Row: Bias Gauge ── */}
            <div className="card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Current Basis Bias
                </div>
                <BiasGauge bias={bias} />
            </div>

            {/* ── Seed Control ── */}
            <div className="card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Step 1 — Bootstrap Seed (K₀)
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                    Run standard BB84 key exchange from the Quantum Lab first, then plant its key as the seed below.
                    The 0/1 ratio of that key becomes the basis probability for every subsequent message.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handlePlantSeed}
                        disabled={seeding}
                        style={{
                            padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: '#fff', fontWeight: 700, fontSize: 14,
                            opacity: seeding ? 0.6 : 1,
                        }}
                    >
                        {seeding ? '⏳ Planting…' : '🌱 Plant Seed from Last BB84 Key'}
                    </motion.button>
                    <AnimatePresence>
                        {seedFlash && (
                            <motion.span
                                key="seedok"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0 }}
                                style={{ color: '#10b981', fontWeight: 600, fontSize: 13 }}
                            >
                                ✓ Seed planted! Bias = {(bias * 100).toFixed(1)}%
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>
                {seedError && <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13 }}>{seedError}</div>}
            </div>

            {/* ── Message Composer ── */}
            <div className="card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Step 2 — Send Encrypted Message
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                    Each send generates a fresh BB84 key using the current bias, encrypts the message, then purges the old key.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        placeholder={hasSeed ? 'Type your message…' : 'Plant a seed first…'}
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !sending && hasSeed && handleSend()}
                        disabled={!hasSeed || sending}
                        style={{
                            flex: 1, minWidth: 200,
                            padding: '11px 16px', borderRadius: 8,
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-sidebar)', color: 'var(--text-primary)',
                            fontSize: 14, outline: 'none',
                        }}
                    />
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSend}
                        disabled={!hasSeed || sending || !message.trim()}
                        style={{
                            padding: '11px 28px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#fff', fontWeight: 700, fontSize: 14,
                            opacity: (!hasSeed || sending || !message.trim()) ? 0.4 : 1,
                        }}
                    >
                        {sending ? '⏳ Running BB84…' : '🔐 Encrypt & Send'}
                    </motion.button>
                </div>
                {sendError && <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13 }}>{sendError}</div>}
            </div>

            {/* ── Activity Log ── */}
            <div className="card" style={{ padding: '20px 24px', flex: 1 }}>
                <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
                    marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
                }}>
                    📋 Activity Log
                    <span style={{
                        background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)',
                        borderRadius: 99, padding: '2px 10px', fontSize: 12, color: 'var(--text-muted)'
                    }}>{log.length} round{log.length !== 1 ? 's' : ''}</span>
                </div>

                {log.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                        No messages yet. Plant a seed and send your first message.
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <AnimatePresence>
                        {log.map((entry, idx) => (
                            <motion.div
                                key={entry.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                style={{
                                    borderRadius: 10,
                                    border: '1px solid var(--border-light)',
                                    background: 'var(--bg-sidebar)',
                                    overflow: 'hidden',
                                }}
                            >
                                {/* Row header */}
                                <div
                                    onClick={() => toggleExpand(entry.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '12px 16px', cursor: 'pointer',
                                        userSelect: 'none',
                                    }}
                                >
                                    {/* Round badge */}
                                    <div style={{
                                        minWidth: 32, height: 32, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 800, fontSize: 13, color: '#fff',
                                    }}>
                                        {entry.round_num}
                                    </div>

                                    {/* Message preview */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            "{entry.message}"
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                            Bias: <span style={{ color: biasColor(entry.bias_used), fontWeight: 600 }}>{(entry.bias_used * 100).toFixed(1)}%</span>
                                            &ensp;·&ensp;Key: {entry.final_key_length} bits
                                            &ensp;·&ensp;QBER: {entry.qber.toFixed(1)}%
                                            &ensp;·&ensp;{entry.execution_ms}ms
                                        </div>
                                    </div>

                                    {/* Purge badge */}
                                    <PurgedBadge />

                                    {/* Expand toggle */}
                                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                        {entry.expanded ? '▲' : '▼'}
                                    </span>
                                </div>

                                {/* Expanded details */}
                                <AnimatePresence>
                                    {entry.expanded && (
                                        <motion.div
                                            key="details"
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                                {/* Divider */}
                                                <div style={{ height: 1, background: 'var(--border-light)' }} />

                                                {/* Basis distribution bar */}
                                                <BasisBar dist={entry.basis_dist} />

                                                {/* Metrics grid */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                                                    {[
                                                        { label: 'Bias Used', val: `${(entry.bias_used * 100).toFixed(1)}%` },
                                                        { label: 'Qubits Sent', val: entry.basis_dist?.total ?? '—' },
                                                        { label: 'Sifted Bits', val: entry.sifted_length },
                                                        { label: 'Final Key', val: `${entry.final_key_length} bits` },
                                                        { label: 'QBER', val: `${entry.qber.toFixed(1)}%`, warn: entry.qber > 5 },
                                                        { label: 'Entropy', val: entry.key_metrics?.entropy?.toFixed(3) ?? '—' },
                                                        { label: 'Efficiency', val: `${entry.key_metrics?.efficiency?.toFixed(1) ?? '—'}%` },
                                                        { label: 'Time', val: `${entry.execution_ms}ms` },
                                                    ].map(m => (
                                                        <div key={m.label} style={{
                                                            padding: '10px 12px', borderRadius: 8,
                                                            background: 'var(--bg-card)', border: '1px solid var(--border-light)'
                                                        }}>
                                                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                                {m.label}
                                                            </div>
                                                            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: (m as any).warn ? '#f59e0b' : 'var(--text-primary)' }}>
                                                                {m.val}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Encrypted output */}
                                                <div>
                                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                        Ciphertext (XOR with K{entry.round_num})
                                                    </div>
                                                    <div style={{
                                                        fontFamily: 'monospace', fontSize: 12,
                                                        background: 'var(--bg-card)', borderRadius: 6,
                                                        padding: '10px 14px', wordBreak: 'break-all',
                                                        border: '1px solid var(--border-light)', color: '#10b981',
                                                        lineHeight: 1.6, letterSpacing: '0.5px',
                                                    }}>
                                                        {entry.encrypted_hex}
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    <div ref={logEndRef} />
                </div>
            </div>
        </div>
    );
};

export default RecursiveBB84;
