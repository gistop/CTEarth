import type { ReactNode } from 'react';

type MapViewportFrameProps = {
  children: ReactNode;
  className?: string;
  readout?: string;
  status?: string;
  sunlightOpen?: boolean;
};

/** Shared chrome for every map surface, independent of the rendering engine. */
export function MapViewportFrame({ children, className, readout, status, sunlightOpen = false }: MapViewportFrameProps) {
  const classes = ['map-panel', sunlightOpen ? 'has-sunlight-control' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes}>
      {children}
      {status ? <div className="map-status">{status}</div> : null}
      {readout ? <div className="map-readout">{readout}</div> : null}
    </section>
  );
}

