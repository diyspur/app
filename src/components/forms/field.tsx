import React from 'react';

type BaseFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
};

type InputFieldProps = BaseFieldProps & {
  as?: 'input';
} & React.InputHTMLAttributes<HTMLInputElement>;

type TextareaFieldProps = BaseFieldProps & {
  as: 'textarea';
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

type SelectFieldProps = BaseFieldProps & {
  as: 'select';
} & React.SelectHTMLAttributes<HTMLSelectElement>;

export type FieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps;

export function Field(props: FieldProps) {
  const { id, label, hint, error, as = 'input', className = '', children, ...rest } = props;

  const describedBy = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(' ') || undefined;

  const fieldClass = `field ${className}`.trim();

  return (
    <div className="field-group">
      <label htmlFor={id} className="field-label">
        {label}
      </label>

      {as === 'textarea' ? (
        <textarea
          id={id}
          className={fieldClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : as === 'select' ? (
        <select
          id={id}
          className={fieldClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {children}
        </select>
      ) : (
        <input
          id={id}
          className={fieldClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}

      {hint && !error && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}

      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
