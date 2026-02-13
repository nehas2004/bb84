import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const Header: React.FC = () => {
    const { connected, peerIP, localIP } = useProject();

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{
                    background: 'rgba(255, 215, 0, 0.1)',
                    padding: '10px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 215, 0, 0.3)'
                }}>
                    <ShieldCheck size={28} color="#ffd700" />
                </div>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: '#e0e0e0' }}>
                        Quantum Key Distribution
                    </h1>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                        BB84 Protocol • Secure Network
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
                <div className="status-info" style={{ padding: '8px 15px', borderRadius: '8px', fontSize: '12px' }}>
                    LOCAL: <span style={{ fontFamily: 'monospace' }}>{localIP}</span>
                </div>
                <div
                    className={connected ? "status-success" : "status-warning"}
                    style={{ padding: '8px 15px', borderRadius: '8px', fontSize: '12px' }}
                >
                    {connected ? `CONNECTED: ${peerIP}` : "DISCONNECTED"}
                </div>
            </div>
        </div>
    );
};

export default Header;
