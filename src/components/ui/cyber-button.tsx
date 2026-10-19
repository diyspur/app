'use client';

import React from 'react';

export interface CyberButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'glass' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function CyberButton({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  className = '',
  disabled,
  style,
  ...props
}: CyberButtonProps) {
  const variantClass =
    variant === 'danger'
      ? 'button-danger'
      : variant === 'ghost' || variant === 'secondary'
        ? 'button-quiet'
        : '';

  const sizeClass = size === 'sm' ? 'button-small' : '';

  return (
    <button
      className={`button ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled || isLoading}
      style={{
        minBlockSize: 'var(--control-hit-size)',
        minHeight: '48px',
        minWidth: '48px',
        ...style,
      }}
      {...props}
    >
      {isLoading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }} aria-live="polite">
          <span>Carregando...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
