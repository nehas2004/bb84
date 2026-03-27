import React, { useState } from 'react';
import axios from 'axios';
import { useProject } from '../context/ProjectContext';
import { Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

const BobPanel: React.FC = () => {
    const {
        addLog,
        bobBits, bobBases, setBobState,
        setSharedKey,
        peerIP,
        noiseConfig,
    } = useProject();

    const [siftedKey, setSiftedKey] = useState<number[]>([]);
    const [matches, setMatches] = useState<number[]>([]);
    const [step, setStep] = useState(0); // 0: Ready, 1: Received, 2: Sifted, 3: Verified
    const [qber, setQber] = useState<number | null>(null);
    const [efficiency, setEfficiency] = useState<number>(0);
    const [noiseStats, setNoiseStats] = useState<{ dropped: number; flips: number; original_count: number } | null>(null);

    const handleFetch = async () => {
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
                    if (noiseConfig.eve_active)
                        addLog('warning', '[Eve] Intercept-resend active — expect elevated QBER.');
                    if (noiseConfig.channel_noise_rate > 0)
                        addLog('info', `[Channel Noise] Qiskit depolarizing rate: ${(noiseConfig.channel_noise_rate * 100).toFixed(0)}%.`);
                }
            }
        } catch (err: any) {
            addLog('error', err.message || 'Fetch failed');
        }
    };

    const handleSift = async () => {
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
        }
    };

    const handleVerify = async () => {
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

            const { errorCount, qber: newQber, remainingKey } = res.data;
            setQber(newQber);

            if (errorCount > 0) {
                const cause = noiseConfig.eve_active ? '⚠️ Eve detected!' : 'Channel interference';
                addLog('error', `QBER: ${newQber.toFixed(2)}% (${errorCount} errors) — ${cause}`);
                if (newQber > 20) {
                    addLog('error', 'QBER > 20% — Aborting key exchange for security.');
                    return;
                }
            } else {
                addLog('success', 'QBER: 0% — Secure channel confirmed.');
            }

            setSharedKey(remainingKey);
            setEfficiency(Math.round((remainingKey.length / bobBits.length) * 100));
            setStep(3);
            addLog('success', `Key Established. Length: ${remainingKey.length} bits.`);

        } catch (err: any) {
            addLog('error', err.response?.data?.error || err.message);
        }
    };

    // QBER colour helpers
    const qberColor = (q: number) => {
        if (q === 0) return '#4caf50';
        if (q < 5) return '#8bc34a';
        if (q < 20) return '#ff9800';
        return '#f44336';
    };
    const qberLabel = (q: number) => {
        if (q === 0) return '✅ Secure';
        if (q < 5) return '🟡 Marginal';
        if (q < 20) return '⚠️ Elevated';
        return '❌ Attack Detected!';
    };

    return (
        <div className="card bob-container">
            <div className="section-title" style={{ color: '#ff9800' }}>
                <Download /> Bob (Receiver)
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <button
                    className="btn btn-primary"
                    style={{ backgroundColor: '#ff9800', backgroundImage: 'linear-gradient(135deg, #ff9800 0%, #ffed4e 100%)' }}
                    onClick={handleFetch}
                    disabled={step > 0}
                >
                    📥 Receive Qubits
                </button>

                <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>

                <button
                    className="btn btn-secondary"
                    onClick={handleSift}
                    disabled={step !== 1}
                >
                    🔍 Sift Keys
                </button>

                <button
                    className="btn btn-secondary"
                    onClick={handleVerify}
                    disabled={step !== 2}
                >
                    🛡️ Verify &amp; Finalize
                </button>

                {step > 0 && (
                    <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11 }}
                        onClick={() => {
                            setStep(0);
                            setQber(null);
                            setSiftedKey([]);
                            setMatches([]);
                            setNoiseStats(null);
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
                        marginBottom: 14,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,152,0,0.08)',
                        border: '1px solid rgba(255,152,0,0.3)',
                        fontSize: 12,
                        display: 'flex',
                        gap: 16,
                    }}
                >
                    <span style={{ color: '#888' }}>
                        Sent: <strong style={{ color: '#ddd' }}>{noiseStats.original_count}</strong>
                    </span>
                    {noiseStats.dropped > 0 && (
                        <span style={{ color: '#00bcd4' }}>
                            📦 Lost: <strong>{noiseStats.dropped}</strong> qubits
                        </span>
                    )}
                    {noiseStats.flips > 0 && (
                        <span style={{ color: '#ff9800' }}>
                            📡 Corrupted: <strong>{noiseStats.flips}</strong> qubits
                        </span>
                    )}
                    {noiseConfig.eve_active && (
                        <span style={{ color: '#ff4444' }}>
                            🕵️ Eve Active
                        </span>
                    )}
                </motion.div>
            )}

            {/* Bob's measurements */}
            {bobBits.length > 0 && (
                <div className="mb-4">
                    <div style={{ marginBottom: '5px', fontSize: '12px', color: '#999' }}>Bob's Measurements</div>
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
            {qber !== null && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                        marginBottom: 14,
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: `${qberColor(qber)}15`,
                        border: `1px solid ${qberColor(qber)}55`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                    }}
                >
                    <div style={{ fontSize: 22, fontWeight: 900, color: qberColor(qber), fontFamily: 'monospace', minWidth: 60 }}>
                        {qber.toFixed(1)}%
                    </div>
                    <div>
                        <div style={{ color: qberColor(qber), fontWeight: 700, fontSize: 13 }}>{qberLabel(qber)}</div>
                        <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                            QBER (Quantum Bit Error Rate)
                            {qber > 0 && noiseConfig.eve_active && ' — Eve intercept-resend attack'}
                            {qber > 0 && !noiseConfig.eve_active && noiseConfig.channel_noise_rate > 0 && ' — channel depolarizing noise'}
                            {qber > 0 && !noiseConfig.eve_active && noiseConfig.network_noise_rate > 0 && ' — network bit-flip noise'}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Finalized key */}
            {step >= 3 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 rounded-lg bg-green-900/20 border border-green-500/30"
                >
                    <div style={{ color: '#4caf50', fontWeight: 'bold', marginBottom: '10px' }}>
                        ✅ Final Secure Shared Key
                    </div>
                    <div className="visual-grid">
                        <SharedKeyVisual />
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '10px', color: '#aaa' }}>
                        Efficiency: {efficiency}% | QBER: {qber?.toFixed(2)}%
                    </div>
                </motion.div>
            )}
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
