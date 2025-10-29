import React, { useEffect, useRef } from 'react';

// Subtle moving particles background (dark-friendly)
// - Fixed full-screen canvas behind content
// - Honors reduced motion
// - Uses DPR scaling for crispness
export default function BackgroundCanvas() {
    const ref = useRef(null);
    const rafRef = useRef(0);
    const isDarkRef = useRef(false);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = 0, height = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

        let particles = [];
        const MAX_DOTS = 360; // hard limit
        const MIN_DOTS = Math.floor(MAX_DOTS / 2); // never go below this
        const particleCount = MAX_DOTS; // keep for compatibility
        const maxSpeed = 0.08; // px/ms

        const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function computeDark() {
            isDarkRef.current =
                document.documentElement.classList.contains('dark') ||
                (document.body && document.body.classList.contains('dark'));
        }
        computeDark();

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function initParticles() {
            // start with half of max
            particles = Array.from({ length: MIN_DOTS }, () => {
                const heavy = Math.random() < 0.3;
                const r = heavy ? (1.2 + Math.random() * 1.2) : (0.9 + Math.random() * 1.3);
                return {
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * maxSpeed,
                    vy: (Math.random() - 0.5) * maxSpeed,
                    r,
                    heavy,
                    life: 1,
                    tw: 0,
                    shape: 'circle',
                    rot: 0
                };
            });
        }

        // Hook buckets
        const hooks = { preFrame: [], perParticle: [], overlay: [], postFrame: [] };

        function enableGlowHalos() {
            hooks.overlay.push((c) => {
                c.save(); c.globalCompositeOperation = 'lighter';
                for (const p of particles) {
                    if (!p.heavy) continue;
                    const rgb = isDarkRef.current ? '255,255,255' : '0,0,0';
                    c.fillStyle = `rgba(${rgb},${isDarkRef.current ? 0.05 : 0.04})`;
                    c.beginPath(); c.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2); c.fill();
                }
                c.restore();
            });
        }

        function enableTwinkle() {
            hooks.perParticle.push((p, dt) => {
                if (p.tw <= 0 && Math.random() < 0.0012 * dt) p.tw = 1 + Math.random();
                if (p.tw > 0) p.tw -= dt / 1000; if (p.tw < 0) p.tw = 0;
            });
        }

        const pointer = { x: -1e6, y: -1e6 };
        function enablePointerRepel(radius = 20, strength = 0.01) {
            const move = e => { pointer.x = e.clientX; pointer.y = e.clientY; };
            const leave = () => { pointer.x = -1e6; pointer.y = -1e6; };
            window.addEventListener('pointermove', move); window.addEventListener('pointerleave', leave);
            hooks.perParticle.push((p) => { const dx = p.x - pointer.x, dy = p.y - pointer.y; const d2 = dx * dx + dy * dy; if (d2 < radius * radius) { const d = Math.sqrt(d2) || 1; const f = (1 - d / radius) * strength; p.vx += (dx / d) * f; p.vy += (dy / d) * f; } });
            hooks.postFrame.push(() => () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerleave', leave); });
        }

        function enableSpawnFade() { hooks.perParticle.push((p, dt) => { p.life += (1 - p.life) * Math.min(1, (dt / 1000) * 0.6); }); }

        const parallax = { x: 0, y: 0 };
        function enableParallax(strength = 0.02) { const mv = e => { const cx = width / 2, cy = height / 2; parallax.x = (e.clientX - cx) * strength; parallax.y = (e.clientY - cy) * strength; }; window.addEventListener('pointermove', mv); hooks.postFrame.push(() => () => window.removeEventListener('pointermove', mv)); }

        // Boundary bounce toggler: replaces wrap with elastic bounce
        let useBounce = false;
        function enableBoundaryBounce() { useBounce = true; }

        let last = performance.now();

        function step(now) {
            const dt = Math.min(32, now - last); last = now;
            if (hooks.preFrame.length) hooks.preFrame.forEach(fn => fn(ctx)); else ctx.clearRect(0, 0, width, height);
            const rgbBaseDark = '255,255,255', rgbBaseLight = '0,0,0';
            const baseCount = typeof activeCount === 'number' ? activeCount : particles.length;
            ctx.save();
            if (!prefersReduced && hooks.perParticle.length) {
                // run per-particle updates first pass for motion-only features
            }
            for (let i = 0; i < baseCount; i++) {
                const p = particles[i];
                if (!prefersReduced) {
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    if (useBounce) {
                        const r = p.r + 2;
                        if (p.x < r) { p.x = r; p.vx *= -1; }
                        if (p.x > width - r) { p.x = width - r; p.vx *= -1; }
                        if (p.y < r) { p.y = r; p.vy *= -1; }
                        if (p.y > height - r) { p.y = height - r; p.vy *= -1; }
                    } else {
                        let wrapped = false;
                        if (p.x < -10) { p.x = width + 10; wrapped = true; }
                        if (p.x > width + 10) { p.x = -10; wrapped = true; }
                        if (p.y < -10) { p.y = height + 10; wrapped = true; }
                        if (p.y > height + 10) { p.y = -10; wrapped = true; }
                        if (wrapped) p.life = Math.min(p.life, 0.2);
                    }
                }
                if (hooks.perParticle.length) hooks.perParticle.forEach(fn => fn(p, dt));
                const rgb = isDarkRef.current ? rgbBaseDark : rgbBaseLight;
                const baseAlpha = isDarkRef.current ? (p.heavy ? 0.60 : 0.18) : (p.heavy ? 0.60 : 0.16);
                let alpha = baseAlpha * (0.5 + 0.5 * p.life);
                if (p.tw > 0) { const k = Math.sin(Math.min(1, p.tw) * Math.PI); alpha = Math.max(alpha, baseAlpha + k * 0.35); }
                ctx.fillStyle = `rgba(${rgb},${alpha})`;
                if (p.shape === 'triangle') {
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); const s = p.r * 2.2; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.866, s * 0.5); ctx.lineTo(-s * 0.866, s * 0.5); ctx.closePath(); ctx.fill(); ctx.restore();
                } else if (p.shape === 'plus') {
                    const s = p.r * 1.6; ctx.fillRect(p.x - s * 0.1, p.y - s, s * 0.2, s * 2); ctx.fillRect(p.x - s, p.y - s * 0.1, s * 2, s * 0.2);
                } else {
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.restore();
            if (hooks.overlay.length) hooks.overlay.forEach(fn => fn(ctx));
            if (hooks.postFrame.length) hooks.postFrame.forEach(fn => fn(ctx, dt));
            rafRef.current = requestAnimationFrame(step);
        }

        function start() {
            resize(); initParticles(); last = performance.now();
            // enableGlowHalos();
            enableTwinkle();
            enablePointerRepel();
            enableSpawnFade();
            enableParallax();
            enableBoundaryBounce();
            rafRef.current = requestAnimationFrame(step);
        }

        start();
        window.addEventListener('resize', resize);

        // Click on empty area creates a dot (random heavy), capped by MAX_DOTS
        function onBgClick(e) {
            const t = e.target;
            // ignore clicks on cards or interactive overlays
            if (t && t.closest && t.closest('.card')) return;
            if (particles.length >= MAX_DOTS) return;
            const heavy = Math.random() < 0.3;
            const r = heavy ? (1.2 + Math.random() * 1.2) : (0.9 + Math.random() * 1.3);
            particles.push({
                x: e.clientX,
                y: e.clientY,
                vx: (Math.random() - 0.5) * maxSpeed,
                vy: (Math.random() - 0.5) * maxSpeed,
                r,
                heavy,
                life: 0.2,
                tw: 0,
                shape: 'circle',
                rot: 0
            });
        }
        window.addEventListener('click', onBgClick, true);

        // Decay: remove 2 dots per minute, but never below MIN_DOTS
        const decayInterval = setInterval(() => {
            if (particles.length > MIN_DOTS) particles.pop();
            if (particles.length > MIN_DOTS) particles.pop();
        }, 60 * 1000);

        // Watch for theme toggles by observing class changes
        const obs1 = new MutationObserver(computeDark);
        const obs2 = new MutationObserver(computeDark);
        obs1.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        if (document.body) obs2.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        return () => {
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener('resize', resize);
            window.removeEventListener('click', onBgClick, true);
            clearInterval(decayInterval);
            obs1.disconnect();
            obs2.disconnect();
        };
    }, []);

    return <canvas ref={ref} className="bg-canvas" aria-hidden="true" />;
}
