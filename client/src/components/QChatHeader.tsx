import React from 'react';
import { useQChat } from '../context/ProjectContext';

const QChatHeader: React.FC = () => {
    const { keyEstablished, clearChat, qkdData } = useQChat();

    return (
        <div className="qchat-header">
            <div className="qchat-header__brand">
                <div className="qchat-header__icon">🔐</div>
                <div>
                    <div className="qchat-header__title">QChat</div>
                    <div className="qchat-header__subtitle">Quantum-Secured Messenger</div>
                </div>
            </div>

            <div className="qchat-header__status">
                {keyEstablished ? (
                    <div className="quantum-badge">
                        <span className="quantum-badge__dot" />
                        Quantum Secured Channel Active
                        <span style={{ opacity: 0.6 }}>• {qkdData?.keyLength} bit key</span>
                    </div>
                ) : (
                    <div className="quantum-badge" style={{ borderColor: 'rgba(255,153,0,0.3)', background: 'rgba(255,153,0,0.1)', color: '#ff9900' }}>
                        <span className="quantum-badge__dot" style={{ background: '#ff9900', boxShadow: '0 0 8px #ff9900' }} />
                        No Quantum Key — Generate to Start
                    </div>
                )}

                <button
                    onClick={clearChat}
                    style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                    }}
                >
                    Clear Chat
                </button>
            </div>
        </div>
    );
};

export default QChatHeader;
