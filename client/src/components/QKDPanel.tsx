import React, { useState } from 'react';
import { useQChat } from '../context/ProjectContext';

const QKDPanel: React.FC = () => {
    const { qkdData, keyEstablished, isGeneratingKey, generateKey } = useQChat();
    const [length, setLength] = useState(20);

    return (
        <div className="center-panel__section">
            <div className="center-panel__title">
                <span>⚛️</span> BB84 Quantum Key Distribution
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                    type="number"
                    min={8}
                    max={64}
                    value={length}
                    onChange={(e) => setLength(parseInt(e.target.value) || 20)}
                    style={{
                        width: '60px',
                        padding: '8px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        textAlign: 'center',
                    }}
                />
                <button
                    className={`qkd-btn ${keyEstablished ? 'qkd-btn--active' : ''}`}
                    onClick={() => generateKey(length)}
                    disabled={isGeneratingKey}
                >
                    {isGeneratingKey ? (
                        <>
                            <span className="loading-spinner" />
                            Generating...
                        </>
                    ) : keyEstablished ? (
                        '🔄 Regenerate Quantum Key'
                    ) : (
                        '⚡ Generate Quantum Key'
                    )}
                </button>
            </div>

            {qkdData && (
                <div className="key-viz">
                    {/* Raw Bits */}
                    <div className="key-viz__label">
                        <span>🔑</span> Alice's Raw Bits ({qkdData.rawBits.length})
                    </div>
                    <div className="key-viz__bits">
                        {qkdData.rawBits.map((b, i) => (
                            <div key={`raw-${i}`} className={`key-bit key-bit--${b}`}>
                                {b}
                            </div>
                        ))}
                    </div>

                    {/* Bases comparison */}
                    <div className="key-viz__label">
                        <span>📐</span> Alice Bases
                    </div>
                    <div className="key-viz__bits">
                        {qkdData.aliceBases.map((b, i) => (
                            <div key={`ab-${i}`} className={`key-bit key-bit--basis-${b === 0 ? 'rect' : 'diag'}`}>
                                {b === 0 ? '+' : '×'}
                            </div>
                        ))}
                    </div>

                    <div className="key-viz__label">
                        <span>📐</span> Bob Bases
                    </div>
                    <div className="key-viz__bits">
                        {qkdData.bobBases.map((b, i) => (
                            <div
                                key={`bb-${i}`}
                                className={`key-bit key-bit--basis-${b === 0 ? 'rect' : 'diag'}`}
                                style={
                                    qkdData.aliceBases[i] === b
                                        ? { boxShadow: '0 0 6px rgba(0,255,136,0.4)' }
                                        : { opacity: 0.4 }
                                }
                            >
                                {b === 0 ? '+' : '×'}
                            </div>
                        ))}
                    </div>

                    {/* Sifted Key */}
                    <div className="key-viz__label">
                        <span>🔗</span> Sifted Key ({qkdData.siftedKey.length} bits)
                    </div>
                    <div className="key-viz__bits">
                        {qkdData.siftedKey.map((b, i) => (
                            <div key={`sk-${i}`} className="key-bit key-bit--match">
                                {b}
                            </div>
                        ))}
                    </div>

                    {/* Final Key */}
                    <div className="key-viz__label" style={{ color: 'var(--green)' }}>
                        <span>✅</span> Final Shared Key ({qkdData.finalKey.length} bits)
                    </div>
                    <div className="key-viz__bits">
                        {qkdData.finalKey.map((b, i) => (
                            <div
                                key={`fk-${i}`}
                                className="key-bit key-bit--match"
                                style={{ background: 'rgba(0,255,136,0.25)' }}
                            >
                                {b}
                            </div>
                        ))}
                    </div>

                    {/* Stats */}
                    <div className="key-stats" style={{ marginTop: '8px' }}>
                        <div className="key-stat">
                            <div className="key-stat__label">Raw Bits</div>
                            <div className="key-stat__value">{qkdData.rawBits.length}</div>
                        </div>
                        <div className="key-stat">
                            <div className="key-stat__label">Sifted</div>
                            <div className="key-stat__value">{qkdData.siftedKey.length}</div>
                        </div>
                        <div className="key-stat">
                            <div className="key-stat__label">Final</div>
                            <div className="key-stat__value">{qkdData.finalKey.length}</div>
                        </div>
                        <div className="key-stat">
                            <div className="key-stat__label">QBER</div>
                            <div className="key-stat__value" style={{ color: qkdData.qber > 0 ? 'var(--red)' : 'var(--green)' }}>
                                {qkdData.qber.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QKDPanel;
