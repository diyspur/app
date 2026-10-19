import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field } from '@/components/forms/field';
import { FormActions } from '@/components/forms/form-actions';

describe('Field and FormActions components (QA-15, QA-19, QA-27)', () => {
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

  describe('Field accessibility and ARIA associations (QA-15)', () => {
    it('renders both hint and error spans when both are provided and references both in aria-describedby', () => {
      const html = renderToStaticMarkup(
        React.createElement(Field, {
          id: 'email-input',
          label: 'E-mail',
          hint: 'Informe seu melhor e-mail',
          error: 'E-mail inválido',
        })
      );

      // 1. Both span elements exist in the rendered markup
      expect(html).toContain('id="email-input-hint"');
      expect(html).toContain('Informe seu melhor e-mail');
      expect(html).toContain('id="email-input-error"');
      expect(html).toContain('E-mail inválido');
      expect(html).toContain('role="alert"');

      // 2. aria-describedby references both IDs
      expect(html).toContain('aria-describedby="email-input-hint email-input-error"');

      // 3. aria-invalid is true when error exists
      expect(html).toContain('aria-invalid="true"');
    });

    it('merges external aria-describedby from rest without overriding validation IDs', () => {
      const html = renderToStaticMarkup(
        React.createElement(Field, {
          id: 'cpf-input',
          label: 'CPF',
          hint: 'Apenas números',
          error: 'CPF incompleto',
          'aria-describedby': 'external-helper-text another-note',
        })
      );

      expect(html).toContain(
        'aria-describedby="external-helper-text another-note cpf-input-hint cpf-input-error"'
      );
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('id="cpf-input-hint"');
      expect(html).toContain('id="cpf-input-error"');
    });

    it('preserves external aria-invalid when no component error is provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(Field, {
          id: 'custom-state',
          label: 'Campo Customizado',
          'aria-invalid': true,
        })
      );

      expect(html).toContain('aria-invalid="true"');
    });

    it('properly associates aria-describedby and aria-invalid for textarea and select elements', () => {
      const textareaHtml = renderToStaticMarkup(
        React.createElement(Field, {
          id: 'bio-field',
          label: 'Biografia',
          as: 'textarea',
          hint: 'Conte sobre você',
          error: 'Biografia muito curta',
        })
      );
      expect(textareaHtml).toContain('<textarea');
      expect(textareaHtml).toContain('aria-describedby="bio-field-hint bio-field-error"');
      expect(textareaHtml).toContain('aria-invalid="true"');
      expect(textareaHtml).toContain('id="bio-field-hint"');
      expect(textareaHtml).toContain('id="bio-field-error"');

      const selectHtml = renderToStaticMarkup(
        React.createElement(
          Field,
          {
            id: 'category-field',
            label: 'Categoria',
            as: 'select',
            hint: 'Escolha uma categoria',
            error: 'Seleção obrigatória',
          },
          React.createElement('option', { value: 'fiction' }, 'Ficção')
        )
      );
      expect(selectHtml).toContain('<select');
      expect(selectHtml).toContain('aria-describedby="category-field-hint category-field-error"');
      expect(selectHtml).toContain('aria-invalid="true"');
      expect(selectHtml).toContain('id="category-field-hint"');
      expect(selectHtml).toContain('id="category-field-error"');
    });

    it('omits aria-describedby when neither hint, error nor external describedby is provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(Field, {
          id: 'simple-field',
          label: 'Simples',
        })
      );
      expect(html).not.toContain('aria-describedby');
      expect(html).not.toContain('aria-invalid');
    });
  });

  describe('CyberButton touch target (QA-05)', () => {
    it('applies min-block-size: var(--control-hit-size) and 48px min dimensions', async () => {
      const { CyberButton } = await import('@/components/ui/cyber-button');
      const html = renderToStaticMarkup(
        React.createElement(CyberButton, { size: 'sm' }, 'Confirmar')
      );

      expect(html).toContain('button-small');
      expect(html).toContain('min-block-size:var(--control-hit-size)');
      expect(html).toContain('min-height:48px');
      expect(html).toContain('min-width:48px');
    });
  });
});
