// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useProject } from '../context/ProjectContext';
import { Send, Lock, Shield, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import './ChatInterface.css';

interface ChatEntry {
    id: string;
    sender: string;
    plaintext: string;
    encrypted_hex: string;
    msg_bits?: string;
    key_used?: string;
    encrypted_bits?: string;
    timestamp: number;
}

interface ActivityLogEntry {
    time: string;
    type: 'info' | 'success' | 'warning' | 'step' | 'key' | 'cipher';
    text: string;
}

// ─── Mini terminal log inside the chat ──────────────────────────────────────

const ChatActivityLog: React.FC<{ entries: ActivityLogEntry[] }> = ({ entries }) => {
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const shouldScroll = useRef(true);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        shouldScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };

    useEffect(() => {
        if (shouldScroll.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [entries]);

    const colorFor = (type: ActivityLogEntry['type']) => {
        switch (type) {
            case 'success': return '#27C93F';
            case 'warning': return '#FF9F0A';
            case 'key':     return '#34C759';
            case 'cipher':  return '#FFBD2E';
            case 'step':    return '#0A84FF';
            case 'info':
            default:        return 'rgba(220,215,205,0.75)';
        }
    };

    return (
        <div style={{ background: '#0D1512', display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Terminal title bar */}
            <div style={{
                padding: '14px 18px',
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
                <div style={{ display: 'flex', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F56' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27C93F' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-sans)', letterSpacing: '0.3px' }}>
                    🔁 Recursive BB84 — Activity Log
                </span>
            </div>

            {/* Log entries */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}
            >
                {entries.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                        System standing by…<br />
                        Send a message to start the recursive key generation.
                    </div>
                ) : (
                    entries.map((e, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                            <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>{e.time}</span>
                            <span style={{ color: colorFor(e.type), wordBreak: 'break-all' }}>{e.text}</span>
                        </div>
                    ))
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};

// ─── Main Chat Component ─────────────────────────────────────────────────────

const ChatInterface: React.FC = () => {
    const { role, sharedKey, addLog, connected } = useProject();
    const [messages, setMessages] = useState<ChatEntry[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
    // bias stored in component state (mirrors server RAM)
    const [currentBias, setCurrentBias] = useState<number | null>(null);
    const [roundNum, setRoundNum] = useState(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatAreaRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<any>(null);
    const shouldAutoScroll = useRef(true);
    const prevMsgCount = useRef(0);

    const keyStr = sharedKey.join('');
    const hasKey = keyStr.length > 0;

    // ── Helpers ──────────────────────────────────────────────────────────────

    const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const pushLog = (type: ActivityLogEntry['type'], text: string) => {
        setActivityLog(prev => [...prev, { time: now(), type, text }]);
    };

    const handleScroll = () => {
        if (!chatAreaRef.current) return;
        const el = chatAreaRef.current;
        shouldAutoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    };

    // ── Poll chat messages ────────────────────────────────────────────────────

    useEffect(() => {
        if (!connected) return;
        const fetchMessages = async () => {
            try {
                const res = await axios.post('/api/chat/messages', { key: keyStr });
                setMessages(res.data.messages || []);
            } catch { }
        };
        fetchMessages();
        pollRef.current = setInterval(fetchMessages, 1500);
        return () => clearInterval(pollRef.current);
    }, [connected, keyStr]);

    useEffect(() => {
        if (messages.length > prevMsgCount.current && shouldAutoScroll.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
        prevMsgCount.current = messages.length;
    }, [messages]);

    // ── Poll recursive session status ─────────────────────────────────────────
    useEffect(() => {
        const poll = async () => {
            try {
                const res = await axios.get('/api/recursive/status');
                setCurrentBias(res.data.bias);
                setRoundNum(res.data.round_num);
            } catch { }
        };
        poll();
        const t = setInterval(poll, 3000);
        return () => clearInterval(t);
    }, []);

    // ── Ensure seed is planted from the current sharedKey ────────────────────
    // Called automatically before every send if needed
    const ensureSeed = async (): Promise<boolean> => {
        // Check server state first
        const statusRes = await axios.get('/api/recursive/status');
        if (statusRes.data.has_seed) return true;

        if (!hasKey) {
            pushLog('warning', '⚠ No quantum key established. Generate keys in the Quantum Lab first.');
            return false;
        }

        pushLog('info', `🌱 Planting initial seed from existing ${keyStr.length}-bit key…`);
        const ones = sharedKey.filter(b => b === 1).length;
        const bias = ones / sharedKey.length;
        pushLog('info', `   Key composition: ${ones} ones / ${sharedKey.length} bits → bias = ${(bias * 100).toFixed(1)}%`);

        const seedRes = await axios.post('/api/recursive/plant_seed', { key_bits: sharedKey });
        if (seedRes.data.error) {
            pushLog('warning', `⚠ Seed plant failed: ${seedRes.data.error}`);
            return false;
        }
        pushLog('success', `✓ Seed planted. Round 0 → bias = ${(seedRes.data.bias * 100).toFixed(1)}%`);
        setCurrentBias(seedRes.data.bias);
        setRoundNum(seedRes.data.round_num);
        return true;
    };

    // ── Send message via recursive BB84 ──────────────────────────────────────
    const handleSend = async () => {
        if (!input.trim() || !hasKey || sending) return;
        setSending(true);
        shouldAutoScroll.current = true;

        const msgText = input.trim();
        setInput('');

        try {
            // Step 0: ensure seed exists
            const seeded = await ensureSeed();
            if (!seeded) { setSending(false); return; }

            // Fetch real server-side bias NOW (after seed is planted) — avoids stale React state
            const freshStatus = await axios.get('/api/recursive/status');
            const biasBefore  = freshStatus.data.bias as number;
            const roundBefore = freshStatus.data.round_num as number;

            pushLog('step', `── Round ${roundBefore + 1} ─────────────────────────────────`);
            pushLog('info', `🔑 Previous key bias: ${(biasBefore * 100).toFixed(1)}% diagonal`);
            pushLog('info', `   Alice generates 40 qubits with ${(biasBefore * 100).toFixed(1)}/${((1 - biasBefore) * 100).toFixed(1)} diagonal/rect basis…`);
            pushLog('info', `   Bob predicts bases using same ${(biasBefore * 100).toFixed(1)}% probability…`);

            // Step 1: run biased BB84 + encrypt + store in chat feed via backend
            const res = await axios.post('/api/recursive/send_message', {
                message: msgText,
                sender: role,
                length: 40,
            });

            if (res.data.error) {
                pushLog('warning', `⚠ ${res.data.error}`);
                setSending(false);
                return;
            }

            const d = res.data;
            const distD = d.basis_dist?.pct_diag ?? 0;
            const distR = 100 - distD;

            pushLog('step', `   Qubits sent: ${d.basis_dist?.total} | Sifted: ${d.sifted_length} bits`);
            pushLog('step', `   Basis split → ${distR.toFixed(0)}% rect (+) · ${distD.toFixed(0)}% diag (×)`);
            pushLog('step', `   QBER: ${d.qber.toFixed(1)}%  |  Errors: ${d.errors}`);

            // ── Show the new key bits ──────────────────────────────────────
            const keyBits: number[] = d.final_key ?? [];
            const keyPreview = keyBits.length > 0
                ? keyBits.slice(0, 32).join('') + (keyBits.length > 32 ? `…(+${keyBits.length - 32})` : '')
                : '(key bits not returned)';
            const newOnes  = keyBits.filter((b: number) => b === 1).length;
            const newZeros = keyBits.length - newOnes;
            const nextBiasRaw = keyBits.length > 0 ? newOnes / keyBits.length : d.confirmed_bias;
            const nextBias    = Math.max(0.10, Math.min(0.90, nextBiasRaw));

            pushLog('key',  `🔐 New key K${d.round_num}: ${d.final_key_length} bits | entropy: ${d.key_metrics?.entropy?.toFixed(3) ?? '—'}`);
            pushLog('key',  `   Bits  → [${keyPreview}]`);
            pushLog('key',  `   Count → ${newOnes} ones  /  ${newZeros} zeros  (out of ${keyBits.length})`);
            pushLog('key',  `   Ratio → ${newOnes}/${keyBits.length} = ${(nextBiasRaw * 100).toFixed(1)}% → clamped bias = ${(nextBias * 100).toFixed(1)}%`);
            pushLog('info', `   ⇒ Next message will use ${(nextBias * 100).toFixed(1)}% diagonal basis`);
            pushLog('info', `   Old key K${d.round_before} purged from RAM ✓`);
            pushLog('cipher', `🔒 Ciphertext: ${d.encrypted_hex}`);
            pushLog('success', `✓ Message encrypted & sent in ${d.execution_ms}ms`);

            setCurrentBias(d.confirmed_bias);
            setRoundNum(d.round_num);

            // Refresh messages (backend already stored the message in chat_messages)
            const msgRes = await axios.post('/api/chat/messages', { key: keyStr });
            setMessages(msgRes.data.messages || []);

            addLog('success', `Recursive BB84 Round ${d.round_num} complete. Key: ${d.final_key_length} bits.`);
        } catch (err: any) {
            pushLog('warning', `⚠ Error: ${err.response?.data?.error || err.message}`);
            addLog('error', err.response?.data?.error || 'Send failed');
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const formatTime = (ts: number) =>
        new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const isMine = (msg: ChatEntry) => msg.sender === role;

    // ─── Bias gauge (shown in header) ────────────────────────────────────────
    const bias = currentBias ?? 0.5;
    const biasPct = Math.round(bias * 100);
    const biasColor = (() => {
        const dist = Math.abs(bias - 0.5) / 0.4;
        const r = Math.round(100 + (16 - 100) * dist);
        const g = Math.round(116 + (185 - 116) * dist);
        const b = Math.round(255 + (129 - 255) * dist);
        return `rgb(${r},${g},${b})`;
    })();

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

            {/* ── LEFT: Chat Panel (65%) ── */}
            <div className="chat-container" style={{ flex: '0 0 62%', minWidth: 0 }}>
                {/* Header */}
                <div className="chat-header">
                    <div className="chat-header__left">
                        <div className="chat-header__avatar">
                            {role === 'alice' ? 'A' : 'B'}
                        </div>
                        <div>
                            <div className="chat-header__title">Quantum Secure Chat</div>
                            <div className="chat-header__subtitle">
                                {hasKey
                                    ? `Recursive BB84 · Round ${roundNum} · bias ${biasPct}% diag`
                                    : 'No quantum key — generate keys first'}
                            </div>
                        </div>
                    </div>
                    <div className="chat-header__right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Bias mini-gauge */}
                        {hasKey && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--bg-sidebar)', overflow: 'hidden', display: 'flex' }}>
                                    <div style={{ width: `${100 - biasPct}%`, background: '#6366f1', transition: 'width 0.4s' }} />
                                    <div style={{ width: `${biasPct}%`, background: biasColor, transition: 'width 0.4s' }} />
                                </div>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                    {100 - biasPct}% + / {biasPct}% ×
                                </span>
                            </div>
                        )}
                        {hasKey ? (
                            <span className="security-badge security-badge--active">
                                <ShieldCheck size={14} /> Recursive Secured
                            </span>
                        ) : (
                            <span className="security-badge">
                                <Shield size={14} /> Not Secured
                            </span>
                        )}
                    </div>
                </div>

                {/* Messages */}
                <div className="chat-messages-area" ref={chatAreaRef} onScroll={handleScroll}>
                    {messages.length === 0 && (
                        <div className="chat-empty">
                            <Lock size={32} strokeWidth={1.5} />
                            <p>No messages yet</p>
                            <span>
                                {hasKey
                                    ? 'First message will auto-seed the recursive key chain'
                                    : 'Generate a quantum key first to start chatting'}
                            </span>
                        </div>
                    )}
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`message-row ${isMine(msg) ? 'message-row--sent' : 'message-row--received'}`}
                        >
                            <div className={`message-bubble ${isMine(msg) ? 'message-bubble--sent' : 'message-bubble--received'}`}>
                                {!isMine(msg) && (
                                    <div className="message-sender">
                                        {msg.sender === 'alice' ? 'Alice' : 'Bob'}
                                    </div>
                                )}
                                <div className="message-text">{msg.plaintext || '(encrypted)'}</div>
                                <div className="message-meta">
                                    <span className="message-time">{formatTime(msg.timestamp)}</span>
                                    <button
                                        className="message-enc-toggle"
                                        onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                                    >
                                        <Lock size={10} />
                                        {expandedId === msg.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                    </button>
                                </div>
                                {expandedId === msg.id && (
                                    <div className="message-enc-details">
                                        <div className="enc-row">
                                            <span className="enc-label">Cipher</span>
                                            <span className="enc-value enc-value--cipher">{msg.encrypted_hex}</span>
                                        </div>
                                        {msg.msg_bits && (
                                            <div className="enc-row">
                                                <span className="enc-label">Bits</span>
                                                <span className="enc-value">{msg.msg_bits.substring(0, 40)}…</span>
                                            </div>
                                        )}
                                        {msg.key_used && (
                                            <div className="enc-row">
                                                <span className="enc-label">Key</span>
                                                <span className="enc-value enc-value--key">{msg.key_used.substring(0, 40)}…</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="chat-input-area">
                    <input
                        type="text"
                        className="chat-text-input"
                        placeholder={
                            hasKey
                                ? sending ? 'Running BB84 key exchange…' : 'Type a message…'
                                : 'Generate a quantum key first…'
                        }
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={!hasKey || sending}
                    />
                    <button
                        className="chat-send-btn"
                        onClick={handleSend}
                        disabled={!hasKey || !input.trim() || sending}
                        style={sending ? { animation: 'pulse 1s ease-in-out infinite' } : {}}
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>

            {/* ── RIGHT: Activity Log (38%) ── */}
            <div style={{ flex: '0 0 38%', minWidth: 0, overflow: 'hidden' }}>
                <ChatActivityLog entries={activityLog} />
            </div>
        </div>
    );
};

export default ChatInterface;
