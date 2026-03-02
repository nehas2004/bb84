import React, { useRef, useEffect } from 'react';
import { useQChat } from '../context/ProjectContext';

const LogTerminal: React.FC = () => {
    const { logs } = useQChat();
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="log-terminal">
            <div className="log-terminal__title">📋 Activity Log</div>
            {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    Waiting for activity...
                </div>
            ) : (
                logs.slice(-20).map((log, i) => (
                    <div key={i} className={`log-entry log-entry--${log.type}`}>
                        <span className="log-entry__time">{log.time}</span>
                        {log.message}
                    </div>
                ))
            )}
            <div ref={bottomRef} />
        </div>
    );
};

export default LogTerminal;
