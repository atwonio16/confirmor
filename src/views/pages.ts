import type { AppointmentRow, ClinicRow } from '../types/domain';
import { escapeHtml } from '../utils/html';
import { formatDateForRo, formatTimeForRo } from '../utils/datetime';

interface AdminClinicAccountView {
  clinicId: string;
  clinicName: string;
  timezone: string;
  exportHour: number;
  deadlineHour: number;
  createdAtIso: string;
  managerEmail: string | null;
}

interface LayoutInput {
  title: string;
  body: string;
  headerHtml?: string;
  autoRefreshSeconds?: number;
}

const BASE_STYLES = `
  :root {
    --bg-a: #f4f8f7;
    --bg-b: #eef2ff;
    --ink: #162026;
    --ink-soft: #5b6c74;
    --surface: rgba(255, 255, 255, 0.9);
    --surface-strong: #ffffff;
    --line: #d7e2e8;
    --accent: #0f766e;
    --accent-2: #1d4ed8;
    --ok: #15803d;
    --danger: #b91c1c;
    --pending: #9a3412;
    --shadow: 0 18px 40px rgba(19, 42, 56, 0.12);
    --radius-lg: 18px;
    --radius-md: 12px;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Manrope', 'Trebuchet MS', 'Segoe UI', sans-serif;
    color: var(--ink);
    background:
      radial-gradient(circle at 14% 14%, rgba(23, 179, 152, 0.2), transparent 38%),
      radial-gradient(circle at 84% 4%, rgba(29, 78, 216, 0.2), transparent 40%),
      linear-gradient(160deg, var(--bg-a), var(--bg-b));
    min-height: 100vh;
  }

  .page-shell {
    max-width: 1120px;
    margin: 0 auto;
    padding: 28px 16px 56px;
    animation: page-enter 0.45s ease both;
  }

  .masthead {
    margin-bottom: 18px;
  }

  .brand-line {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .brand-title {
    margin: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: clamp(1.55rem, 2.3vw, 2.1rem);
    line-height: 1.1;
    color: #0f2c39;
  }

  .brand-subtitle {
    margin: 6px 0 0;
    color: var(--ink-soft);
    font-size: 0.95rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #c6d5dd;
    border-radius: 999px;
    padding: 7px 12px;
    font-size: 0.8rem;
    color: #274452;
    background: rgba(255, 255, 255, 0.7);
  }

  .top-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .top-nav a {
    text-decoration: none;
    color: #173d4d;
    font-weight: 700;
    border: 1px solid #c8d7de;
    background: rgba(255, 255, 255, 0.72);
    padding: 9px 12px;
    border-radius: 10px;
    transition: 0.16s ease;
  }

  .top-nav a:hover {
    transform: translateY(-1px);
    border-color: #95b8c8;
    background: #ffffff;
  }

  .top-nav a.is-active {
    border-color: #0f766e;
    background: rgba(15, 118, 110, 0.12);
    color: #0e4f4d;
  }

  .stack {
    display: grid;
    gap: 16px;
  }

  .card {
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: var(--radius-lg);
    padding: 18px;
    box-shadow: var(--shadow);
    backdrop-filter: blur(2px);
    animation: card-rise 0.35s ease both;
  }

  .stack > .card:nth-child(2) {
    animation-delay: 0.04s;
  }

  .stack > .card:nth-child(3) {
    animation-delay: 0.08s;
  }

  .card--narrow {
    max-width: 520px;
  }

  .center-wrap {
    display: grid;
    justify-content: center;
  }

  .card h2 {
    margin: 0 0 8px;
    font-size: 1.1rem;
    font-weight: 800;
    color: #143746;
  }

  .card p {
    margin: 0;
  }

  .muted {
    color: var(--ink-soft);
  }

  .refresh-note {
    display: inline-flex;
    align-items: center;
    margin-top: 10px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid #b9d3de;
    background: #edf8fc;
    font-size: 0.78rem;
    color: #1f4e62;
  }

  .alert {
    margin: 0 0 12px;
    padding: 11px 12px;
    border-radius: var(--radius-md);
    font-weight: 700;
    border: 1px solid transparent;
    font-size: 0.92rem;
  }

  .alert--ok {
    background: #effcf2;
    border-color: #b7ebc1;
    color: #166534;
  }

  .alert--error {
    background: #fff1f2;
    border-color: #fecdd3;
    color: #9f1239;
  }

  .metric-grid {
    margin-top: 14px;
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .metric {
    border: 1px solid #d5e3ea;
    border-radius: 12px;
    background: var(--surface-strong);
    padding: 12px;
  }

  .metric__label {
    display: block;
    font-size: 0.78rem;
    color: #4c6470;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
    font-weight: 700;
  }

  .metric__value {
    display: block;
    font-size: 1.45rem;
    font-weight: 800;
    color: #102f3d;
  }

  .metric--pending .metric__value {
    color: var(--pending);
  }

  .metric--confirmed .metric__value {
    color: var(--ok);
  }

  .metric--canceled_by_patient .metric__value,
  .metric--canceled_auto .metric__value {
    color: var(--danger);
  }

  .action-row {
    margin-top: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  form {
    margin: 0;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field label {
    font-size: 0.84rem;
    color: #355161;
    font-weight: 700;
  }

  input,
  select,
  button {
    font: inherit;
  }

  input,
  select {
    width: 100%;
    border: 1px solid #c7d7df;
    border-radius: 10px;
    padding: 10px 12px;
    background: #fff;
    color: #14252d;
    transition: 0.16s ease;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: #1d4ed8;
    box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.15);
  }

  button,
  .btn-link {
    border: 1px solid transparent;
    border-radius: 10px;
    padding: 10px 14px;
    font-weight: 800;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: 0.16s ease;
  }

  button,
  .btn-link {
    color: #fff;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    box-shadow: 0 10px 20px rgba(15, 118, 110, 0.25);
  }

  button:hover,
  .btn-link:hover {
    transform: translateY(-1px);
    filter: brightness(1.03);
  }

  button.btn--soft,
  .btn-link.btn-link--soft {
    background: #ffffff;
    color: #16415b;
    border-color: #cad8e2;
    box-shadow: none;
  }

  button.btn--blue,
  .btn-link.btn-link--blue {
    color: #ffffff;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    border-color: #1d4ed8;
    box-shadow: 0 10px 20px rgba(37, 99, 235, 0.3);
  }

  button.btn--danger {
    background: var(--danger);
    border-color: #7f1d1d;
    box-shadow: none;
  }

  .table-wrap {
    margin-top: 12px;
    border: 1px solid #d7e2e8;
    border-radius: 12px;
    overflow: auto;
    background: #fff;
  }

  table {
    width: 100%;
    min-width: 860px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 11px 10px;
    border-bottom: 1px solid #e7edf1;
    text-align: left;
    font-size: 0.9rem;
    vertical-align: top;
  }

  th {
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #49606b;
    background: #f1f6f9;
  }

  tr:hover td {
    background: #f8fbfd;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 10px;
    border: 1px solid transparent;
    font-size: 0.75rem;
    font-weight: 800;
  }

  .status-badge--pending {
    border-color: #fdba74;
    background: #fff7ed;
    color: #9a3412;
  }

  .status-badge--confirmed {
    border-color: #86efac;
    background: #f0fdf4;
    color: #166534;
  }

  .status-badge--canceled_by_patient,
  .status-badge--canceled_auto {
    border-color: #fda4af;
    background: #fff1f2;
    color: #9f1239;
  }

  .inline-form {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .inline-form input {
    min-width: 170px;
  }

  .actions-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hero-note {
    margin-top: 10px;
    color: #2d5567;
    font-size: 0.9rem;
  }

  .dashboard-actions {
    margin-top: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .dashboard-actions__left {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .csv-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    border: 1px solid transparent;
    padding: 8px 12px;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .csv-status__dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    flex: 0 0 auto;
  }

  .csv-status--loaded {
    color: #166534;
    background: #ecfdf3;
    border-color: #86efac;
  }

  .csv-status--loaded .csv-status__dot {
    background: #22c55e;
  }

  .csv-status--missing {
    color: #991b1b;
    background: #fff1f2;
    border-color: #fda4af;
  }

  .csv-status--missing .csv-status__dot {
    background: #ef4444;
  }

  .logout-floating {
    position: fixed !important;
    left: 24px;
    bottom: 24px;
    z-index: 60;
    text-decoration: none;
    color: #fff;
    background: #1f2e39;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 12px;
    padding: 10px 14px;
    font-weight: 800;
    box-shadow: 0 16px 30px rgba(15, 23, 31, 0.34);
    transition: 0.16s ease;
  }

  .logout-floating:hover {
    transform: translateY(-1px);
    background: #111b22;
  }

  @media (max-width: 760px) {
    .page-shell {
      padding: 22px 12px 44px;
    }

    .card {
      padding: 14px;
      border-radius: 14px;
    }

    .top-nav {
      gap: 8px;
    }

    .top-nav a {
      flex: 1 1 46%;
      text-align: center;
      padding: 9px 8px;
    }

    .field-grid {
      grid-template-columns: 1fr;
    }

    .action-row {
      flex-direction: column;
      align-items: stretch;
    }

    .action-row .btn-link,
    .action-row button {
      width: 100%;
    }

    .dashboard-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .dashboard-actions__left {
      width: 100%;
      display: grid;
      gap: 8px;
    }

    .dashboard-actions .btn-link {
      width: 100%;
    }

    .logout-floating {
      left: 12px;
      right: 12px;
      bottom: 12px;
      text-align: center;
      justify-content: center;
      display: inline-flex;
    }
  }

  @keyframes page-enter {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }

  @keyframes card-rise {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
  }
`;

