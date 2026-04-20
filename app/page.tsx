'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Lenis from 'lenis';

const FRAME_COUNT = 270;
const FRAME_DIGITS = 3;

// Helper to format frame numbers (1 -> 001)
function padLeft(num: number, digits: number) {
  return String(num).padStart(digits, '0');
}

export default function ZedCafeFramesWheel() {
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  
  // State for mobile menu
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const paths = useMemo(() => {
    const getSrc = (frameIndex: number) => {
      return `/frames/ezgif-frame-${padLeft(frameIndex + 1, FRAME_DIGITS)}.jpg`;
    };
    return { getSrc };
  }, []);

  useEffect(() => {
    const heroEl = heroRef.current;
    const canvas = canvasRef.current;
    if (!heroEl || !canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // 1. Initialize Lenis
    const lenis = new Lenis({
      duration: 1.8,
      smoothWheel: true,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    let destroyed = false;

    // 2. Setup Memory Arrays
    const frames: (HTMLImageElement | null)[] = new Array(FRAME_COUNT).fill(null);
    const frameReady: boolean[] = new Array(FRAME_COUNT).fill(false);
    const requested: boolean[] = new Array(FRAME_COUNT).fill(false);

    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

    // 3. Smart Preloader
    const loadFrame = (idx: number) => {
      if (requested[idx] || idx < 0 || idx >= FRAME_COUNT) return;
      requested[idx] = true;

      const img = new Image();
      img.decoding = 'async';
      img.src = paths.getSrc(idx);
      frames[idx] = img;

      const markReady = () => {
        if (destroyed) return;
        frameReady[idx] = true;
        if (idx === 0) {
          drawCover(img);
        }
      };

      img.onload = markReady;
      img.decode?.().then(markReady).catch(() => {});
    };

    const preloadWindow = (center: number, radius: number) => {
      for (let d = -radius; d <= radius; d++) {
        const raw = center + d;
        if (raw >= 0 && raw < FRAME_COUNT) {
          loadFrame(raw);
        }
      }
    };

    preloadWindow(0, 12);
    for (let i = 0; i < Math.min(FRAME_COUNT, 60); i++) loadFrame(i);

    const scheduleBackgroundPreload = () => {
      const run = () => {
        if (destroyed) return;
        for (let i = 0; i < FRAME_COUNT; i++) loadFrame(i);
      };
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(run, { timeout: 1500 });
      } else {
        setTimeout(run, 250);
      }
    };
    scheduleBackgroundPreload();

    // 4. Handle High-DPI Displays (Retina screens)
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const needsRedrawRef = { current: true };
    resize();
    
    const ro = new ResizeObserver(() => {
      resize();
      needsRedrawRef.current = true;
    });
    ro.observe(canvas);

    // 5. Canvas Drawing Math
    const drawCover = (img: HTMLImageElement) => {
      const cw = canvas.width;
      const ch = canvas.height;
      if (!cw || !ch) return;

      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) return;

      const scale = Math.max(cw / iw, ch / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;

      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, dx, dy, dw, dh);
    };

    const lastFrameRef = { current: -1 };

    const findNearestReady = (idx: number, radius: number) => {
      if (frameReady[idx]) return idx;
      for (let d = 1; d <= radius; d++) {
        const left = Math.max(0, idx - d);
        const right = Math.min(FRAME_COUNT - 1, idx + d);
        if (frameReady[left]) return left;
        if (frameReady[right]) return right;
      }
      return -1;
    };

    // 6. The Core Render Loop
    let rafId = 0;
    const tick = (time: number) => {
      if (destroyed) return;

      lenis.raf(time);

      const start = heroEl.offsetTop;
      const end = start + heroEl.offsetHeight - window.innerHeight;
      const denom = Math.max(1, end - start);

      const scrollY = lenis.scroll ?? window.scrollY ?? 0;
      const t = clamp01((scrollY - start) / denom);

      const frameFloat = t * (FRAME_COUNT - 1);
      const idx = Math.min(FRAME_COUNT - 1, Math.max(0, Math.round(frameFloat)));

      preloadWindow(idx, 18);

      // Parallax update
      if (wrapRef.current) {
        const scale = 1.10 - t * 0.04;
        const rotate = (t - 0.5) * -1.0;
        wrapRef.current.style.transform = `scale(${scale}) rotate(${rotate}deg)`;
      }

      // Header Background Toggle Logic
      if (headerRef.current) {
        const pastHero = scrollY > end - 50; 
        if (pastHero) {
          headerRef.current.style.backgroundColor = 'rgba(8, 8, 8, 0.85)';
          headerRef.current.style.backdropFilter = 'blur(16px)';
          headerRef.current.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
        } else {
          headerRef.current.style.backgroundColor = 'transparent';
          headerRef.current.style.backdropFilter = 'none';
          headerRef.current.style.borderBottom = '1px solid transparent';
        }
      }

      const drawIdx = findNearestReady(idx, 24);
      if (
        drawIdx !== -1 &&
        (drawIdx !== lastFrameRef.current || needsRedrawRef.current)
      ) {
        lastFrameRef.current = drawIdx;
        drawCover(frames[drawIdx]!);
        needsRedrawRef.current = false;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    // 7. Cleanup
    return () => {
      destroyed = true;
      lenis.destroy();
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [paths]);

  const navItems = ['Menu', 'Story', 'Reserve'];

  return (
    <main style={{ position: 'relative', width: '100%', background: '#080808', color: '#fff' }}>
      
      {/* ── Hero Brand Text ── */}
      <header 
        ref={headerRef} 
        className="fixed top-0 left-0 right-0 flex justify-between items-center z-50 px-6 py-5 md:px-12 md:py-7 transition-all duration-400"
        style={{ borderBottom: '1px solid transparent' }}
      >
        <div className="relative z-50">
          <p style={{
            fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)', fontWeight: 500, marginBottom: '4px'
          }}>Est. 2019</p>
          <h1 style={{
            fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em',
            fontFamily: '"Playfair Display", Georgia, serif', margin: 0
          }}>ZED CAFÉ</h1>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex gap-8 relative z-50">
          {navItems.map(item => (
            <a 
              key={item} 
              href={`#${item.toLowerCase()}`}
              onClick={(e) => {
                e.preventDefault();
                const target = document.getElementById(item.toLowerCase());
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              style={{
                fontSize: 13, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.05em',
                fontWeight: 500, cursor: 'pointer', pointerEvents: 'auto', transition: 'color 0.2s',
                textDecoration: 'none'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
              onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
            >
              {item}
            </a>
          ))}
        </nav>

        {/* Mobile Hamburger Button */}
        <button 
          className="md:hidden flex flex-col justify-center items-center gap-1.5 w-8 h-8 relative z-50"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle Menu"
        >
          <span className={`h-[2px] w-6 bg-white transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-[8px]' : ''}`} />
          <span className={`h-[2px] w-6 bg-white transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`h-[2px] w-6 bg-white transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-[8px]' : ''}`} />
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      <div 
        className={`fixed inset-0 bg-[#080808]/95 backdrop-blur-md z-40 flex flex-col items-center justify-center transition-opacity duration-500 md:hidden ${
          isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <nav className="flex flex-col items-center gap-10">
          {navItems.map((item, i) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              onClick={(e) => {
                e.preventDefault();
                setIsMobileMenuOpen(false);
                const target = document.getElementById(item.toLowerCase());
                if (target) {
                  // Slight delay to allow menu fade out before scrolling
                  setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 300);
                }
              }}
              style={{
                fontSize: 28, color: '#fff', letterSpacing: '0.1em',
                fontWeight: 300, textDecoration: 'none',
                transform: isMobileMenuOpen ? 'translateY(0)' : 'translateY(20px)',
                opacity: isMobileMenuOpen ? 1 : 0,
                transition: `all 0.4s ease ${i * 0.1}s`
              }}
              className="font-serif uppercase"
            >
              {item}
            </a>
          ))}
        </nav>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          HERO — scroll-synced frame animation + menu overlay
      ══════════════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        style={{ position: 'relative', height: '500vh', width: '100%', background: '#080808' }}
      >
        <div style={{ position: 'sticky', top: 0, zIndex: 10, height: '100vh', width: '100%', overflow: 'hidden' }}>
          <div ref={wrapRef} style={{ position: 'absolute', inset: 0, willChange: 'transform' }}>
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.22) 60%, rgba(0,0,0,0.88) 100%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(55% 55% at 50% 42%, rgba(255,255,255,0.07), transparent 65%)',
              pointerEvents: 'none',
            }} />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 2: HIGHLIGHTS
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative -mt-px w-full py-32 px-6 lg:px-12 z-20" style={{ background: '#080808' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 font-serif tracking-tight text-white">The Zed Experience</h2>
            <div className="w-16 h-[1px] bg-white/20 mx-auto"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div className="flex flex-col items-center group">
              <div className="w-24 h-24 rounded-full border border-white/10 flex items-center justify-center mb-6 transition duration-500 group-hover:border-white/40 group-hover:bg-white/5">
                <svg className="w-8 h-8 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 tracking-wide text-white/90">Artisanal Roasts</h3>
              <p className="text-white/50 leading-relaxed text-sm">
                Ethically sourced beans roasted in-house daily to ensure the freshest, most vibrant flavor profiles.
              </p>
            </div>

            <div className="flex flex-col items-center group">
              <div className="w-24 h-24 rounded-full border border-white/10 flex items-center justify-center mb-6 transition duration-500 group-hover:border-white/40 group-hover:bg-white/5">
                <svg className="w-8 h-8 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 tracking-wide text-white/90">Slow Poured</h3>
              <p className="text-white/50 leading-relaxed text-sm">
                Crafted with patience and precision. We believe that a truly excellent cup of coffee takes exactly the time it needs.
              </p>
            </div>

            <div className="flex flex-col items-center group">
              <div className="w-24 h-24 rounded-full border border-white/10 flex items-center justify-center mb-6 transition duration-500 group-hover:border-white/40 group-hover:bg-white/5">
                <svg className="w-8 h-8 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18zm-3-9v-2a2 2 0 00-2-2H8a2 2 0 00-2 2v2h12z" /></svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 tracking-wide text-white/90">Fresh Patisserie</h3>
              <p className="text-white/50 leading-relaxed text-sm">
                A daily rotating selection of delicate pastries, baked fresh every morning from local ingredients.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 3: MENU
      ══════════════════════════════════════════════════════════════ */}
      <section id="menu" className="relative w-full py-32 px-6 lg:px-12 z-20" style={{ background: '#0a0a0a' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-serif tracking-tight text-white">Curated Menu</h2>
            <p className="text-white/40 text-sm tracking-widest uppercase">Classics & Signatures</p>
          </div>

          <div className="space-y-16">
            {/* Coffee Sub-menu */}
            <div>
              <h3 className="text-xl font-medium border-b border-white/10 pb-4 mb-6 text-white/80">Coffee</h3>
              <ul className="space-y-6">
                <li className="flex justify-between items-end group">
                  <div className="flex-1 border-b border-dashed border-white/20 mb-1 mr-4">
                    <span className="bg-[#0a0a0a] pr-4 text-white/90 font-medium tracking-wide">Zed Signature Pour Over</span>
                  </div>
                  <span className="text-white/70 font-serif">650</span>
                </li>
                <li className="flex justify-between items-end">
                  <div className="flex-1 border-b border-dashed border-white/20 mb-1 mr-4">
                    <span className="bg-[#0a0a0a] pr-4 text-white/90 font-medium tracking-wide">Madagascar Vanilla Latte</span>
                  </div>
                  <span className="text-white/70 font-serif">575</span>
                </li>
                <li className="flex justify-between items-end">
                  <div className="flex-1 border-b border-dashed border-white/20 mb-1 mr-4">
                    <span className="bg-[#0a0a0a] pr-4 text-white/90 font-medium tracking-wide">Oat Flat White</span>
                  </div>
                  <span className="text-white/70 font-serif">450</span>
                </li>
              </ul>
            </div>

            {/* Pastries Sub-menu */}
            <div>
              <h3 className="text-xl font-medium border-b border-white/10 pb-4 mb-6 text-white/80">Patisserie</h3>
              <ul className="space-y-6">
                <li className="flex justify-between items-end">
                  <div className="flex-1 border-b border-dashed border-white/20 mb-1 mr-4">
                    <span className="bg-[#0a0a0a] pr-4 text-white/90 font-medium tracking-wide">Twice-Baked Almond Croissant</span>
                  </div>
                  <span className="text-white/70 font-serif">480</span>
                </li>
                <li className="flex justify-between items-end">
                  <div className="flex-1 border-b border-dashed border-white/20 mb-1 mr-4">
                    <span className="bg-[#0a0a0a] pr-4 text-white/90 font-medium tracking-wide">Pistachio Rose Cruffin</span>
                  </div>
                  <span className="text-white/70 font-serif">550</span>
                </li>
                <li className="flex justify-between items-end">
                  <div className="flex-1 border-b border-dashed border-white/20 mb-1 mr-4">
                    <span className="bg-[#0a0a0a] pr-4 text-white/90 font-medium tracking-wide">Matcha White Chocolate Cookie</span>
                  </div>
                  <span className="text-white/70 font-serif">350</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}