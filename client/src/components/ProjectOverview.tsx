import React from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Shield, Zap, Cpu, Network, KeyRound, ArrowRight, RefreshCw } from 'lucide-react';

interface ProjectOverviewProps {
  onGetStarted: () => void;
  onCompare: () => void;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({ onGetStarted, onCompare }) => {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80, damping: 12 } }
  };

  return (
    <motion.div 
      className="overview-container"
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{
        padding: '60px',
        maxWidth: '1200px',
        margin: '0 auto',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <motion.div variants={itemVariants} style={{ textAlign: 'center', marginBottom: '60px', paddingTop: '40px' }}>
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '16px',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, rgba(88,101,242,0.15), rgba(46,204,113,0.15))',
            boxShadow: '0 8px 32px rgba(88,101,242,0.1)',
            marginBottom: '24px'
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>
              <Shield size={48} style={{ color: 'var(--accent-blue)' }} />
            </motion.div>
            <KeyRound size={48} style={{ color: 'var(--green-success)' }} />
          </div>
        </motion.div>
        
        <h1 style={{ 
          fontSize: '52px', 
          fontWeight: 800, 
          letterSpacing: '-1.5px', 
          marginBottom: '16px',
          background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--accent-blue) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent'
        }}>
          Quantum Key Distribution
        </h1>
        <p style={{ fontSize: '18px', color: 'var(--text-secondary)', maxWidth: '700px', margin: '0 auto', lineHeight: 1.6 }}>
          QSafe is an advanced end-to-end simulation of the <strong style={{ color: 'var(--text-primary)'}}>BB84 Protocol</strong>. 
          Harness the foundational laws of quantum mechanics to establish mathematically unbreakable cryptographic keys across untrusted networks.
        </p>
      </motion.div>

      <motion.div variants={containerVariants} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '60px' }}>
        
        {/* Card 1 */}
        <motion.div variants={itemVariants} className="overview-card" style={cardStyle}>
          <div style={iconWrapperStyle}>
            <Cpu size={24} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <h3 style={cardTitleStyle}>1. Quantum Preparation</h3>
          <p style={cardTextStyle}>
            <strong>Alice</strong> generates a sequence of random classical bits and encodes them into single photons. 
            She randomly chooses between two non-orthogonal bases to prepare the quantum states.
          </p>
        </motion.div>

        {/* Card 2 */}
        <motion.div variants={itemVariants} className="overview-card" style={cardStyle}>
          <div style={iconWrapperStyle}>
            <Network size={24} style={{ color: 'var(--orange-warning)' }} />
          </div>
          <h3 style={cardTitleStyle}>2. The Quantum Channel</h3>
          <p style={cardTextStyle}>
            The qubits travel across an insecure fiber-optic channel. Due to the <strong>No-Cloning Theorem</strong>, any eavesdropper attempting to intercept the photons will inevitably collapse their delicate quantum state.
          </p>
        </motion.div>

        {/* Card 3 */}
        <motion.div variants={itemVariants} className="overview-card" style={cardStyle}>
          <div style={iconWrapperStyle}>
            <Zap size={24} style={{ color: 'var(--green-success)' }} />
          </div>
          <h3 style={cardTitleStyle}>3. Measurement & Sifting</h3>
          <p style={cardTextStyle}>
            <strong>Bob</strong> measures the incoming photons using a randomly guessed sequence of bases. 
            Alice and Bob then communicate over a classical public channel to sift out mismatched bases to form a <strong>Shared Key</strong>.
          </p>
        </motion.div>

        {/* Card 4 - The Novelty */}
        <motion.div variants={itemVariants} className="overview-card" style={{...cardStyle, border: '1px solid var(--accent-blue)', boxShadow: '0 8px 32px rgba(88,101,242,0.1)'}}>
          <div style={{ ...iconWrapperStyle, background: 'linear-gradient(135deg, rgba(88,101,242,0.2), rgba(46,204,113,0.2))' }}>
            <RefreshCw size={24} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <h3 style={cardTitleStyle}>4. Recursive BB84 (Our Novelty)</h3>
          <p style={cardTextStyle}>
            Standard BB84 peaks at ~50% efficiency. Our system uses a mathematically derived <strong>Rolling Bias</strong>, dynamically altering probability distributions based on the previous shared key to radically boost sifting efficiency without compromising theoretical security.
          </p>
        </motion.div>
        
      </motion.div>

      <motion.div variants={itemVariants} style={{ textAlign: 'center', display: 'flex', gap: '16px', justifyContent: 'center' }}>
        <motion.button 
          whileHover={{ scale: 1.05, boxShadow: '0 10px 30px rgba(88,101,242,0.3)' }}
          whileTap={{ scale: 0.95 }}
          className="btn btn-primary"
          onClick={onGetStarted}
          style={{
            fontSize: '16px',
            padding: '16px 36px',
            borderRadius: '999px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--accent-blue)',
            border: 'none',
            color: 'white',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Initialize QKD Network <ArrowRight size={18} />
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.05, background: 'var(--bg-hover)' }}
          whileTap={{ scale: 0.95 }}
          onClick={onCompare}
          style={{
            fontSize: '16px',
            padding: '16px 32px',
            borderRadius: '999px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            background: 'transparent',
            border: '1px solid var(--border-light)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s ease'
          }}
        >
          Compare Protocols
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: '20px',
  padding: '32px',
  border: '1px solid var(--border-light)',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
};

const iconWrapperStyle: React.CSSProperties = {
  width: '56px',
  height: '56px',
  borderRadius: '16px',
  background: 'var(--bg-hover)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '24px'
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: 'var(--text-primary)',
  marginBottom: '12px',
  letterSpacing: '-0.3px'
};

const cardTextStyle: React.CSSProperties = {
  fontSize: '15px',
  color: 'var(--text-secondary)',
  lineHeight: 1.6
};

export default ProjectOverview;
