import React, { useRef, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';

const LogTerminal: React.FC = () => {
    const { logs } = useProject();
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScroll = useRef(true);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        shouldAutoScroll.current = atBottom;
    };

    useEffect(() => {
        if (shouldAutoScroll.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    return (
        <div style={{
            background: '#0D1512',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow-float)'
        }}>
            <div style={{
                padding: '16px 20px',
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                {/* Mac-style window buttons */}
                <div style={{ display: 'flex', gap: '6px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F56' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27C93F' }} />
                </div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-sans)' }}>
                    System Activity Log
                </div>
            </div>

            <div 
                className="log-entries" 
                ref={containerRef} 
                onScroll={handleScroll}
                style={{ padding: '20px', flex: 1, overflowY: 'auto' }}
            >
                {logs.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
                        System standing by... awaiting peer connection or quantum exchange.
                    </div>
                ) : (
                    logs.slice(-50).map((log, i) => {
                        let color = '#E6E0D3'; // default light text
                        if (log.type === 'info') color = '#0A84FF';
                        if (log.type === 'success') color = '#34C759';
                        if (log.type === 'warning') color = '#FF9F0A';
                        if (log.type === 'error') color = '#FF453A';

                        return (
                            <div key={i} style={{ 
                                fontFamily: 'var(--font-mono)', 
                                fontSize: '13px', 
                                marginBottom: '8px', 
                                display: 'flex', 
                                gap: '12px',
                                lineHeight: '1.6'
                            }}>
                                <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{log.time}</span>
                                <span style={{ color }}>{log.message}</span>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};

export default LogTerminal;
