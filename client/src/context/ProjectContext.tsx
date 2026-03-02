import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
    id: string;
    sender: 'alice' | 'bob';
    plaintext: string;
    encrypted_hex: string;
    msg_hex: string;
    msg_bits: string;
    key_used: string;
    encrypted_bits: string;
    timestamp: number;
}

export interface EveMessage {
    id: string;
    sender: string;
    encrypted_hex: string;
    timestamp: number;
}

export interface QKDData {
    rawBits: number[];
    aliceBases: number[];
    bobBases: number[];
    measuredBits: number[];
    siftedKey: number[];
    matches: number[];
    finalKey: number[];
    keyLength: number;
    qber: number;
}

export interface LogEntry {
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    time: string;
}

interface QChatContextType {
    // QKD state
    qkdData: QKDData | null;
    keyEstablished: boolean;
    isGeneratingKey: boolean;
    generateKey: (length?: number) => Promise<void>;

    // Chat
    messages: ChatMessage[];
    eveMessages: EveMessage[];
    sendMessage: (text: string, sender: 'alice' | 'bob') => Promise<void>;
    fetchMessages: () => Promise<void>;
    fetchEveMessages: () => Promise<void>;
    clearChat: () => Promise<void>;

    // Logs
    logs: LogEntry[];
    addLog: (type: LogEntry['type'], msg: string) => void;

    // Last encryption viz
    lastEncryption: ChatMessage | null;
}

const QChatContext = createContext<QChatContextType | undefined>(undefined);

export const useQChat = () => {
    const ctx = useContext(QChatContext);
    if (!ctx) throw new Error('useQChat must be inside QChatProvider');
    return ctx;
};

// ─── Provider ────────────────────────────────────────────────────────────────

export const QChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [qkdData, setQkdData] = useState<QKDData | null>(null);
    const [isGeneratingKey, setIsGeneratingKey] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [eveMessages, setEveMessages] = useState<EveMessage[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [lastEncryption, setLastEncryption] = useState<ChatMessage | null>(null);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const addLog = useCallback((type: LogEntry['type'], message: string) => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [...prev.slice(-100), { type, message, time }]);
    }, []);

    // Generate quantum key (one-click)
    const generateKey = useCallback(async (length = 20) => {
        setIsGeneratingKey(true);
        addLog('info', `Initiating BB84 key generation (${length} qubits)...`);
        try {
            const res = await axios.post('/api/qkd/quick_generate', { length });
            const data: QKDData = res.data;
            setQkdData(data);
            addLog('success', `Quantum key established: ${data.keyLength} bits | QBER: ${data.qber.toFixed(1)}%`);
        } catch (err: any) {
            addLog('error', err.response?.data?.error || err.message);
        } finally {
            setIsGeneratingKey(false);
        }
    }, [addLog]);

    // Send a message
    const sendMessage = useCallback(async (text: string, sender: 'alice' | 'bob') => {
        try {
            const res = await axios.post('/api/chat/send', { message: text, sender });
            const entry: ChatMessage = res.data.entry;
            setMessages(prev => [...prev, entry]);
            setLastEncryption(entry);
            addLog('info', `${sender === 'alice' ? 'Alice' : 'Bob'} sent encrypted message`);

            // Also fetch Eve's view
            fetchEveMessages();
        } catch (err: any) {
            addLog('error', err.response?.data?.error || err.message);
        }
    }, [addLog]);

    // Fetch all messages
    const fetchMessages = useCallback(async () => {
        try {
            const res = await axios.get('/api/chat/messages');
            setMessages(res.data.messages || []);
        } catch (err: any) {
            console.error(err);
        }
    }, []);

    // Fetch Eve's intercepted view
    const fetchEveMessages = useCallback(async () => {
        try {
            const res = await axios.get('/api/eve/intercept');
            setEveMessages(res.data.messages || []);
        } catch (err: any) {
            console.error(err);
        }
    }, []);

    // Clear chat
    const clearChat = useCallback(async () => {
        try {
            await axios.post('/api/chat/clear');
            setMessages([]);
            setEveMessages([]);
            setLastEncryption(null);
            addLog('info', 'Chat history cleared');
        } catch (err: any) {
            addLog('error', 'Failed to clear chat');
        }
    }, [addLog]);

    // Poll for new messages every 2s
    useEffect(() => {
        pollRef.current = setInterval(() => {
            fetchMessages();
            fetchEveMessages();
        }, 2000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [fetchMessages, fetchEveMessages]);

    const keyEstablished = !!(qkdData && qkdData.keyLength > 0);

    const value: QChatContextType = {
        qkdData,
        keyEstablished,
        isGeneratingKey,
        generateKey,
        messages,
        eveMessages,
        sendMessage,
        fetchMessages,
        fetchEveMessages,
        clearChat,
        logs,
        addLog,
        lastEncryption,
    };

    return <QChatContext.Provider value={value}>{children}</QChatContext.Provider>;
};
