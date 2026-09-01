'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Engine } from '@/engine/Engine';

const EngineContext = createContext<Engine | null>(null);

export function useEngine() {
  return useContext(EngineContext);
}

interface Props {
  children?: ReactNode;
  onReady?(engine: Engine): void;
}

/**
 * Hosts the two canvases and the label overlay, and owns the Engine instance.
 *
 * This component renders exactly once. Everything that moves is driven by the
 * engine's own loop, so React can re-render the interface above it as often as
 * it likes without ever touching a frame.
 */
export function OrbitStage({ children, onReady }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const cosmos = useRef<HTMLCanvasElement>(null);
  const objects = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    if (!surface.current || !cosmos.current || !objects.current || !labels.current) return;
    const e = new Engine();
    let disposed = false;
    void e
      .mount({
        surface: surface.current,
        cosmosCanvas: cosmos.current,
        objectCanvas: objects.current,
        labelHost: labels.current,
      })
      .then(() => {
        if (!disposed) readyRef.current?.(e);
      });
    setEngine(e);
    return () => {
      disposed = true;
      e.destroy();
      setEngine(null);
    };
  }, []);

  return (
    <EngineContext.Provider value={engine}>
      <div
        ref={surface}
        className="fixed inset-0 overflow-hidden no-select"
        style={{ touchAction: 'none', cursor: 'default' }}
      >
        <canvas ref={cosmos} className="absolute inset-0 block h-full w-full" />
        <canvas ref={objects} className="absolute inset-0 block h-full w-full" />
        <div
          ref={labels}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        />
      </div>
      {children}
    </EngineContext.Provider>
  );
}
