import type { Metadata } from 'next';
import { supportEmail } from '@/lib/site-contact';
import { AnalyticsPreferences } from '@/components/analytics/analytics-preferences';

export const metadata: Metadata = {
  title: 'Privacidade e Proteção de Dados',
  description: 'Conheça nossa política de privacidade, cookies essenciais e controle de telemetria.',
};

export default function PrivacyPage() {
  return (
    <article className="container legal-copy">
      <header className="page-intro">
        <span className="eyebrow">Transparência e LGPD</span>
        <h1>Sua leitura é sua.</h1>
        <p>Política de privacidade e proteção de dados do clube DIYSPUR.</p>
      </header>

      <h2>1. Dados e propósito</h2>
      <p>
        Coletamos apenas os dados necessários para criar e autenticar sua conta, exibir seu perfil
        de acordo com as suas preferências, registrar o progresso de leitura e permitir a interação
        nos clubes e temporadas. Toda a persistência técnica é gerenciada no Supabase, com regras de
        segurança em nível de linha (RLS) habilitadas em todas as tabelas contendo dados de usuários.
      </p>

      <h2>2. Cookies essenciais e sessão</h2>
      <p>
        Utilizamos cookies técnicos estritamente necessários para manter e renovar sua sessão autenticada.
        A navegação nas áreas públicas do catálogo e das temporadas não exige a criação de conta nem
        o uso de cookies de rastreamento.
      </p>

      <h2>3. Telemetria e Analytics opcional</h2>
      <p>
        Para entender padrões de navegação e melhorar a estabilidade da plataforma, utilizamos métricas técnicas
        (Sentry para diagnóstico de falhas sem coleta de dados pessoais) e ferramentas de telemetria e usabilidade
        (PostHog, Google Analytics 4, Microsoft Clarity e Grafana Faro).
      </p>
      <p>
        <strong>O analytics só é ativado se você conceder consentimento explícito (política estrita por padrão / fail-closed).</strong>
        {' '}A ausência de decisão é tratada estritamente como bloqueio, nunca como aceite.
        A qualquer momento você pode consultar seu status atual, alterar sua escolha ou revogar o consentimento
        utilizando o painel interativo abaixo:
      </p>

      <AnalyticsPreferences />

      <h2>4. Ferramentas de Telemetria e Finalidades</h2>
      <ul>
        <li>
          <strong>PostHog &amp; Google Analytics 4 (GA4):</strong> Métricas agregadas de produto e navegação para identificar livros populares e aperfeiçoar fluxos de leitura.
        </li>
        <li>
          <strong>Microsoft Clarity:</strong> Mapas de calor e comportamento de tela com mascaramento completo de dados sensíveis para testes de usabilidade.
        </li>
        <li>
          <strong>Grafana Faro:</strong> Diagnóstico técnico de desempenho (Core Web Vitals), tempo de carregamento e estabilidade da interface.
        </li>
        <li>
          <strong>Sentry:</strong> Registro essencial de exceções técnicas e erros de runtime em produção.
        </li>
      </ul>
      <p>
        A recusa ou revogação de consentimento não impede nem limita o uso das funcionalidades do clube.
      </p>

      <h2>5. Seus direitos sob a LGPD</h2>
      <p>
        Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar a
        confirmação da existência de tratamento, o acesso aos seus dados, a correção de dados incompletos ou
        a exclusão de sua conta a qualquer momento pelo suporte do clube.
      </p>

      <h2>6. Contato</h2>
      <p>
        Para dúvidas sobre privacidade ou exercer seus direitos de titular de dados, entre em contato pelo
        email <code>{supportEmail}</code>.
      </p>
    </article>
  );
}
