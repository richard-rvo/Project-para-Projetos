import React from 'react';

export default function Badge({ label, color }) {
  const colors = {
    green: { bg: 'var(--color-emerald)', text: '#fff' },
    orange: { bg: 'var(--color-orange)', text: '#fff' },
    red: { bg: 'var(--color-coral)', text: '#fff' },
    blue: { bg: 'var(--color-blue)', text: '#fff' },
    purple: { bg: 'var(--color-purple)', text: '#fff' },
    gray: { bg: 'rgba(128,128,128,0.2)', text: 'var(--color-text)' },
  };

  const c = colors[color] || colors.gray;

  return (
    <span
      className="badge"
      style={{ background: c.bg, color: c.text }}
    >
      {label}
    </span>
  );
}
