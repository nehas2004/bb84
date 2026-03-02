import React, { useRef, useEffect } from 'react';
import { useQChat } from '../context/ProjectContext';

const EvePanel: React.FC = () => {
    const { eveMessages } = useQChat();
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [eveMessages]);

    // Generate garbled text from hex
    const garble = (hex: string): string => {
        const chars = '█▓▒░╔╗╚╝║═╬┼┤├▀▄';
        let result = '';
        for (let i = 0; i < Math.min(hex.length, 20); i++) {
            result += chars[parseInt(hex[i], 16) % chars.length];
        }
        return result;
    };

    return (
        <div className="eve-panel">
            <div className="eve-panel__header">
                <div className="eve-panel__avatar">👁️</div>
                <div>
                    <div className="eve-panel__title">Eve — Eavesdropper</div>
                    <div className="eve-panel__subtitle">Intercepted Data Stream</div>
                </div>
            </div>

            <div className="eve-messages">
                {eveMessages.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">🕵️</div>
                        <div className="empty-state__text">
                            Monitoring channel...<br />No intercepted data yet
                        </div>
                    </div>
                ) : (
                    eveMessages.map((msg) => {
                        const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        });
                        return (
                            <div className="eve-message" key={msg.id}>
                                <div className="eve-message__label">
                                    <span>🔴</span> INTERCEPTED — {msg.sender} — {time}
                                </div>
                                <div className="eve-message__hex">
                                    {msg.encrypted_hex}
                                </div>
                                <div className="eve-message__attempt">
                                    ⚠️ Decryption attempt: <span style={{ letterSpacing: '2px' }}>{garble(msg.encrypted_hex)}</span>
                                    <span style={{ marginLeft: '8px', opacity: 0.5 }}>FAILED</span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};

export default EvePanel;
