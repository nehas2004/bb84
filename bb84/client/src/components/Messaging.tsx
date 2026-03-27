import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import axios from 'axios';
import { Send, Lock, Unlock } from 'lucide-react';

const Messaging: React.FC = () => {
    const { sharedKey, addLog, role, peerIP } = useProject();
    const [message, setMessage] = useState('');
    const [encrypted, setEncrypted] = useState<string>('');
    const [decrypted, setDecrypted] = useState<string>('');

    // Polling state for Bob
    const [isPolling, setIsPolling] = useState(false);

    const handleSend = async () => {
        if (!message) return;

        try {
            // Convert shared key array to string 
            const keyStr = sharedKey.join('');

            // Encrypt and store on backend outbox
            const encRes = await axios.post('/api/encrypt_message', {
                message: message,
                key: keyStr
            });

            setEncrypted(encRes.data.encrypted_hex);
            addLog('info', `Message encrypted & stored: ${encRes.data.encrypted_hex.substring(0, 10)}...`);

            // We NO LONGER instantly decrypt it. We wait for Bob.
            setMessage('');
        } catch (err: any) {
            addLog('error', err.response?.data?.error || err.message);
        }
    };

    const handleReceive = async () => {
        setIsPolling(true);
        try {
            // 1. Fetch encrypted message from Alice
            let msgs = [];

            if (peerIP) {
                // Network fetch
                const fetchRes = await axios.post('/api/fetch_message_from_peer', { peer_ip: peerIP });
                msgs = fetchRes.data.messages || [];
            } else {
                // Local fallback
                const getRes = await axios.get('/api/get_message');
                msgs = getRes.data.messages || [];
            }

            if (msgs.length === 0) {
                addLog('warning', `No messages found in outbox.`);
                setIsPolling(false);
                return;
            }

            // Get the latest message
            const latestCiphertext = msgs[msgs.length - 1];
            setEncrypted(latestCiphertext);
            addLog('info', `Fetched encrypted message: ${latestCiphertext.substring(0, 10)}...`);

            // 2. Decrypt it using Bob's identical key
            const keyStr = sharedKey.join('');
            const decRes = await axios.post('/api/decrypt_message', {
                encrypted_hex: latestCiphertext,
                key: keyStr
            });

            setDecrypted(decRes.data.decrypted_message);
            addLog('success', `Message received & decrypted securely!`);

        } catch (err: any) {
            addLog('error', err.response?.data?.error || err.message);
        }
        setIsPolling(false);
    };

    if (sharedKey.length === 0) return null;

    return (
        <div className="card" style={{ borderLeft: '4px solid #9c27b0' }}>
            <div className="section-title" style={{ color: '#e1bee7' }}>
                <Lock /> Secure Messaging Channel
            </div>

            {role === 'alice' ? (
                <>
                    <div className="input-group">
                        <textarea
                            rows={3}
                            placeholder="Enter secret message to send to Bob..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                        />
                    </div>

                    <button className="btn btn-primary" onClick={handleSend} style={{ width: '100%' }}>
                        <Send size={16} /> Encrypt & Send to Network
                    </button>
                </>
            ) : (
                <>
                    <button
                        className="btn btn-primary"
                        onClick={handleReceive}
                        style={{ width: '100%', backgroundColor: '#4caf50' }}
                        disabled={isPolling}
                    >
                        <Unlock size={16} /> {isPolling ? 'Checking Network...' : 'Check for New Messages'}
                    </button>
                </>
            )}

            {encrypted && (
                <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px' }}>
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>Encrypted Channel (Ciphertext)</div>
                    <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', color: '#ff5252' }}>
                        {encrypted}
                    </div>
                </div>
            )}

            {decrypted && role === 'bob' && (
                <div style={{ marginTop: '10px', padding: '15px', background: 'rgba(76, 175, 80, 0.1)', borderRadius: '10px' }}>
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>Decrypted Original Message</div>
                    <div style={{ color: '#81c784', fontWeight: 'bold' }}>
                        {decrypted}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Messaging;
