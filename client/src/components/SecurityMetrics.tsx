import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Activity, Zap, Clock, Key } from 'lucide-react';

interface KeyMetrics {
  entropy: number;
  correlation: number;
  efficiency: number;
  key_length: number;
  bits_used: number;
  execution_time_ms?: number;
  qber?: number;
  p_hat?: number;
}

interface Props {
  metrics: KeyMetrics | null;
  qber: number | null;
  pHat: number | null;
}

// Thresholds based on BB84 security theory
const getQberStatus = (qber: number) => {
  if (qber < 5)   return { color: 'var(--green-success)', label: 'Secure',    icon: 'shield' };
  if (qber < 11)  return { color: 'var(--amber-warning)', label: 'Warning',   icon: 'alert'  };
  return           { color: 'var(--red-danger)',   label: 'Compromised', icon: 'alert'  };
};

const getEntropyStatus = (entropy: number) => {
  if (entropy >= 0.95) return { color: 'var(--green-success)', label: 'Strong'  };
  if (entropy >= 0.85) return { color: 'var(--amber-warning)', label: 'Moderate'};
  return                { color: 'var(--red-danger)',   label: 'Weak'    };
};

const getCorrelationStatus = (corr: number) => {
  const abs = Math.abs(corr);
  if (abs <= 0.10) return { color: 'var(--green-success)', label: 'Ideal'   };
  if (abs <= 0.25) return { color: 'var(--amber-warning)', label: 'Moderate'};
  return            { color: 'var(--red-danger)',   label: 'High'    };
};

const getEfficiencyStatus = (eff: number) => {
  if (eff >= 45) return { color: 'var(--green-success)', label: 'Normal' };
  if (eff >= 35) return { color: 'var(--amber-warning)', label: 'Reduced'};
  return          { color: 'var(--red-danger)',   label: 'Low'    };
};

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  subLabel: string;
  statusColor: string;
  statusText: string;
}> = ({ icon, label, value, subLabel, statusColor, statusText }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
        {icon}
        <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </span>
      </div>
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        color: statusColor,
        background: `${statusColor}18`,
        padding: '3px 8px',
        borderRadius: '999px',
      }}>
        {statusText}
      </span>
    </div>

    <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
      {value}
    </div>

    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
      {subLabel}
    </div>

  </motion.div>
);

const SecurityMetrics: React.FC<Props> = ({ metrics, qber, pHat }) => {
  if (!metrics && qber === null) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px dashed var(--border-light)',
        borderRadius: '12px',
        padding: '32px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '14px',
      }}>
        Security metrics will appear after key verification completes.
      </div>
    );
  }

  const qberStatus     = typeof qber === 'number'     ? getQberStatus(qber)                  : null;
  const entropyStatus  = metrics && typeof metrics.entropy === 'number'  ? getEntropyStatus(metrics.entropy)             : null;
  const corrStatus     = metrics && typeof metrics.correlation === 'number'  ? getCorrelationStatus(metrics.correlation)     : null;
  const effStatus      = metrics && typeof metrics.efficiency === 'number'  ? getEfficiencyStatus(metrics.efficiency)       : null;

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Security Analysis
        </h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* QBER */}
        {qber !== null && qberStatus && (
          <MetricCard
            icon={<ShieldCheck size={15} />}
            label="QBER"
            value={`${qber.toFixed(2)}%`}
            subLabel={`Error rate in sifted key. p̂ ≈ ${pHat !== null ? pHat.toFixed(3) : '—'}`}
            statusColor={qberStatus.color}
            statusText={qberStatus.label}
          />
        )}

        {/* Efficiency */}
        {metrics && effStatus && (
          <MetricCard
            icon={<Zap size={15} />}
            label="Key Efficiency"
            value={`${metrics.efficiency.toFixed(1)}%`}
            subLabel={`${metrics.key_length} key bits from ${metrics.bits_used} transmitted`}
            statusColor={effStatus.color}
            statusText={effStatus.label}
          />
        )}

        {/* Entropy */}
        {metrics && entropyStatus && (
          <MetricCard
            icon={<Activity size={15} />}
            label="Key Entropy"
            value={`${metrics.entropy.toFixed(4)} bits`}
            subLabel="Shannon entropy of bit distribution [0.0 – 1.0]"
            statusColor={entropyStatus.color}
            statusText={entropyStatus.label}
          />
        )}

        {/* Correlation */}
        {metrics && corrStatus && (
          <MetricCard
            icon={<Key size={15} />}
            label="Bit Correlation"
            value={metrics.correlation >= 0 ? `+${metrics.correlation.toFixed(4)}` : metrics.correlation.toFixed(4)}
            subLabel="Adjacent-bit Pearson correlation. Ideal: near 0"
            statusColor={corrStatus.color}
            statusText={corrStatus.label}
          />
        )}

        {/* Execution Time */}
        {metrics?.execution_time_ms !== undefined && (
          <MetricCard
            icon={<Clock size={15} />}
            label="Execution Time"
            value={`${metrics.execution_time_ms.toFixed(2)} ms`}
            subLabel="Full QKD protocol round-trip time"
            statusColor="var(--text-muted)"
            statusText="Measured"
          />
        )}

      </div>
    </div>
  );
};

export default SecurityMetrics;
