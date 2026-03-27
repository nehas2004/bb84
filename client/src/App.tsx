import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';
import ConnectionPanel from './components/ConnectionPanel';
import AlicePanel from './components/AlicePanel';
import BobPanel from './components/BobPanel';
import LogTerminal from './components/LogTerminal';
import ChatInterface from './components/ChatInterface';
import ProjectOverview from './components/ProjectOverview';
import ProtocolComparison from './components/ProtocolComparison';
import { useProject } from './context/ProjectContext';
import { User, Download, Activity, Key, MessageSquare, ShieldCheck, Home } from 'lucide-react';

type Tab = 'overview' | 'dashboard' | 'lab' | 'chat' | 'comparison';

const App: React.FC = () => {
    const { role, setRole, connected } = useProject();
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    return (
        <div className="app-container">
            {/* ── Sidebar Navigation ── */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h1 style={{ marginLeft: '20px', fontSize: '32px', fontWeight: 800, letterSpacing: '-1px' }}>Q<span style={{ color: 'var(--text-muted)' }}>Safe</span></h1>
                </div>

                <nav className="nav-links">
                    <button
                        className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        <Home size={20} /> Overview
                    </button>
                    <button
                        className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setActiveTab('dashboard')}
                    >
                        <Activity size={20} /> Dashboard
                    </button>
                    <button
                        className={`nav-btn ${activeTab === 'lab' ? 'active' : ''}`}
                        onClick={() => setActiveTab('lab')}
                        disabled={!connected}
                    >
                        <Key size={20} /> Quantum Lab
                    </button>
                    <button
                        className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
                        onClick={() => setActiveTab('chat')}
                        disabled={!connected}
                    >
                        <MessageSquare size={20} /> Secure Chat
                    </button>
                </nav>

                <div className="role-badge">
                    <h3>Current Role</h3>
                    <div className="role-toggle">
                        <button
                            className={role === 'alice' ? 'active' : ''}
                            onClick={() => setRole('alice')}
                        >
                            <User size={14} style={{ display: 'inline', marginRight: 4 }} /> Alice
                        </button>
                        <button
                            className={role === 'bob' ? 'active' : ''}
                            onClick={() => setRole('bob')}
                        >
                            <Download size={14} style={{ display: 'inline', marginRight: 4 }} /> Bob
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── Main Content Area ── */}
            <main className="main-content">
                <AnimatePresence mode="wait">
                    {activeTab === 'overview' && (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="tab-view overview-view"
                            style={{ padding: 0 }}
                        >
                            <ProjectOverview
                                onGetStarted={() => setActiveTab('dashboard')}
                                onCompare={() => setActiveTab('comparison')}
                            />
                        </motion.div>
                    )}

                    {activeTab === 'comparison' && (
                        <motion.div
                            key="comparison"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="tab-view comparison-view"
                            style={{ padding: 0 }}
                        >
                            <ProtocolComparison onBack={() => setActiveTab('overview')} />
                        </motion.div>
                    )}

                    {activeTab === 'dashboard' && (
                        <motion.div
                            key="dashboard"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="tab-view dashboard-view"
                        >
                            <div className="dashboard-grid">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                    <div className="card">
                                        <div className="section-title"><ShieldCheck size={24} /> Network Status</div>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 15 }}>
                                            Connect to a peer node directly via local network IP to initiate BB84 key exchange.
                                        </p>
                                        <ConnectionPanel />
                                    </div>
                                </div>
                                <div style={{ height: '600px' }}>
                                    <LogTerminal />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'lab' && connected && (
                        <motion.div
                            key="lab"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.02 }}
                            transition={{ duration: 0.2 }}
                            className="tab-view lab-view"
                        >
                            <div className="quantum-grid">
                                {role === 'alice' ? <AlicePanel /> : <BobPanel />}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'chat' && connected && (
                        <motion.div
                            key="chat"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="tab-view chat-view"
                            style={{ padding: 0 }}
                        >
                            <ChatInterface />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default App;

