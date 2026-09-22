/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FluidCanvas } from './components/FluidCanvas';

export default function App() {
  return (
    <main id="app-root" className="w-screen h-screen overflow-hidden bg-[#070709]">
      <FluidCanvas />
    </main>
  );
}

