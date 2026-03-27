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
import NoisePanel from './components/NoisePanel';

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
    <div style={{ minHeight: '100vh', color: 'white' }}>
      <QuantumOrb />

      <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '24px 20px', position: 'relative', zIndex: 10 }}>
        <Header />

        <div className="app-layout">

          {/* Sidebar */}
          <div className="sidebar-col">
            <ConnectionPanel />
            <NoisePanel />
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
          <div className="main-col">
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
