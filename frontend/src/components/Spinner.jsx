import React from 'react';

// SVG orbit spinner with curved tail along the orbit
export default function Spinner({ size = 48, radius, dot, className = '', inline = false, speedMs = 1000 }) {
    const cx = size / 2;
    const cy = size / 2;
    const r = radius ?? Math.max(6, Math.round(size * 0.46));
    const dotSize = dot ?? Math.max(4, Math.round(size * 0.18));
    const tailAngleDeg = 28; // arc length of tail
    // tail from angle -tail -> 0 (top). SVG angles measured from +X; convert by subtracting 90deg
    const a0 = (-90 - tailAngleDeg) * (Math.PI / 180);
    const a1 = (-90) * (Math.PI / 180);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const sw = Math.max(2, Math.round(dotSize * 0.55));
    const style = { animationDuration: `${speedMs}ms` };

    return (
        <div
            className={"spinner-orbit " + (className || '') + (inline ? ' inline-block align-middle' : '')}
            style={{ width: size, height: size }}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" xmlns="http://www.w3.org/2000/svg">
                <g className="spin" style={style}>
                    {/* Curved tail along the orbit circumference */}
                    <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" opacity="0.9" />
                    {/* Head dot at the end of the tail */}
                    <circle cx={x1} cy={y1} r={dotSize / 2} fill="currentColor" />
                </g>
            </svg>
            <span className="sr-only">Loading</span>
        </div>
    );
}