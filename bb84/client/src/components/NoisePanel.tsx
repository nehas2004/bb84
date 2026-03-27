import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useProject } from '../context/ProjectContext';

interface NoiseConfig {
    eve_active: boolean;
    network_noise_rate: number;
    channel_noise_rate: number;
    t1_us: number;
    t2_us: number;
    packet_loss_rate: number;
}

const defaultConfig: NoiseConfig = {
    eve_active: false,
    network_noise_rate: 0,
    channel_noise_rate: 0,
    t1_us: 50,
    t2_us: 30,
    packet_loss_rate: 0,
};

// ─── Small reusable toggle ───────────────────────────────────────────────────
const Toggle: React.FC<{
    id: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    activeColor?: string;
}> = ({ id, checked, onChange, activeColor = '#00bcd4' }) => (
    <div
        id={id}
        onClick={() => onChange(!checked)}
        style={{
            width: 42,
            height: 22,
            borderRadius: 11,
            background: checked ? activeColor : '#333',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background 0.25s',
            flexShrink: 0,
        }}
    >
        <motion.div
            animate={{ x: checked ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{
                position: 'absolute',
                top: 3,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#fff',
            }}
        />
    </div>
);

// ─── Labelled slider ─────────────────────────────────────────────────────────
const Slider: React.FC<{
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label: string;
    unit?: string;
    color?: string;
    onChange: (v: number) => void;
}> = ({ value, min = 0, max = 0.3, step = 0.01, label, unit = '%', color = '#00bcd4', onChange }) => {
    const display = unit === '%' ? `${(value * 100).toFixed(0)}%` : `${value}${unit}`;
    return (
        <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                <span>{label}</span>
                <span style={{ color }}>{display}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                style={{ width: '100%', accentColor: color }}
                onChange={e => onChange(parseFloat(e.target.value))}
            />
        </div>
    );
};

// ─── Noise status badge ──────────────────────────────────────────────────────
const Badge: React.FC<{ active: boolean; label: string; color: string }> = ({ active, label, color }) => (
    <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 700,
        background: active ? `${color}22` : '#1a1a1a',
        border: `1px solid ${active ? color : '#333'}`,
        color: active ? color : '#555',
        transition: 'all 0.3s',
    }}>
        {label}
    </span>
);

