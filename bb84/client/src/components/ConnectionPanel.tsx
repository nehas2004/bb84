import React, { useState } from 'react';
import { Wifi, WifiOff, Link } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const ConnectionPanel: React.FC = () => {
    const { peerIP, setPeerIP, connected, setConnected, addLog } = useProject();
    const [ipInput, setIpInput] = useState(peerIP);

    const handleConnect = () => {
        if (!ipInput) {
            addLog('error', 'Please enter a Peer IP.');
            return;
        }
        setPeerIP(ipInput);

        // Simulate connection check (ping)
        // In real app we might fetch /api/ping?ip=...
        addLog('info', `Attempting to connect to ${ipInput}...`);

        // Mock success after delay
        setTimeout(() => {
            setConnected(true);
            addLog('success', `Connected to ${ipInput}`);
        }, 800);
    };

    return (
        <div className="card">
            <h2>
                <Link size={18} /> Network Configuration
            </h2>

            <div className="input-group">
                <label>Peer IP Address</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        placeholder="e.g. 192.168.1.5"
                        value={ipInput}
                        onChange={(e) => setIpInput(e.target.value)}
                        disabled={connected}
                    />
                    <button
                        className={`btn ${connected ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={connected ? () => setConnected(false) : handleConnect}
                    >
                        {connected ? <WifiOff size={16} /> : <Wifi size={16} />}
                        {connected ? 'Disconnect' : 'Connect'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConnectionPanel;
