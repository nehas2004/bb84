import React from 'react';
import QChatHeader from './components/QChatHeader';
import ChatPanel from './components/ChatPanel';
import QKDPanel from './components/QKDPanel';
import EncryptionVisualizer from './components/EncryptionVisualizer';
import EvePanel from './components/EvePanel';
import LogTerminal from './components/LogTerminal';
import { useQChat } from './context/ProjectContext';

const App: React.FC = () => {
  const { lastEncryption } = useQChat();

  return (
    <div className="qchat-app">
      <QChatHeader />

      <div className="qchat-panels">
        {/* ── Alice Panel ── */}
        <ChatPanel role="alice" />

        {/* ── Center: Quantum Channel ── */}
        <div className="center-panel">
          <QKDPanel />
          <EncryptionVisualizer entry={lastEncryption} />
          <LogTerminal />
        </div>

        {/* ── Bob + Eve Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ChatPanel role="bob" />
          <EvePanel />
        </div>
      </div>
    </div>
  );
};

export default App;
