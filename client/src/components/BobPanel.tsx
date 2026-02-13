import React, { useState } from 'react';
import axios from 'axios';
import { useProject } from '../context/ProjectContext';
import { Download, Microscope, ShieldCheck, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

const BobPanel: React.FC = () => {
    const {
        addLog,
        bobBits, bobBases, setBobState,
        setSharedKey,
        peerIP
    } = useProject();

    const [siftedKey, setSiftedKey] = useState<number[]>([]);
    const [matches, setMatches] = useState<number[]>([]);
    const [step, setStep] = useState(0); // 0: Ready, 1: Received, 2: Sifted, 3: Verified
    const [qber, setQber] = useState<number | null>(null);
    const [efficiency, setEfficiency] = useState<number>(0);

    const handleFetch = async () => {
        try {
            addLog('info', 'Bob receiving qubits...');

            // Simulate/Real fetch depending on peerIP
            // If local, we just call generate first or expect Alice to be ready. 
            // In this demo, we assume Alice generated data available in backend or we trigger it.
            // But standard flow: Request -> Get.

            if (peerIP) {
                // Network Mode
                const res = await axios.post('/api/fetch_from_peer', { peer_ip: peerIP });
                if (res.data.status === 'success') {
                    setBobState(res.data.bobBases, res.data.measuredBits);
                    setStep(1);
                    addLog('success', `Received ${res.data.measuredBits.length} qubits from ${peerIP}.`);
                } else {
                    addLog('error', 'Failed to receive qubits.');
                }
            } else {
                // Local Demo Mode
                const res = await axios.post('/api/bob_measure', {});
                // Backend returns directly: { bobBases, measuredBits }
                if (res.data.bobBases) {
                    setBobState(res.data.bobBases, res.data.measuredBits);
                    setStep(1);
                    addLog('success', `Received ${res.data.measuredBits.length} qubits (Local Simulator).`);
                }
            }
        } catch (err: any) {
            addLog('error', err.message || 'Fetch failed');
        }
    };

    const handleSift = async () => {
        try {
            let aliceBasesToUse = [];

            if (peerIP) {
                // Network Mode: Fetch Alice's bases (Classical Channel)
                addLog('info', 'Fetching Alice\'s bases from classical channel...');
                const basesRes = await axios.post('/api/fetch_peer_bases', { peer_ip: peerIP });
                aliceBasesToUse = basesRes.data.aliceBases;
                addLog('success', 'Received Alice\'s bases.');
            } else {
                // Local Demo Mode: Backend uses global alice object
                aliceBasesToUse = [];
            }

            addLog('info', 'Sifting keys...');
            const res = await axios.post('/api/sift_keys', {
                bobBases: bobBases,
                bobBits: bobBits,
                aliceBases: aliceBasesToUse
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

            let res;
            if (peerIP) {
                // Network Mode
                addLog('info', 'Sending sample to Alice for verification...');
                res = await axios.post('/api/verify_peer_sample', {
                    peer_ip: peerIP,
                    sifted_key: siftedKey,
                    original_matches: matches
                });
            } else {
                // Local Mode
                // 1. Sample
                const sampleRes = await axios.post('/api/sample_key', { siftedKey });
                const { sampleIndices, sampleBits, remainingKey } = sampleRes.data;

                // 2. Compare (Local Alice)
                addLog('warning', `Verifying ${sampleBits.length} bits...`);
                const compareRes = await axios.post('/api/compare_sample', {
                    sampleIndices,
                    bobSampleBits: sampleBits,
                    originalMatches: matches
                });

                res = {
                    data: {
                        ...compareRes.data,
                        remainingKey // Merge remaining key from step 1
                    }
                };
            }

            const { errorCount, qber, remainingKey } = res.data;
            setQber(qber);

            if (errorCount > 0) {
                addLog('error', `QBER: ${qber.toFixed(2)}% (${errorCount} errors)`);
                if (qber > 20) {
                    addLog('error', 'High QBER! Dropping key.');
                    return;
                }
            } else {
                addLog('success', 'QBER: 0% (Secure)');
            }

            setSharedKey(remainingKey);
            setEfficiency(Math.round((remainingKey.length / bobBits.length) * 100));
            setStep(3);
            addLog('success', `Key Established. Length: ${remainingKey.length}`);

        } catch (err: any) {
            addLog('error', err.response?.data?.error || err.message);
        }
    };

    return (
        <div className="card bob-container">
            <div className="section-title" style={{ color: '#ff9800' }}>
                <Download /> Bob (Receiver)
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
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
                    🛡️ Verify & Finalize
                </button>
            </div>

            {/* Visualizations */}
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
                        {/* We access sharedKey from context, but for visualization here we can use what we set */}
                        {/* Actually better to use context sharedKey to be sure */}
                        <SharedKeyVisual />
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '10px', color: '#aaa' }}>
                        Efficiency: {efficiency}% | QBER: {qber}%
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
