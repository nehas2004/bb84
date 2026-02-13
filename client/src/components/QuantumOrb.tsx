import React from 'react';
import { motion } from 'framer-motion';

const QuantumOrb: React.FC = () => {
    return (
        <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden flex items-center justify-center">
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.5, 0.3],
                    rotate: [0, 180, 360],
                }}
                transition={{
                    duration: 15,
                    repeat: Infinity,
                    ease: "linear"
                }}
                style={{
                    width: '600px',
                    height: '600px',
                    borderRadius: '40%',
                    background: 'radial-gradient(circle, rgba(0,188,212,0.1) 0%, rgba(26,26,26,0) 70%)',
                    filter: 'blur(60px)',
                    position: 'absolute',
                }}
            />
            <motion.div
                animate={{
                    scale: [1.2, 1, 1.2],
                    opacity: [0.2, 0.4, 0.2],
                    rotate: [360, 180, 0],
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "linear"
                }}
                style={{
                    width: '500px',
                    height: '500px',
                    borderRadius: '45%',
                    background: 'radial-gradient(circle, rgba(255,152,0,0.05) 0%, rgba(26,26,26,0) 70%)',
                    filter: 'blur(50px)',
                    position: 'absolute',
                }}
            />
        </div>
    );
};

export default QuantumOrb;
