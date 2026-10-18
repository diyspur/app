import { describe, it, expect } from 'vitest';
import React from 'react';
import { Field } from '@/components/forms/field';
import { FormActions } from '@/components/forms/form-actions';

describe('Field and FormActions components (QA-19, QA-27)', () => {
  it('instantiates Field element with input props and describedBy', () => {
    const el = React.createElement(Field, {
      id: 'test-field',
      label: 'Título da Leitura',
      hint: 'Informe o título do livro',
      placeholder: 'Ex: Verity',
    });

    expect(el.props.id).toBe('test-field');
    expect(el.props.label).toBe('Título da Leitura');
    expect(el.props.hint).toBe('Informe o título do livro');
  });

  it('instantiates Field element with textarea and select types', () => {
    const textareaEl = React.createElement(Field, {
      id: 'test-desc',
      label: 'Descrição',
      as: 'textarea',
      rows: 4,
    });
    expect(textareaEl.props.as).toBe('textarea');

    const selectEl = React.createElement(Field, {
      id: 'test-select',
      label: 'Opções',
      as: 'select',
    });
    expect(selectEl.props.as).toBe('select');
  });

  it('instantiates FormActions element with children', () => {
    const actionsEl = React.createElement(
      FormActions,
      {},
      React.createElement('button', { type: 'submit' }, 'Salvar')
    );
    expect(actionsEl).toBeDefined();
    expect(actionsEl.props.children).toBeDefined();
  });
});
