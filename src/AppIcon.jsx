import React from 'react';
import { AppWindow } from 'lucide-react';
export default function AppIcon({ name, icons = {} }) {
  const icon = icons[name?.toLowerCase()];
  return icon ? (
    <img className="app-icon" src={icon} alt="" draggable="false" />
  ) : (
    <AppWindow className="app-icon" aria-hidden="true" />
  );
}
