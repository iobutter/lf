import React, { useEffect, useRef } from 'react';
import createGlobe from 'cobe';

interface CobeGlobeProps {
  markers: any[];
  rotation: [number, number, number];
  zoom: number;
  onRotationChange?: (rotation: [number, number, number]) => void;
}

export default function CobeGlobe({ markers, rotation, zoom, onRotationChange }: CobeGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const currentPhi = useRef(0);
  const currentTheta = useRef(0);
  const widthRef = useRef(0);

  // Use refs for props that change frequently to avoid recreating the globe
  const markersRef = useRef(markers);
  const rotationRef = useRef(rotation);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    let phi = currentPhi.current;
    let theta = currentTheta.current;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        widthRef.current = entry.contentRect.width;
      }
    });
    resizeObserver.observe(containerRef.current);
    widthRef.current = containerRef.current.offsetWidth;

    // Pre-calculate markers to avoid mapping 60 times a second
    const getCobeMarkers = () => markersRef.current.map(m => ({
      location: [m.coordinates![1], m.coordinates![0]] as [number, number], // lat, lon
      size: m.isTop2 ? 0.08 : m.isRecent ? 0.05 : 0.03
    }));

    let currentCobeMarkers = getCobeMarkers();

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: widthRef.current * 2 || 1600,
      height: widthRef.current * 2 || 1600,
      phi: phi,
      theta: theta,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.05, 0.05, 0.05],
      markerColor: [0.93, 0.26, 0.26], // red-500
      glowColor: [0.1, 0.1, 0.2],
      markers: currentCobeMarkers
    });

    let animationFrameId: number;

    const render = () => {
      // Target rotation from props
      const targetPhi = -rotationRef.current[0] * (Math.PI / 180);
      const targetTheta = -rotationRef.current[1] * (Math.PI / 180);

      // Smooth interpolation
      phi += (targetPhi - phi) * 0.05;
      theta += (targetTheta - theta) * 0.05;

      // Add user interaction
      if (pointerInteracting.current !== null) {
        const delta = pointerInteracting.current - pointerInteractionMovement.current;
        phi += delta * 0.005;
        pointerInteracting.current = pointerInteractionMovement.current;
        
        // Update parent rotation state if needed
        if (onRotationChange) {
          onRotationChange([-phi * (180 / Math.PI), -theta * (180 / Math.PI), 0]);
        }
      } else {
        // Auto rotate slowly if not interacting and not focused on a specific point
        if (rotationRef.current[0] === 0 && rotationRef.current[1] === 0) {
          phi += 0.002;
        }
      }

      currentPhi.current = phi;
      currentTheta.current = theta;

      const w = Math.max(1, widthRef.current * 2);

      globe.update({
        phi,
        theta,
        width: w,
        height: w,
        markers: currentCobeMarkers
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      globe.destroy();
    };
  }, [markers, onRotationChange]); // Recreate when markers change, but not rotation

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{
          width: 800,
          height: 800,
          maxWidth: '100%',
          aspectRatio: 1,
          opacity: 1,
          transition: 'opacity 1s ease, transform 0.2s ease-out',
          transform: `scale(${zoom})`
        }}
        onPointerDown={(e) => {
          pointerInteracting.current = e.clientX;
          pointerInteractionMovement.current = e.clientX;
        }}
        onPointerUp={() => {
          pointerInteracting.current = null;
        }}
        onPointerOut={() => {
          pointerInteracting.current = null;
        }}
        onPointerMove={(e) => {
          if (pointerInteracting.current !== null) {
            pointerInteractionMovement.current = e.clientX;
          }
        }}
      />
    </div>
  );
}
