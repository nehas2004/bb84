import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import axios from 'axios';
import { Send, Lock, Unlock } from 'lucide-react';

const Messaging: React.FC = () => {
    const { sharedKey, addLog } = useProject();
    const [message, setMessage] = useState('');
    const [encrypted, setEncrypted] = useState<string>('');
    const [decrypted, setDecrypted] = useState<string>('');

    const handleSend = async () => {
        if (!message) return;

        try {
            // Encrypt locally or via backend? Protocol usually uses OTP with key.
            // We'll use the backend /api/encrypt for simulation consistency.

            // Convert shared key array to string 
            const keyStr = sharedKey.join('');

            // Encrypt
            const encRes = await axios.post('/api/encrypt_message', {
                message: message,
                key: keyStr // Send key to backend? Usually key is pre-shared. 
                // But backend is stateless regarding specific key instance unless session based.
                // We'll send it for this demo.
            });

            setEncrypted(encRes.data.encrypted_hex);
            addLog('info', `Message encrypted: ${encRes.data.encrypted_hex.substring(0, 10)}...`);

            // Decrypt (Bob side simulation)
            const decRes = await axios.post('/api/decrypt_message', {
                encrypted_hex: encRes.data.encrypted_hex,
                key: keyStr
            });

            setDecrypted(decRes.data.decrypted_message);
            addLog('success', `Message received & decrypted: ${decRes.data.decrypted_message}`);

        } catch (err: any) {
            addLog('error', err.response?.data?.error || err.message);
        }
    };

    if (sharedKey.length === 0) return null;

    return (
        <div className="card" style={{ borderLeft: '4px solid #9c27b0' }}>
            <div className="section-title" style={{ color: '#e1bee7' }}>
                <Lock /> Secure Messaging
            </div>

            <div className="input-group">
                <textarea
                    rows={3}
                    placeholder="Enter secret message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                />
            </div>

            <button className="btn btn-primary" onClick={handleSend} style={{ width: '100%' }}>
                <Send size={16} /> Encrypt & Send
            </button>

            {encrypted && (
                <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px' }}>
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>Encrypted Channel (Ciphertext)</div>
                    <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', color: '#ff5252' }}>
                        {encrypted}
                    </div>
                </div>
            )}

            {decrypted && (
                <div style={{ marginTop: '10px', padding: '15px', background: 'rgba(76, 175, 80, 0.1)', borderRadius: '10px' }}>
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>Decrypted Output</div>
                    <div style={{ color: '#81c784', fontWeight: 'bold' }}>
                        {decrypted}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Messaging;
