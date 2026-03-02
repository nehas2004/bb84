import React, { useState, useRef, useEffect } from 'react';
import { useQChat } from '../context/ProjectContext';
import type { ChatMessage } from '../context/ProjectContext';

interface ChatPanelProps {
    role: 'alice' | 'bob';
}

const MessageBubble: React.FC<{ msg: ChatMessage; isSelf: boolean }> = ({ msg, isSelf }) => {
    const [showEnc, setShowEnc] = useState(false);

    const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <div className={`chat-bubble ${isSelf ? 'chat-bubble--sent' : 'chat-bubble--received'}`}>
            {!isSelf && (
                <div className="chat-bubble__sender">
                    {msg.sender === 'alice' ? 'Alice' : 'Bob'}
                </div>
            )}
            <div>{msg.plaintext}</div>
            <div className="chat-bubble__time">{time}</div>

            <button className="enc-toggle" onClick={() => setShowEnc(!showEnc)}>
                {showEnc ? '🔒 Hide' : '🔓 Show'} encryption
            </button>

            {showEnc && (
                <div className="enc-details">
                    <div className="enc-details__row">
                        <span className="enc-details__label">HEX:</span>
                        <span className="enc-details__value">{msg.msg_hex}</span>
                    </div>
                    <div className="enc-details__row">
                        <span className="enc-details__label">Key:</span>
                        <span className="enc-details__value" style={{ color: 'var(--purple)' }}>
                            {msg.key_used.length > 40 ? msg.key_used.slice(0, 40) + '...' : msg.key_used}
                        </span>
                    </div>
                    <div className="enc-details__row">
                        <span className="enc-details__label">Cipher:</span>
                        <span className="enc-details__value enc-details__value--red">{msg.encrypted_hex}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

const ChatPanel: React.FC<ChatPanelProps> = ({ role }) => {
    const { messages, sendMessage, keyEstablished } = useQChat();
    const [text, setText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!text.trim()) return;
        await sendMessage(text.trim(), role);
        setText('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const isAlice = role === 'alice';

    return (
        <div className="chat-panel">
            {/* Header */}
            <div className="chat-panel__header">
                <div className={`chat-panel__avatar chat-panel__avatar--${role}`}>
                    {isAlice ? 'A' : 'B'}
                </div>
                <div>
                    <div className="chat-panel__name">{isAlice ? 'Alice' : 'Bob'}</div>
                    <div className="chat-panel__role">{isAlice ? 'Sender • Quantum Transmitter' : 'Receiver • Quantum Detector'}</div>
                </div>
            </div>

            {/* Messages */}
            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{isAlice ? '📡' : '📻'}</div>
                        <div className="empty-state__text">
                            {keyEstablished
                                ? `Start a conversation as ${isAlice ? 'Alice' : 'Bob'}`
                                : 'Generate a quantum key to start chatting'
                            }
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <MessageBubble
                            key={msg.id}
                            msg={msg}
                            isSelf={msg.sender === role}
                        />
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="chat-input">
                <input
                    className="chat-input__field"
                    type="text"
                    placeholder={
                        keyEstablished
                            ? `Type as ${isAlice ? 'Alice' : 'Bob'}...`
                            : '🔑 Generate a quantum key first'
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!keyEstablished}
                />
                <button
                    className="chat-input__btn"
                    onClick={handleSend}
                    disabled={!keyEstablished || !text.trim()}
                    title="Send"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default ChatPanel;