function renderLayout(input: LayoutInput): string {
  const autoRefreshMeta =
    typeof input.autoRefreshSeconds === 'number' && input.autoRefreshSeconds > 0
      ? `<meta http-equiv="refresh" content="${Math.floor(input.autoRefreshSeconds)}" />`
      : '';

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${autoRefreshMeta}
  <title>${escapeHtml(input.title)} - Confirmor</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@500;700;800&display=swap" rel="stylesheet" />
  <style>${BASE_STYLES}</style>
</head>
<body>
  <main class="page-shell">
    ${input.headerHtml ?? ''}
    ${input.body}
  </main>
</body>
</html>`;
}

function renderPublicHeader(input: { title: string; subtitle: string; chip?: string }): string {
  return `
    <header class="masthead">
      <div class="brand-line">
        <div>
          <h1 class="brand-title">${escapeHtml(input.title)}</h1>
          <p class="brand-subtitle">${escapeHtml(input.subtitle)}</p>
        </div>
        ${input.chip ? `<span class="chip">${escapeHtml(input.chip)}</span>` : ''}
      </div>
    </header>
  `;
}

function renderClinicHeader(clinic: ClinicRow): string {
  return `
    <header class="masthead">
      <div class="brand-line">
        <div>
          <h1 class="brand-title">${escapeHtml(clinic.name)}</h1>
          <p class="brand-subtitle">Panou operational Confirmor pentru clinica ta</p>
        </div>
        <span class="chip">Clinic ID: ${escapeHtml(clinic.id)}</span>
      </div>
    </header>
  `;
}

function renderClinicFloatingLogoutButton(): string {
  return `<a class="logout-floating" href="/logout">Logout</a>`;
}

function renderAdminHeader(adminEmail: string): string {
  return `
    <header class="masthead">
      <div class="brand-line">
        <div>
          <h1 class="brand-title">Confirmor Admin</h1>
          <p class="brand-subtitle">Administrare clinici si conturi manager</p>
        </div>
        <span class="chip">${escapeHtml(adminEmail)}</span>
      </div>
      <nav class="top-nav">
        <a class="is-active" href="/admin">Admin Dashboard</a>
        <a href="/admin/logout">Logout Admin</a>
        <a href="/login">Login clinic</a>
      </nav>
    </header>
  `;
}

function renderFlash(input: { message?: string; error?: string }): string {
  const ok = input.message ? `<p class="alert alert--ok">${escapeHtml(input.message)}</p>` : '';
  const error = input.error ? `<p class="alert alert--error">${escapeHtml(input.error)}</p>` : '';
  return `${ok}${error}`;
}

function renderStatusBadge(status: AppointmentRow['status']): string {
  const labels: Record<AppointmentRow['status'], string> = {
    pending: 'In asteptare',
    confirmed: 'Confirmata',
    canceled_by_patient: 'Anulata de pacient',
    canceled_auto: 'Anulata automat'
  };

  return `<span class="status-badge status-badge--${status}">${labels[status]}</span>`;
}

export function renderLoginPage(input: { csrfToken: string; error?: string }): string {
  const body = `
    <section class="center-wrap">
      <article class="card card--narrow">
        <h2>Login manager clinica</h2>
        <p class="hero-note">Intri rapid, incarci CSV-ul de dimineata si urmaresti statusurile in timp real.</p>
        ${renderFlash({ error: input.error })}
        <form method="post" action="/login" class="stack">
          <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}" />
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div class="field">
            <label for="password">Parola</label>
            <input id="password" name="password" type="password" required />
          </div>
          <button type="submit">Intra in dashboard</button>
        </form>
      </article>
    </section>
  `;

  return renderLayout({
    title: 'Login',
    headerHtml: renderPublicHeader({
      title: 'Confirmor',
      subtitle: 'Sistem anti no-show pentru clinici dentare',
      chip: 'Clinic Access'
    }),
    body
  });
}

export function renderAdminLoginPage(input: { csrfToken: string; error?: string }): string {
  const body = `
    <section class="center-wrap">
      <article class="card card--narrow">
        <h2>Login administrator platforma</h2>
        <p class="hero-note">De aici creezi clinici, conturi manager si administrezi accesul.</p>
        ${renderFlash({ error: input.error })}
        <form method="post" action="/admin/login" class="stack">
          <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}" />
          <div class="field">
            <label for="admin-email">Email admin</label>
            <input id="admin-email" name="email" type="email" required />
          </div>
          <div class="field">
            <label for="admin-password">Parola</label>
            <input id="admin-password" name="password" type="password" required />
          </div>
          <button type="submit">Intra in panelul admin</button>
        </form>
        <div class="action-row">
          <a class="btn-link btn-link--soft" href="/login">Login manager clinica</a>
        </div>
      </article>
    </section>
  `;

  return renderLayout({
    title: 'Admin Login',
    headerHtml: renderPublicHeader({
      title: 'Confirmor Admin',
      subtitle: 'Control central pentru conturile clinicilor',
      chip: 'Platform Access'
    }),
    body
  });
}

export function renderAdminDashboardPage(input: {
  adminEmail: string;
  csrfToken: string;
  clinicAccounts: AdminClinicAccountView[];
  message?: string;
  error?: string;
}): string {
  const rows = input.clinicAccounts
    .map((row) => {
      return `<tr>
        <td>${escapeHtml(row.clinicName)}</td>
        <td>${escapeHtml(row.clinicId)}</td>
        <td>${escapeHtml(row.timezone)}</td>
        <td>${row.exportHour}:00</td>
        <td>${row.deadlineHour}:00</td>
        <td>${escapeHtml(row.managerEmail ?? '(fara manager)')}</td>
        <td>${escapeHtml(row.createdAtIso)}</td>
        <td>
          <div class="actions-col">
            <form class="inline-form" method="post" action="/admin/clinics/${encodeURIComponent(row.clinicId)}/settings">
              <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}" />
              <input name="clinic_name" value="${escapeHtml(row.clinicName)}" required />
              <input name="timezone" value="${escapeHtml(row.timezone)}" required />
              <input name="export_hour" type="number" min="0" max="23" value="${row.exportHour}" required />
              <input name="deadline_hour" type="number" min="0" max="23" value="${row.deadlineHour}" required />
              <button type="submit" class="btn--soft">Salveaza setari</button>
            </form>
            <form class="inline-form" method="post" action="/admin/clinics/${encodeURIComponent(row.clinicId)}/reset-password">
              <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}" />
              <input name="new_password" type="password" minlength="8" placeholder="Parola noua" required />
              <button type="submit" class="btn--soft">Reset parola</button>
            </form>
            <form class="inline-form" method="post" action="/admin/clinics/${encodeURIComponent(row.clinicId)}/delete" onsubmit="return confirm('Stergerea clinicii este permanenta. Continui?')">
              <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}" />
              <button type="submit" class="btn--danger">Sterge clinica</button>
            </form>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  const body = `
    <section class="stack">
      <article class="card">
        <h2>Creeaza clinica noua + cont manager</h2>
        <p class="muted">Completezi datele o singura data, apoi managerul clinicii se logheaza in propriul dashboard.</p>
        ${renderFlash({ message: input.message, error: input.error })}
        <form method="post" action="/admin/clinics" class="stack">
          <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}" />
          <div class="field-grid">
            <div class="field">
              <label for="clinic-name">Nume clinica</label>
              <input id="clinic-name" name="clinic_name" required />
            </div>
            <div class="field">
              <label for="clinic-timezone">Timezone</label>
              <input id="clinic-timezone" name="timezone" value="Europe/Bucharest" required />
            </div>
            <div class="field">
              <label for="clinic-export">Ora export (0-23)</label>
              <input id="clinic-export" name="export_hour" type="number" min="0" max="23" value="10" required />
            </div>
            <div class="field">
              <label for="clinic-deadline">Ora limita (0-23)</label>
              <input id="clinic-deadline" name="deadline_hour" type="number" min="0" max="23" value="18" required />
            </div>
            <div class="field">
              <label for="manager-email">Email manager</label>
              <input id="manager-email" name="manager_email" type="email" required />
            </div>
            <div class="field">
              <label for="manager-password">Parola manager (min 8)</label>
              <input id="manager-password" name="manager_password" type="password" minlength="8" required />
            </div>
          </div>
          <div class="action-row">
            <button type="submit">Creeaza clinica</button>
          </div>
        </form>
      </article>

      <article class="card">
        <h2>Clinici existente</h2>
        <p class="muted">Lista completa cu setari, manager si actiuni rapide.</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Clinica</th>
                <th>Clinic ID</th>
                <th>Timezone</th>
                <th>Export</th>
                <th>Deadline</th>
                <th>Email manager</th>
                <th>Creat la (ISO)</th>
                <th>Actiuni</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8">Nu exista clinici inregistrate.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;

  return renderLayout({
    title: 'Admin',
    headerHtml: renderAdminHeader(input.adminEmail),
    body
  });
}

export function renderDashboardPage(input: {
  clinic: ClinicRow;
  dayKey: string;
  counts: {
    total: number;
    pending: number;
    confirmed: number;
    canceled_by_patient: number;
    canceled_auto: number;
  };
  appointments: AppointmentRow[];
  csvStatus: {
    state: 'loaded' | 'missing';
    text: string;
  };
}): string {
  const metricItems = [
    { label: 'Total', value: input.counts.total, className: 'metric--total' },
    { label: 'In asteptare', value: input.counts.pending, className: 'metric--pending' },
    { label: 'Confirmate', value: input.counts.confirmed, className: 'metric--confirmed' },
    { label: 'Anulate pacient', value: input.counts.canceled_by_patient, className: 'metric--canceled_by_patient' },
    { label: 'Anulate sistem', value: input.counts.canceled_auto, className: 'metric--canceled_auto' }
  ]
    .map((metric) => {
      return `
        <div class="metric ${metric.className}">
          <span class="metric__label">${escapeHtml(metric.label)}</span>
          <span class="metric__value">${metric.value}</span>
        </div>
      `;
    })
    .join('');

  const appointmentRows = input.appointments
    .map((appointment) => {
      const date = formatDateForRo(appointment.start_datetime, input.clinic.timezone);
      const time = formatTimeForRo(appointment.start_datetime, input.clinic.timezone);

      return `<tr>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(time)}</td>
        <td>${escapeHtml(appointment.external_appointment_id)}</td>
        <td>${escapeHtml(appointment.phone)}</td>
        <td>${escapeHtml(appointment.appointment_type)}</td>
        <td>${escapeHtml(appointment.patient_name ?? '-')}</td>
        <td>${escapeHtml(appointment.provider_name ?? '-')}</td>
        <td>${renderStatusBadge(appointment.status)}</td>
      </tr>`;
    })
    .join('');

  const body = `
    <section class="stack">
      <article class="card">
        <h2>Status programari pentru ${escapeHtml(input.dayKey)}</h2>
        <p class="muted">Focus pe ziua de poimaine. Toate cifrele se actualizeaza automat.</p>
        <span class="refresh-note">Actualizare automata la 5 minute</span>
        <div class="metric-grid">
          ${metricItems}
        </div>
        <div class="dashboard-actions">
          <div class="dashboard-actions__left">
            <a class="btn-link btn-link--blue" href="/dashboard/import">Incarca CSV</a>
            <a class="btn-link btn-link--soft" href="/csv-template">Descarca model CSV</a>
          </div>
          <span class="csv-status csv-status--${input.csvStatus.state}">
            <span class="csv-status__dot"></span>
            ${escapeHtml(input.csvStatus.text)}
          </span>
        </div>
      </article>

      <article class="card">
        <h2>Programari pentru ${escapeHtml(input.dayKey)}</h2>
        <p class="muted">Lista este afisata direct aici, sub cardul principal.</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Ora</th>
                <th>External ID</th>
                <th>Telefon</th>
                <th>Tip</th>
                <th>Pacient</th>
                <th>Medic</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${appointmentRows || '<tr><td colspan="8">Nu exista programari pentru aceasta zi.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </section>
    ${renderClinicFloatingLogoutButton()}
  `;

  return renderLayout({
    title: 'Dashboard',
    headerHtml: renderClinicHeader(input.clinic),
    body,
    autoRefreshSeconds: 300
  });
}

export function renderImportPage(input: {
  clinic: ClinicRow;
  csrfToken: string;
  message?: string;
  error?: string;
}): string {
  const body = `
    <section class="stack">
      <article class="card">
        <h2>Import CSV zilnic</h2>
        <p class="muted">Incarca snapshot-ul cu programari pentru urmatoarele 2 zile.</p>
        ${renderFlash({ message: input.message, error: input.error })}
        <form method="post" action="/dashboard/import?_csrf=${encodeURIComponent(input.csrfToken)}" enctype="multipart/form-data" class="stack">
          <div class="field">
            <label for="csv-file">Fisier CSV</label>
            <input id="csv-file" type="file" name="file" accept=".csv,text/csv" required />
          </div>
          <div class="action-row">
            <button type="submit" class="btn--blue">Incarca CSV</button>
            <a class="btn-link btn-link--soft" href="/csv-template">Descarca model CSV</a>
          </div>
        </form>
        <p class="hero-note">Endpoint API: <strong>POST /api/clinics/:clinicId/csv-import</strong> (multipart, camp <strong>file</strong>).</p>
      </article>
    </section>
    ${renderClinicFloatingLogoutButton()}
  `;

  return renderLayout({
    title: 'Import',
    headerHtml: renderClinicHeader(input.clinic),
    body
  });
}

export function renderAppointmentsPage(input: {
  clinic: ClinicRow;
  day: string;
  appointments: AppointmentRow[];
}): string {
  const rows = input.appointments
    .map((appointment) => {
      const date = formatDateForRo(appointment.start_datetime, input.clinic.timezone);
      const time = formatTimeForRo(appointment.start_datetime, input.clinic.timezone);

      return `<tr>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(time)}</td>
        <td>${escapeHtml(appointment.external_appointment_id)}</td>
        <td>${escapeHtml(appointment.phone)}</td>
        <td>${escapeHtml(appointment.appointment_type)}</td>
        <td>${escapeHtml(appointment.patient_name ?? '-')}</td>
        <td>${escapeHtml(appointment.provider_name ?? '-')}</td>
        <td>${renderStatusBadge(appointment.status)}</td>
      </tr>`;
    })
    .join('');

  const body = `
    <section class="stack">
      <article class="card">
        <h2>Programari pentru ${escapeHtml(input.day)}</h2>
        <p class="muted">Filtrezi rapid pe zi si vezi statusurile actualizate automat.</p>
        <span class="refresh-note">Actualizare automata la 5 minute</span>
        <form method="get" action="/dashboard/appointments" class="stack" style="margin-top:12px;">
          <div class="field-grid">
            <div class="field">
              <label for="day-filter">Zi (YYYY-MM-DD)</label>
              <input id="day-filter" name="day" value="${escapeHtml(input.day)}" required />
            </div>
          </div>
          <div class="action-row">
            <button type="submit">Aplica filtrul</button>
          </div>
        </form>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Ora</th>
                <th>External ID</th>
                <th>Telefon</th>
                <th>Tip</th>
                <th>Pacient</th>
                <th>Medic</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8">Nu exista programari pentru aceasta zi.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </section>
    ${renderClinicFloatingLogoutButton()}
  `;

  return renderLayout({
    title: 'Appointments',
    headerHtml: renderClinicHeader(input.clinic),
    body,
    autoRefreshSeconds: 300
  });
}

export function renderSettingsPage(input: {
  clinic: ClinicRow;
  csrfToken: string;
  message?: string;
  error?: string;
}): string {
  const body = `
    <section class="stack">
      <article class="card">
        <h2>Setari clinica</h2>
        <p class="muted">Configureaza datele principale folosite in fluxul de confirmare.</p>
        ${renderFlash({ message: input.message, error: input.error })}
        <form method="post" action="/dashboard/settings" class="stack">
          <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}" />
          <div class="field-grid">
            <div class="field">
              <label for="clinic-name">Nume clinica</label>
              <input id="clinic-name" name="name" value="${escapeHtml(input.clinic.name)}" required />
            </div>
            <div class="field">
              <label for="clinic-timezone">Timezone</label>
              <input id="clinic-timezone" name="timezone" value="${escapeHtml(input.clinic.timezone)}" required />
            </div>
            <div class="field">
              <label for="clinic-export-hour">Export hour (0-23)</label>
              <input id="clinic-export-hour" name="export_hour" type="number" min="0" max="23" value="${input.clinic.export_hour}" required />
            </div>
            <div class="field">
              <label for="clinic-deadline-hour">Deadline hour (0-23)</label>
              <input id="clinic-deadline-hour" name="deadline_hour" type="number" min="0" max="23" value="${input.clinic.deadline_hour}" required />
            </div>
          </div>
          <div class="action-row">
            <button type="submit">Salveaza setarile</button>
          </div>
        </form>
      </article>
    </section>
    ${renderClinicFloatingLogoutButton()}
  `;

  return renderLayout({
    title: 'Settings',
    headerHtml: renderClinicHeader(input.clinic),
    body
  });
}

export function renderTokenNeutralPage(message: string): string {
  const body = `
    <section class="center-wrap">
      <article class="card card--narrow">
        <h2>Status link</h2>
        <p class="muted">${escapeHtml(message)}</p>
      </article>
    </section>
  `;

  return renderLayout({
    title: 'Link Status',
    headerHtml: renderPublicHeader({
      title: 'Confirmor',
      subtitle: 'Confirmare programare',
      chip: 'Link pacient'
    }),
    body
  });
}

export function renderTokenSuccessPage(message: string): string {
  const body = `
    <section class="center-wrap">
      <article class="card card--narrow">
        <h2>Operatiune finalizata</h2>
        <p class="muted">${escapeHtml(message)}</p>
      </article>
    </section>
  `;

  return renderLayout({
    title: 'Success',
    headerHtml: renderPublicHeader({
      title: 'Confirmor',
      subtitle: 'Confirmare programare',
      chip: 'Link pacient'
    }),
    body
  });
}
