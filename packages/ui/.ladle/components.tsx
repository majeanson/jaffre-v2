import '@fontsource-variable/fraunces';
import '@fontsource-variable/instrument-sans';
import '../src/tokens.css';
import type { GlobalProvider } from '@ladle/react';
import { JaffreMotionConfig } from '../src/motion/config';

export const Provider: GlobalProvider = ({ children }) => (
  <JaffreMotionConfig>
    <div className="table-felt min-h-screen p-8">{children}</div>
  </JaffreMotionConfig>
);
