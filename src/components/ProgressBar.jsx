import React from 'react';

export default function ProgressBar({ value = 0, height = 8, showLabel = false }) {
  const clamped = Math.min(100, Math.max(0, value));
  const hue = (clamped / 100) * 120; // 0=red, 60=yellow, 120=green

  return (
    <div className="progress-bar-wrapper">
      <div
        className="progress-bar-track"
        style={{ height: `${height}px` }}
      >
        <div
          className="progress-bar-fill"
          style={{
            width: `${clamped}%`,
            background: `hsl(${hue}, 65%, 50%)`,
          }}
        />
      </div>
      {showLabel && <span className="progress-bar-label">{clamped}%</span>}
    </div>
  );
}
