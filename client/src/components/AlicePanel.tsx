import React, { useState } from 'react';
import axios from 'axios';
import { useProject } from '../context/ProjectContext';
import { Radio, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

const AlicePanel: React.FC = () => {
    const {
        connected,
        addLog,
        aliceBits,
        aliceBases,
        setAliceState
    } = useProject();

    const [length, setLength] = useState(10);
    const [loading, setLoading] = useState(false);

    const handleGenerate = async () => {
        setLoading(true);
        try {
            addLog('info', `Alice generating ${length} qubits...`);
            const res = await axios.post('/api/generate_keys', { length: parseInt(length.toString()) });

            const { aliceBits, aliceBases } = res.data;
            setAliceState(aliceBits, aliceBases);
            addLog('success', 'Qubits prepared and sent to Quantum Channel.');
        } catch (err: any) {
            addLog('error', err.message || 'Generation failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card alice-container">
            <div className="section-title" style={{ color: '#00bcd4' }}>
                <Radio /> Alice (Sender)
            </div>

            <div className="input-group">
                <label>Key Length (Bits)</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="number"
                        min="5"
                        max="50"
                        value={length}
                        onChange={(e) => setLength(parseInt(e.target.value))}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={handleGenerate}
                        disabled={loading}
                    >
                        {loading ? <Activity className="animate-pulse" /> : '⚡ Generate'}
                    </button>
                </div>
            </div>

            {aliceBits.length > 0 && (
                <div className="mt-4">
                    <div style={{ marginBottom: '5px', fontSize: '12px', color: '#999' }}>Alice's Bits (Hidden from Eve)</div>
                    <div className="visual-grid">
                        {aliceBits.map((b, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                                className={`box bit-${b}`}
                            >
                                {b}
                            </motion.div>
                        ))}
                    </div>

                    <div style={{ marginTop: '10px', marginBottom: '5px', fontSize: '12px', color: '#999' }}>Bases (+ / x)</div>
                    <div className="visual-grid">
                        {aliceBases.map((base, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 + 0.2 }}
                                className={`box basis-${base === 0 ? 'rect' : 'diag'}`}
                            >
                                {base === 0 ? '+' : 'x'}
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AlicePanel;
