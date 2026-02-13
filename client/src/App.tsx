import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useProject } from './context/ProjectContext';
import QuantumOrb from './components/QuantumOrb';
import Header from './components/Header';
import ConnectionPanel from './components/ConnectionPanel';
import LogTerminal from './components/LogTerminal';
import AlicePanel from './components/AlicePanel';
import BobPanel from './components/BobPanel';
import Messaging from './components/Messaging';

const Content: React.FC = () => {
  const { role, setRole, sharedKey } = useProject();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/alice') {
      setRole('alice');
    } else if (location.pathname === '/bob') {
      setRole('bob');
    }
  }, [location, setRole]);

  return (
    <div className="relative min-h-screen text-white">
      <QuantumOrb />

      <div className="container mx-auto px-4 py-8 relative z-10" style={{ maxWidth: '1200px' }}>
        <Header />

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '25px' }}>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <ConnectionPanel />

            {/* Role Selector */}
            <div className="card">
              <h2>🎭 Mode Selection</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Link
                  to="/alice"
                  className={`btn ${role === 'alice' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                >
                  Alice
                </Link>
                <Link
                  to="/bob"
                  className={`btn ${role === 'bob' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                >
                  Bob
                </Link>
              </div>
            </div>

            <LogTerminal />
          </div>

          {/* Main Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Routes>
              <Route path="/" element={<AlicePanel />} />
              <Route path="/alice" element={<AlicePanel />} />
              <Route path="/bob" element={<BobPanel />} />
            </Routes>

            {sharedKey.length > 0 && <Messaging />}
          </div>

        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Content />
    </BrowserRouter>
  );
};

export default App;
