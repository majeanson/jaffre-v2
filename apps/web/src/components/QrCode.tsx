import qrcode from 'qrcode-generator';

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
 */
export function QrCode({ value, label, className }: QrCodeProps) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 2; // quiet zone (modules) so scanners lock on
  const dim = count + margin * 2;

  let path = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) path += `M${String(c + margin)} ${String(r + margin)}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${String(dim)} ${String(dim)}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <path d={path} fill="var(--color-ap-ink)" />
    </svg>
  );
}
