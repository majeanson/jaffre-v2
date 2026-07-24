import { useEffect, useState } from 'react';

export interface QrCodeProps {
  /** The text to encode — here, the invite URL. */
  readonly value: string;
  /** Accessible label (the QR itself is drawn as one decorative path). */
  readonly label: string;
  readonly className?: string;
}

/**
 * A scan-to-join QR, rendered fully client-side (no network, no CDN — the
 * encoder is bundled) as a single crisp SVG path so it scales to any size.
 * Ink modules on a transparent ground; drop it on an ivory tile for the
 * classic look. Error-correction level M tolerates a little print/scan noise.
 *
 * `qrcode-generator` is dynamic-imported instead of statically bundled: this
 * component only ever renders behind a ShareSheet a small fraction of
 * visitors open, so the encoder shouldn't ride into the eager index chunk.
 * The path is recomputed only when `value` changes (not on every render).
 */
export function QrCode({ value, label, className }: QrCodeProps) {
  const [path, setPath] = useState<{ readonly d: string; readonly dim: number } | null>(null);

  useEffect(() => {
    let live = true;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      if (!live) return;
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      const count = qr.getModuleCount();
      const margin = 2; // quiet zone (modules) so scanners lock on
      const dim = count + margin * 2;
      let d = '';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) d += `M${String(c + margin)} ${String(r + margin)}h1v1h-1z`;
        }
      }
      setPath({ d, dim });
    });
    return () => {
      live = false;
    };
  }, [value]);

  if (path === null) return <div className={className} aria-hidden />;

  return (
    <svg
      viewBox={`0 0 ${String(path.dim)} ${String(path.dim)}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <path d={path.d} fill="var(--color-ap-ink)" />
    </svg>
  );
}
