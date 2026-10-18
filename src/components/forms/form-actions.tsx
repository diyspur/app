import React from 'react';

export interface FormActionsProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function FormActions({ children, className = '', style }: FormActionsProps) {
  return (
    <div
      className={`form-actions ${className}`.trim()}
      style={{
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginTop: '1.25rem',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
