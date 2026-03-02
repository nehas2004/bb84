import React from 'react';
import type { ChatMessage } from '../context/ProjectContext';

interface EncryptionVisualizerProps {
    entry: ChatMessage | null;
}

const EncryptionVisualizer: React.FC<EncryptionVisualizerProps> = ({ entry }) => {
    if (!entry) return null;

    // Truncate long values for display
    const trunc = (s: string, n = 28) => (s.length > n ? s.slice(0, n) + '...' : s);

    return (
        <div className="center-panel__section">
            <div className="center-panel__title">
                <span>🔐</span> Encryption Pipeline
            </div>

            <div className="enc-viz__flow">
                {/* Step 1: Plaintext */}
                <div className="enc-viz__step">
                    <span className="enc-viz__step-icon">📝</span>
                    <span className="enc-viz__step-label">Message</span>
                    <span className="enc-viz__step-value enc-viz__step-value--green">
                        "{trunc(entry.plaintext, 24)}"
                    </span>
                </div>

                <div className="enc-viz__arrow">↓</div>

                {/* Step 2: HEX */}
                <div className="enc-viz__step">
                    <span className="enc-viz__step-icon">🔢</span>
                    <span className="enc-viz__step-label">HEX</span>
                    <span className="enc-viz__step-value">
                        {trunc(entry.msg_hex)}
                    </span>
                </div>

                <div className="enc-viz__arrow">↓ ⊕</div>

                {/* Step 3: Key */}
                <div className="enc-viz__step">
                    <span className="enc-viz__step-icon">🔑</span>
                    <span className="enc-viz__step-label">Key</span>
                    <span className="enc-viz__step-value enc-viz__step-value--purple">
                        {trunc(entry.key_used)}
                    </span>
                </div>

                <div className="enc-viz__arrow">↓</div>

                {/* Step 4: Encrypted */}
                <div className="enc-viz__step">
                    <span className="enc-viz__step-icon">🔒</span>
                    <span className="enc-viz__step-label">Cipher</span>
                    <span className="enc-viz__step-value enc-viz__step-value--red">
                        {trunc(entry.encrypted_hex)}
                    </span>
                </div>

                <div className="enc-viz__arrow">↓ 📡</div>

                {/* Step 5: Transmitted */}
                <div className="enc-viz__step" style={{ borderColor: 'var(--cyan-glow)' }}>
                    <span className="enc-viz__step-icon">✅</span>
                    <span className="enc-viz__step-label">Sent</span>
                    <span className="enc-viz__step-value" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Transmitted over quantum-secured channel
                    </span>
                </div>
            </div>
        </div>
    );
};

export default EncryptionVisualizer;