// ─── Main NoisePanel ─────────────────────────────────────────────────────────
const NoisePanel: React.FC = () => {
    const { addLog, noiseConfig, setNoiseConfig } = useProject();
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState(true);

    // Sync config to backend whenever it changes
    useEffect(() => {
        const timer = setTimeout(async () => {
            setSaving(true);
            try {
                await axios.post('/api/set_noise_config', noiseConfig);
            } catch (e) {
                // silent — backend may not be started yet
            } finally {
                setSaving(false);
            }
        }, 300); // debounce 300ms
        return () => clearTimeout(timer);
    }, [noiseConfig]);

    const update = (patch: Partial<NoiseConfig>) => {
        const next = { ...noiseConfig, ...patch };
        setNoiseConfig(next);
        const labels: Record<string, string> = {
            eve_active: 'Eve',
            network_noise_rate: 'Network Noise',
            channel_noise_rate: 'Channel Noise',
            packet_loss_rate: 'Packet Loss',
        };
        for (const k of Object.keys(patch)) {
            if (k in labels) {
                const val = (next as any)[k];
                const display = typeof val === 'boolean' ? (val ? 'ON' : 'OFF') : `${(val * 100).toFixed(0)}%`;
                addLog('info', `[Noise] ${labels[k]}: ${display}`);
            }
        }
    };

    const activeCount = [
        noiseConfig.eve_active,
        noiseConfig.network_noise_rate > 0,
        noiseConfig.channel_noise_rate > 0,
        noiseConfig.packet_loss_rate > 0,
    ].filter(Boolean).length;

    return (
        <div className="card" style={{ border: activeCount > 0 ? '1px solid rgba(255,165,0,0.3)' : '1px solid rgba(255,255,255,0.08)' }}>
            {/* Header */}
            <div
                onClick={() => setExpanded(e => !e)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                    <span>⚡</span>
                    <span>Noise Simulation</span>
                    {activeCount > 0 && (
                        <span style={{
                            background: '#ff980022',
                            border: '1px solid #ff9800',
                            color: '#ff9800',
                            borderRadius: 99,
                            fontSize: 10,
                            padding: '1px 7px',
                            fontWeight: 700,
                        }}>
                            {activeCount} active
                        </span>
                    )}
                </div>
                <span style={{ color: '#666', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
            </div>

            {/* Badge row */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                <Badge active={noiseConfig.eve_active} label="Eve" color="#ff4444" />
                <Badge active={noiseConfig.network_noise_rate > 0} label="Net Noise" color="#ff9800" />
                <Badge active={noiseConfig.channel_noise_rate > 0} label="Ch Noise" color="#9c27b0" />
                <Badge active={noiseConfig.packet_loss_rate > 0} label="Pkt Loss" color="#00bcd4" />
                {saving && <span style={{ fontSize: 10, color: '#555', alignSelf: 'center' }}>saving…</span>}
            </div>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

                            {/* 1. Eve */}
                            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 12, color: '#ff4444' }}>🕵️ Eavesdropping (Eve)</div>
                                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Intercept-resend attack · raises QBER ~25%</div>
                                    </div>
                                    <Toggle id="toggle-eve" checked={noiseConfig.eve_active} onChange={v => update({ eve_active: v })} activeColor="#ff4444" />
                                </div>
                                {noiseConfig.eve_active && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 8, fontSize: 11, color: '#ff4444', fontStyle: 'italic' }}>
                                        ⚠️ Eve is active — expect QBER ≈ 25%
                                    </motion.div>
                                )}
                            </div>

                            {/* 2. Network Noise */}
                            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,152,0,0.06)', border: '1px solid rgba(255,152,0,0.2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 12, color: '#ff9800' }}>📡 Network Noise</div>
                                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Randomly flips bits in the quantum channel stream</div>
                                    </div>
                                    <Toggle
                                        id="toggle-network-noise"
                                        checked={noiseConfig.network_noise_rate > 0}
                                        onChange={v => update({ network_noise_rate: v ? 0.1 : 0 })}
                                        activeColor="#ff9800"
                                    />
                                </div>
                                {noiseConfig.network_noise_rate > 0 && (
                                    <Slider
                                        label="Bit-flip rate"
                                        value={noiseConfig.network_noise_rate}
                                        max={0.3}
                                        step={0.01}
                                        color="#ff9800"
                                        onChange={v => update({ network_noise_rate: v })}
                                    />
                                )}
                            </div>

                            {/* 3. Channel Noise */}
                            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(156,39,176,0.06)', border: '1px solid rgba(156,39,176,0.2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 12, color: '#9c27b0' }}>🔬 Channel Noise (Qiskit)</div>
                                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Depolarizing + thermal relaxation on AerSimulator</div>
                                    </div>
                                    <Toggle
                                        id="toggle-channel-noise"
                                        checked={noiseConfig.channel_noise_rate > 0}
                                        onChange={v => update({ channel_noise_rate: v ? 0.05 : 0 })}
                                        activeColor="#9c27b0"
                                    />
                                </div>
                                {noiseConfig.channel_noise_rate > 0 && (
                                    <>
                                        <Slider
                                            label="Depolarizing error rate"
                                            value={noiseConfig.channel_noise_rate}
                                            max={0.25}
                                            step={0.005}
                                            color="#9c27b0"
                                            onChange={v => update({ channel_noise_rate: v })}
                                        />
                                        <Slider
                                            label="T1 (energy relaxation)"
                                            value={noiseConfig.t1_us}
                                            min={10}
                                            max={200}
                                            step={5}
                                            unit="µs"
                                            color="#9c27b0"
                                            onChange={v => update({ t1_us: v, t2_us: Math.min(noiseConfig.t2_us, v * 2) })}
                                        />
                                        <Slider
                                            label="T2 (dephasing)"
                                            value={noiseConfig.t2_us}
                                            min={5}
                                            max={Math.min(200, noiseConfig.t1_us * 2)}
                                            step={5}
                                            unit="µs"
                                            color="#9c27b0"
                                            onChange={v => update({ t2_us: v })}
                                        />
                                    </>
                                )}
                            </div>

                            {/* 4. Packet Loss */}
                            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(0,188,212,0.06)', border: '1px solid rgba(0,188,212,0.2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 12, color: '#00bcd4' }}>📦 Packet Loss</div>
                                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Randomly drops qubits — simulates photon loss in fibre</div>
                                    </div>
                                    <Toggle
                                        id="toggle-packet-loss"
                                        checked={noiseConfig.packet_loss_rate > 0}
                                        onChange={v => update({ packet_loss_rate: v ? 0.1 : 0 })}
                                        activeColor="#00bcd4"
                                    />
                                </div>
                                {noiseConfig.packet_loss_rate > 0 && (
                                    <Slider
                                        label="Loss probability per qubit"
                                        value={noiseConfig.packet_loss_rate}
                                        max={0.5}
                                        step={0.01}
                                        color="#00bcd4"
                                        onChange={v => update({ packet_loss_rate: v })}
                                    />
                                )}
                            </div>

                            {/* Reset button */}
                            <button
                                id="btn-reset-noise"
                                className="btn btn-secondary"
                                style={{ fontSize: 12, padding: '6px 14px' }}
                                onClick={() => {
                                    setNoiseConfig({ ...defaultConfig });
                                    addLog('info', '[Noise] All noise sources reset to OFF.');
                                }}
                            >
                                🔄 Reset All Noise OFF
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export { defaultConfig };
export type { NoiseConfig };
export default NoisePanel;
