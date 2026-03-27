import React, { useEffect, useRef } from 'react';
import { useProject } from '../context/ProjectContext';
import { Terminal } from 'lucide-react';

const LogTerminal: React.FC = () => {
    const { logs } = useProject();
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="card" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ fontSize: '14px', marginBottom: '10px', color: '#666' }}>
                <Terminal size={14} /> System Logs
            </h2>
            <div className="logs">
                {logs.length === 0 && <div style={{ color: '#444' }}>System ready. Waiting for events...</div>}
                {logs.map((log, i) => (
                    <div key={i} className="log-entry">
                        <span style={{ color: '#444', marginRight: '10px' }}>[{log.time}]</span>
                        <span className={`log-${log.type}`}>
                            {log.type.toUpperCase()}: {log.message}
                        </span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};

export default LogTerminal;
