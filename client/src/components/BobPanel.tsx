// @ts-nocheck
import React, { useState } from 'react';
import axios from 'axios';
import { useProject } from '../context/ProjectContext';
import { Download, ShieldCheck, AlertTriangle, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import SecurityMetrics from './SecurityMetrics';

const BobPanel: React.FC = () => {
    const {
        addLog,
        bobBits, bobBases, setBobState,
        setSharedKey,
        keyMetrics, setKeyMetrics,
        peerIP,
        noiseConfig,
        bobStep: step, setBobStep: setStep,
        siftedKey, setSiftedKey,
        matches, setMatches,
        qber, setQber,
        pHat, setPHat,
        qberSn, setQberSn,
        efficiency, setEfficiency,
        noiseStats, setNoiseStats,
        ghostResult, setGhostResult,
    } = useProject();

    const [isReceiving, setIsReceiving] = useState(false);
    const [isSifting, setIsSifting] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isGhostRunning, setIsGhostRunning] = useState(false);

    const handleFetch = async () => {
        setIsReceiving(true);
        try {
            addLog('info', 'Bob receiving qubits...');

            if (peerIP) {
                // Network Mode
                const res = await axios.post('/api/fetch_from_peer', { peer_ip: peerIP });
                if (res.data.status === 'success') {
                    setBobState(res.data.bobBases, res.data.measuredBits);
                    setNoiseStats(res.data.noiseStats || null);
                    setStep(1);
                    addLog('success', `Received ${res.data.measuredBits.length} qubits from ${peerIP}.`);
                    if (res.data.noiseStats?.dropped > 0)
                        addLog('warning', `[Packet Loss] ${res.data.noiseStats.dropped} qubits dropped.`);
                    if (res.data.noiseStats?.flips > 0)
                        addLog('warning', `[Network Noise] ${res.data.noiseStats.flips} bits flipped in transit.`);
                } else {
                    addLog('error', 'Failed to receive qubits.');
                }
            } else {
                // Local Demo Mode
                const res = await axios.post('/api/bob_measure', {});
                if (res.data.bobBases) {
                    setBobState(res.data.bobBases, res.data.measuredBits);
                    setNoiseStats(res.data.noiseStats || null);
                    setStep(1);
                    addLog('success', `Received ${res.data.measuredBits.length} qubits (Local Simulator).`);
                    if (res.data.noiseStats?.dropped > 0)
                        addLog('warning', `[Packet Loss] ${res.data.noiseStats.dropped} qubits dropped (photon loss).`);
                    if (res.data.noiseStats?.flips > 0)
                        addLog('warning', `[Network Noise] ${res.data.noiseStats.flips} qubit descriptions corrupted in transit.`);
                    if (noiseConfig.interception_density > 0)
                        addLog('warning', `[Eve] Intercept-resend active (p=${noiseConfig.interception_density.toFixed(2)}) — expect elevated QBER.`);
                    if (noiseConfig.use_hardware_noise)
                        addLog('info', `[Hardware Noise] IBM GenericBackendV2 engaged.`);
                    else if (noiseConfig.channel_noise_rate > 0)
                        addLog('info', `[Channel Noise] Custom depolarizing rate: ${(noiseConfig.channel_noise_rate * 100).toFixed(0)}%.`);
                }
            }
        } catch (err: any) {
            addLog('error', err.message || 'Fetch failed');
        } finally {
            setIsReceiving(false);
        }
    };

    const handleSift = async () => {
        setIsSifting(true);
        try {
            let aliceBasesToUse: number[] = [];

            if (peerIP) {
                addLog('info', 'Fetching Alice\'s bases from classical channel...');
                const basesRes = await axios.post('/api/fetch_peer_bases', { peer_ip: peerIP });
                aliceBasesToUse = basesRes.data.aliceBases;
                addLog('success', 'Received Alice\'s bases.');
            }

            addLog('info', 'Sifting keys...');
            const res = await axios.post('/api/sift_keys', {
                bobBases: bobBases,
                bobBits: bobBits,
                aliceBases: aliceBasesToUse,
            });

            setSiftedKey(res.data.siftedKey);
            setMatches(res.data.matches);
            setStep(2);
            addLog('success', `Sifting complete. Kept ${res.data.siftedKey.length} bits.`);
        } catch (err: any) {
            addLog('error', err.response?.data?.error || err.message);
        } finally {
            setIsSifting(false);
        }
    };

    const handleVerify = async () => {
        setIsVerifying(true);
        try {
            addLog('info', 'Sampling bits for verification...');

            let res: any;
            if (peerIP) {
                addLog('info', 'Sending sample to Alice for verification...');
                res = await axios.post('/api/verify_peer_sample', {
                    peer_ip: peerIP,
                    sifted_key: siftedKey,
                    original_matches: matches,
                });
            } else {
                const sampleRes = await axios.post('/api/sample_key', { siftedKey });
                const { sampleIndices, sampleBits, remainingKey } = sampleRes.data;

                addLog('warning', `Verifying ${sampleBits.length} bits...`);
                const compareRes = await axios.post('/api/compare_sample', {
                    sampleIndices,
                    bobSampleBits: sampleBits,
                    originalMatches: matches,
                });

                res = { data: { ...compareRes.data, remainingKey } };
            }

            const { errorCount, qber: newQber, p_hat: newPHat, p_hat, qber_sn, remainingKey, keyMetrics: newMetrics } = res.data;
            if (typeof newQber === 'number') setQber(newQber);
            if (newPHat !== undefined) setPHat(newPHat);
            else if (p_hat !== undefined) setPHat(p_hat);
            if (qber_sn !== undefined) setQberSn(qber_sn);

            if (newMetrics && Object.keys(newMetrics).length > 0) {
                setKeyMetrics(newMetrics);
                addLog('info', `[Security] Entropy: ${newMetrics.entropy?.toFixed(3)} bits | Correlation: ${newMetrics.correlation?.toFixed(3)} | Efficiency: ${newMetrics.efficiency?.toFixed(1)}%`);
            } else {
                setKeyMetrics(null);
            }

            if (res.data.verified) {
                addLog('success', `Verification Success! QBER: ${newQber?.toFixed(2)}% | Est. p_hat: ${p_hat?.toFixed(3)}`);
            } else {
                addLog('error', `QBER: ${newQber?.toFixed(2)}% (${errorCount} errors) — Est. p_hat: ${p_hat?.toFixed(3)} | Verification Failed.`);
                addLog('error', 'Aborting key exchange due to verification failure.');
                return;
            }

            setSharedKey(remainingKey);
            setEfficiency(Math.round((remainingKey.length / bobBits.length) * 100));
            setStep(3);
            addLog('success', `Key Established. Length: ${remainingKey.length} bits.`);

        } catch (err: any) {
            addLog('error', err.response?.data?.error || err.message);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleGhostBit = async () => {
        setIsGhostRunning(true);
        setGhostResult(null);
        try {
            const eveRate = noiseConfig.interception_density ?? 0;
            addLog('info', `[Ghost-Bit Trap] Encoding sifted key into 4-bit parity blocks${eveRate > 0 ? ` (Eve active at ${(eveRate * 100).toFixed(0)}%)` : ''}...`);

            // Use siftedKey directly — works even if standard BB84 verification failed
            if (!siftedKey || siftedKey.length < 3) {
                addLog('error', '[Ghost-Bit Trap] Need at least 3 sifted bits. Run Sift Keys first.');
                return;
            }

            const res = await axios.post('/api/ghost_bit/run', {
                key_bits: siftedKey,
                eve_flip_rate: eveRate,
            });
            const vr = res.data.verify_result;
            setGhostResult(res.data);
            setStep(4);

            // Adopt the healed key as the shared key — unlocks Secure Chat
            if (res.data.healed_key && res.data.healed_key.length > 0) {
                setSharedKey(res.data.healed_key);
                // Tell the backend to adopt the healed key for encryption
                await axios.post('/api/ghost_bit/adopt_key', { healed_key: res.data.healed_key });
                addLog('success', `[Ghost-Bit Trap] Healed key (${res.data.healed_length} bits) adopted as shared key. 💬 Secure Chat is now available.`);
            }

            if (vr.tampered_blocks.length === 0) {
                addLog('success', `[Ghost-Bit Trap] All ${vr.total_chunks} blocks passed parity. Healed key: ${vr.bits_saved} bits (100% efficient).`);
            } else {
                addLog('warning', `[Ghost-Bit Trap] ${vr.tampered_blocks.length}/${vr.total_chunks} blocks compromised by Eve. Self-healed key: ${vr.bits_saved} bits (${vr.efficiency_pct}%).`);
                addLog('warning', '[Ghost-Bit Trap] Standard BB84 would have discarded the entire key. Ghost-Bit Trap recovered the clean blocks.');
            }
        } catch (err: any) {
            addLog('error', err.response?.data?.error || '[Ghost-Bit Trap] Run failed.');
        } finally {
            setIsGhostRunning(false);
        }
    };

    // QBER colour helpers
    const qberColor = (q: number) => {
        if (q === 0) return 'var(--green)';
        if (q < 5) return '#6b8e23';
        if (q < 20) return 'var(--orange)';
        return 'var(--red)';
    };
    const qberLabel = (q: number) => {
        if (q === 0) return '✅ Secure';
        if (q < 5) return '🟡 Marginal';
        if (q < 20) return '⚠️ Elevated';
        return '❌ Attack Detected!';
    };

    return (
        <div className="card">
            <div className="section-title">
                <Download size={22} /> Bob (Receiver)
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', flexWrap: 'wrap' }}>
                <button
                    className="btn btn-primary"
                    onClick={handleFetch}
                    disabled={step > 0 || isReceiving}
                    style={{ padding: '0 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    {isReceiving ? <><Activity size={16} className="animate-pulse" /> Receiving...</> : '📥 Receive Qubits'}
                </button>

                <div style={{ width: '1px', background: 'var(--border-strong)', margin: '0 8px' }}></div>

                <button
                    className="btn btn-secondary"
                    onClick={handleSift}
                    disabled={step !== 1 || isSifting}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    {isSifting ? <><Activity size={16} className="animate-pulse" /> Sifting...</> : '🔍 Sift Keys'}
                </button>

                <button
                    className="btn btn-secondary"
                    onClick={handleVerify}
                    disabled={step !== 2 || isVerifying}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    {isVerifying ? <><Activity size={16} className="animate-pulse" /> Verifying...</> : '🛡️ Verify & Finalize'}
                </button>

                <button
                    onClick={handleGhostBit}
                    disabled={step < 2 || isGhostRunning}
                    title={step < 2 ? 'Sift keys first' : 'Run Ghost-Bit Trap on sifted key'}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '0 20px', borderRadius: 'var(--radius-sm)',
                        border: step >= 2 ? '1px solid rgba(168,85,247,0.5)' : '1px solid var(--border-light)',
                        background: step >= 2 ? 'rgba(168,85,247,0.1)' : 'var(--bg-sidebar)',
                        color: step >= 2 ? '#a855f7' : 'var(--text-muted)',
                        fontWeight: 700, fontSize: 14, cursor: step >= 2 ? 'pointer' : 'not-allowed',
                        opacity: step < 2 || isGhostRunning ? 0.45 : 1,
                        height: 42, transition: 'all 0.2s',
                    }}
                >
                    {isGhostRunning ? <><Activity size={16} className="animate-pulse" /> Running...</> : '👻 Ghost-Bit Trap'}
                </button>

                {step > 0 && (
                    <button
                        className="btn btn-secondary"
                        style={{ fontSize: 13, padding: '0 16px', marginLeft: 'auto' }}
                        onClick={() => {
                            setStep(0);
                            setQber(null);
                            setPHat(null);
                            setKeyMetrics(null);
                            setQberSn(null);
                            setSiftedKey([]);
                            setMatches([]);
                            setNoiseStats(null);
                            setGhostResult(null);
                        }}
                    >
                        🔄 Reset
                    </button>
                )}
            </div>

            {/* Noise stats banner */}
            {noiseStats && (noiseStats.dropped > 0 || noiseStats.flips > 0) && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        marginBottom: 24,
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--orange-warning-bg)',
                        border: '1px solid #eed88d',
                        fontSize: 13,
                        fontWeight: 500,
                        display: 'flex',
                        gap: 16,
                    }}
                >
                    <span style={{ color: 'var(--text-secondary)' }}>
                        Sent: <strong style={{ color: 'var(--text-primary)' }}>{noiseStats.original_count}</strong>
                    </span>
                    {noiseStats.dropped > 0 && (
                        <span style={{ color: 'var(--accent-blue)' }}>
                            📦 Lost: <strong>{noiseStats.dropped}</strong>
                        </span>
                    )}
                    {noiseStats.flips > 0 && (
                        <span style={{ color: 'var(--orange-warning)' }}>
                            📡 Corrupted: <strong>{noiseStats.flips}</strong>
                        </span>
                    )}
                    {noiseConfig.interception_density > 0 && (
                        <span style={{ color: 'var(--red-error)' }}>
                            🕵️ Eve (Tap Density: {noiseConfig.interception_density})
                        </span>
                    )}
                </motion.div>
            )}

            {/* Receiving Placeholder */}
            {isReceiving && bobBits.length === 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        📡 Traversing Quantum Channel...
                    </div>
                    <div className="visual-grid">
                        {Array.from({ length: 40 }).map((_, i) => (
                            <motion.div
                                key={i}
                                animate={{ opacity: [0.1, 0.4, 0.1], scale: [0.95, 1, 0.95] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.05 }}
                                className="box"
                                style={{ background: 'var(--bg-hover)', border: '1px dashed var(--border-light)' }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Bob's measurements */}
            {!isReceiving && bobBits.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Bob's Measurements
                    </div>
                    <div className="visual-grid">
                        {bobBits.map((b, i) => (
                            <motion.div
                                key={i}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className={`box bit-${b}`}
                            >
                                {b}
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* QBER indicator */}
            {typeof qber === 'number' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                        marginBottom: 24,
                        padding: '16px 20px',
                        borderRadius: 'var(--radius-md)',
                        background: `${qberColor(qber)}15`,
                        border: `1px solid ${qberColor(qber)}40`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                    }}
                >
                    <div className="display-font" style={{ fontSize: 28, fontWeight: 600, color: qberColor(qber), minWidth: 80 }}>
                        {qber.toFixed(1)}%
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ color: qberColor(qber), fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{qberLabel(qber)}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            <span><strong>QBER</strong>: {qber.toFixed(1)}%</span>
                            {pHat !== null && (
                                <span style={{ color: pHat > 0.05 ? 'var(--red-error)' : 'inherit' }}>
                                    <strong>Est. Intrusion (p̂)</strong>: {pHat.toFixed(3)}
                                </span>
                            )}
                            {qberSn !== null && noiseConfig.use_hardware_noise && (
                                <span><strong>Baseline Noise (QBER_SN)</strong>: {qberSn}%</span>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            <SecurityMetrics metrics={keyMetrics} qber={qber} pHat={pHat} />

            {/* Finalized key — only show if verification passed */}
            {step >= 3 && step < 4 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        marginTop: '32px',
                        padding: '24px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--green-success-bg)',
                        border: '1px solid rgba(26, 127, 55, 0.1)'
                    }}
                >
                    <div className="display-font" style={{ color: 'var(--green-success)', fontWeight: 600, fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        ✅ Final Secure Shared Key
                        {step < 4 && (
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
                                ← Run 👻 Ghost-Bit Trap to apply self-healing
                            </span>
                        )}
                    </div>
                    <div className="visual-grid">
                        <SharedKeyVisual />
                    </div>
                    <div style={{ fontSize: '14px', marginTop: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        Efficiency: <span style={{ color: 'var(--text-primary)' }}>{efficiency}%</span> | QBER: <span style={{ color: 'var(--text-primary)' }}>{qber?.toFixed(2)}%</span>
                    </div>
                </motion.div>
            )}

            {/* Ghost-Bit Trap inline results */}
            {ghostResult && step >= 4 && (() => {
                const vr = ghostResult.verify_result;
                return (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            marginTop: 24, padding: '20px 24px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid rgba(168,85,247,0.3)',
                            background: 'rgba(168,85,247,0.05)',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 8 }}>
                                👻 Ghost-Bit Trap — Self-Healing Verification
                                {ghostResult.eve_flip_rate > 0 && (
                                    <span style={{
                                        fontSize: 11, padding: '2px 8px', borderRadius: 99,
                                        background: 'rgba(239,68,68,0.12)',
                                        color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                                        fontWeight: 700,
                                    }}>
                                        ⚡ Eve Active {(ghostResult.eve_flip_rate * 100).toFixed(0)}%
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {vr.total_chunks} blocks · {vr.bits_original} data bits + {vr.total_chunks} ghost bits
                            </div>
                        </div>

                        {/* Block verdicts */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                            {vr.verified_chunks.map((chunk: any) => (
                                <div key={chunk.chunk_index} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '8px 12px', borderRadius: 8,
                                    border: `1px solid ${chunk.passes ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                    background: chunk.passes ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                                    fontSize: 13,
                                }}>
                                    <div style={{
                                        width: 24, height: 24, borderRadius: '50%',
                                        background: chunk.passes ? '#10b981' : '#ef4444',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontWeight: 800, fontSize: 11, flexShrink: 0,
                                    }}>{chunk.chunk_index}</div>

                                    {/* Encoded bits */}
                                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                        {chunk.received.slice(0, 3).map((b: number, bi: number) => (
                                            <div key={bi} style={{
                                                width: 26, height: 26, borderRadius: 5,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 700, fontSize: 12, fontFamily: 'monospace',
                                                background: b === 1 ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)',
                                                color: b === 1 ? '#10b981' : '#6366f1',
                                                border: chunk.flipped_index === bi ? '2px solid #ef4444' : '1px solid transparent',
                                            }}>{b}</div>
                                        ))}
                                        <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 2px' }} />
                                        <div style={{
                                            width: 26, height: 26, borderRadius: 5,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: 12, fontFamily: 'monospace',
                                            background: 'rgba(168,85,247,0.15)', color: '#a855f7',
                                            border: chunk.flipped_index === 3 ? '2px solid #ef4444' : '1px solid rgba(168,85,247,0.3)',
                                        }}>👻</div>
                                    </div>

                                    <div style={{ flex: 1, color: chunk.passes ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: 12 }}>
                                        {chunk.passes ? '✅ Parity OK — bits kept' : '❌ Parity fail — block discarded'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Stats row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
                            {[
                                { label: 'Clean Blocks', val: vr.passing_chunks, color: '#10b981' },
                                { label: 'Compromised', val: vr.tampered_blocks.length, color: vr.tampered_blocks.length > 0 ? '#ef4444' : 'var(--text-muted)' },
                                { label: 'Healed Key', val: `${vr.bits_saved} bits`, color: '#a855f7' },
                                { label: 'Efficiency', val: `${vr.efficiency_pct}%`, color: '#10b981' },
                                { label: 'Std BB84 Would Get', val: `${vr.std_bb84_pct}%`, color: vr.std_bb84_pct === 0 ? '#ef4444' : '#10b981' },
                            ].map(s => (
                                <div key={s.label} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: s.color, marginTop: 3 }}>{s.val}</div>
                                </div>
                            ))}
                        </div>

                        {/* Healed key bits */}
                        {ghostResult.healed_key.length > 0 && (
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                    Healed Key ({ghostResult.healed_length} bits)
                                </div>
                                <div className="visual-grid">
                                    {ghostResult.healed_key.map((b: number, i: number) => (
                                        <motion.div
                                            key={i}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: i * 0.03 }}
                                            className={`box bit-${b}`}
                                            style={{ outline: '2px solid rgba(168,85,247,0.4)' }}
                                        >
                                            {b}
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                );
            })()}
        </div>
    );
};

const SharedKeyVisual: React.FC = () => {
    const { sharedKey } = useProject();
    return (
        <>
            {sharedKey.map((b, i) => (
                <motion.div
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className={`box bit-${b}`}
                >
                    {b}
                </motion.div>
            ))}
        </>
    );
}

export default BobPanel;
