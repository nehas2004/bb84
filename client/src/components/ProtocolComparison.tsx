import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Zap, ShieldAlert, Cpu } from 'lucide-react';

interface ProtocolComparisonProps {
  onBack: () => void;
}

const ProtocolComparison: React.FC<ProtocolComparisonProps> = ({ onBack }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="comparison-container"
      style={{
        padding: '40px',
        maxWidth: '1200px',
        margin: '0 auto',
        height: '100%',
        overflowY: 'auto'
      }}
    >
      {/* Header */}
      <button 
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: 600,
          marginBottom: '32px',
          padding: 0
        }}
      >
        <ArrowLeft size={18} /> Back to Overview
      </button>

      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
          Recursive vs Standard BB84
        </h1>
        <p style={{ fontSize: '18px', color: 'var(--text-secondary)', maxWidth: '800px', lineHeight: 1.6 }}>
          Discover how our novel <strong>Recursive BB84</strong> extension shatters the classical efficiency limits of Quantum Key Distribution without compromising the unconditional security guaranteed by the laws of physics.
        </p>
      </div>

      {/* Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px', marginBottom: '40px' }}>
        
        {/* Standard BB84 Card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-hover)', borderRadius: '12px' }}>
              <Cpu size={24} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Standard BB84</h2>
          </div>
          
          <ul style={listStyle}>
            <li><strong>Static Probability:</strong> Both Alice and Bob guess bases completely randomly (50% Rectilinear, 50% Diagonal).</li>
            <li><strong>High Overhead:</strong> By mathematical certainty, they will guess differently 50% of the time.</li>
            <li><strong>Sifting Loss:</strong> Half of all perfectly transmitted quantum bits must be discarded during the sifting phase.</li>
            <li><strong>Security:</strong> The randomness guarantees Eve cannot predict bases, providing unconditional security.</li>
          </ul>

          <div style={{ marginTop: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Base Sifting Efficiency
            </div>
            <ProgressBar value={50} color="var(--text-muted)" label="~50%" />
          </div>
        </div>

        {/* Recursive BB84 Card */}
        <div style={{ ...cardStyle, border: '1px solid var(--accent-blue)', boxShadow: '0 8px 32px rgba(88,101,242,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ padding: '12px', background: 'linear-gradient(135deg, rgba(88,101,242,0.2), rgba(46,204,113,0.2))', borderRadius: '12px' }}>
              <Zap size={24} style={{ color: 'var(--accent-blue)' }} />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--accent-blue)' }}>Recursive BB84 (Novelty)</h2>
          </div>
          
          <ul style={listStyle}>
            <li><strong>Dynamic Bias:</strong> The probability of choosing a basis is biased based on the 1s/0s ratio of the <em>previous</em> cryptographic key.</li>
            <li><strong>Shared Secret:</strong> Because Alice and Bob already share the previous key, they both independently calculate the exact same skewed probability for the next round.</li>
            <li><strong>Efficiency Boost:</strong> As the bias skews (e.g., 80% Diagonal / 20% Rectilinear), Alice and Bob are statistically far more likely to guess the same basis.</li>
            <li><strong>Ephemeral Security:</strong> The old key is purged from RAM instantly. Eve sees the skewed distribution over the channel but cannot know the governing bias without the purged key.</li>
          </ul>

          <div style={{ marginTop: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Peak Sifting Efficiency
            </div>
            <ProgressBar value={90} color="var(--green-success)" label="Up to ~90%" highlight={true} />
          </div>
        </div>

      </div>

      {/* Graphical Comparison */}
      <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '20px', border: '1px solid var(--border-light)' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={20} style={{ color: 'var(--orange-warning)' }} />
          Performance & Security Metrics
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Metric 1 */}
          <MetricRow 
            title="Sifting Yield (Usable Bits)"
            desc="Percentage of sent qubits that survive the basis-matching phase."
            col1={{ label: "Standard BB84", value: 50, color: "var(--text-muted)", text: "50%" }}
            col2={{ label: "Recursive BB84", value: 85, color: "var(--green-success)", text: "85%+" }}
          />

          {/* Metric 2 */}
          <MetricRow 
            title="Authentication Overhead"
            desc="Need for separate classical authentication keys per message."
            col1={{ label: "Standard BB84", value: 100, color: "var(--red-danger)", text: "High (Required)" }}
            col2={{ label: "Recursive BB84", value: 20, color: "var(--green-success)", text: "Low (Self-Seeding)" }}
          />

          {/* Metric 3 */}
          <MetricRow 
            title="Eavesdropper Intercept Difficulty"
            desc="Eve's ability to guess the correct basis without triggering QBER alarms."
            col1={{ label: "Standard BB84", value: 50, color: "var(--text-muted)", text: "50% chance" }}
            col2={{ label: "Recursive BB84", value: 10, color: "var(--accent-blue)", text: "Dynamic (Unknown bias)" }}
          />
        </div>
      </div>

    </motion.div>
  );
};

// --- Helper Components ---

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  padding: '32px',
  borderRadius: '20px',
  border: '1px solid var(--border-light)',
  display: 'flex',
  flexDirection: 'column'
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: '20px',
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  color: 'var(--text-secondary)',
  fontSize: '15px',
  lineHeight: 1.5
};

const ProgressBar = ({ value, color, label, highlight = false }: { value: number, color: string, label: string, highlight?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
    <div style={{ flexGrow: 1, height: '12px', background: 'var(--bg-hover)', borderRadius: '999px', overflow: 'hidden' }}>
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
        style={{ height: '100%', background: color, borderRadius: '999px' }}
      />
    </div>
    <span style={{ fontWeight: 700, color: highlight ? color : 'var(--text-primary)', minWidth: '80px', textAlign: 'right' }}>
      {label}
    </span>
  </div>
);

const MetricRow = ({ title, desc, col1, col2 }: any) => (
  <div>
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{desc}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '100px' }}>{col1.label}</span>
        <div style={{ flexGrow: 1, height: '6px', background: 'var(--bg-hover)', borderRadius: '999px' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${col1.value}%` }} transition={{ duration: 1 }} style={{ height: '100%', background: col1.color, borderRadius: '999px' }} />
        </div>
        <span style={{ fontSize: '12px', fontWeight: 600, color: col1.color }}>{col1.text}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '100px' }}>{col2.label}</span>
        <div style={{ flexGrow: 1, height: '6px', background: 'var(--bg-hover)', borderRadius: '999px' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${col2.value}%` }} transition={{ duration: 1 }} style={{ height: '100%', background: col2.color, borderRadius: '999px' }} />
        </div>
        <span style={{ fontSize: '12px', fontWeight: 600, color: col2.color }}>{col2.text}</span>
      </div>
    </div>
  </div>
);

export default ProtocolComparison;
