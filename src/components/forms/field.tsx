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
  const {
    id,
    label,
    hint,
    error,
    as = 'input',
    className = '',
    children,
    'aria-describedby': externalDescribedBy,
    'aria-invalid': externalInvalid,
    ...rest
  } = props;

  const describedBy = [
    ...(externalDescribedBy?.split(/\s+/).filter(Boolean) ?? []),
    ...(hint ? [`${id}-hint`] : []),
    ...(error ? [`${id}-error`] : []),
  ].join(' ') || undefined;

  const invalid = error ? true : externalInvalid;
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
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      ) : as === 'select' ? (
        <select
          id={id}
          className={fieldClass}
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        >
          {children}
        </select>
      ) : (
        <input
          id={id}
          className={fieldClass}
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      )}

      {hint && (
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
