import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { DateTime } from 'luxon';
import { env } from '../config/env';
import { createSupabaseAuthClient } from '../db/supabase';
import { clearAdminSessionCookies, clearSessionCookies, setAdminSessionCookies, setSessionCookies } from '../auth/session';
import { getManagerUserByAuthId } from '../db/users';
import { dayAfterTomorrowLocal, dayRangeUtc } from '../utils/datetime';
import { countAppointmentsByStatus, getAppointmentById, getAppointmentsInRange, setAppointmentStatus } from '../db/appointments';
import { getClinicById } from '../db/clinics';
import {
  renderAppointmentsPage,
  renderAdminDashboardPage,
  renderAdminLoginPage,
  renderDashboardPage,
  renderImportPage,
  renderLoginPage,
  renderTokenNeutralPage,
  renderTokenSuccessPage
} from '../views/pages';
import { requireClinicOwnership, requireManagerAuth } from '../auth/middleware';
import { isPlatformAdminEmail, requirePlatformAdminAuth } from '../auth/adminMiddleware';
import { importCsvSnapshot } from './csvImportService';
import { findTokenWithAppointment, markAllTokensUsedForAppointment } from '../db/tokens';
import { validateTokenRecord } from '../utils/tokenValidation';
import { notifyClinicForPatientCancellation, sendConfirmedAckIfEnabled } from '../jobs/confirmorJobs';
import { runSchedulerTick } from '../jobs/scheduler';
import {
  createClinicWithManager,
  deleteClinicAccount,
  listClinicAccounts,
  resetManagerPasswordForClinic,
  updateClinicPlatformSettings
} from '../db/admin';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

function csrfToken(req: Request): string {
  const maybeFn = (req as Request & { csrfToken?: () => string }).csrfToken;
  if (typeof maybeFn === 'function') {
    return maybeFn();
  }
  return '';
}

function parseHour(input: unknown): number {
  const hour = Number(input);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Hour must be an integer between 0 and 23');
  }
  return hour;
}

function parseEmail(input: unknown): string {
  const email = String(input ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Email invalid.');
  }
  return email;
}

function parsePassword(input: unknown, fieldName: string): string {
  const password = String(input ?? '');
  if (password.length < 8) {
    throw new Error(`${fieldName} must have at least 8 characters.`);
  }
  return password;
}

function parseTimezone(input: unknown): string {
  const timezone = String(input ?? '').trim();
  if (!timezone || !DateTime.now().setZone(timezone).isValid) {
    throw new Error('Timezone invalid.');
  }
  return timezone;
}

function parseClinicName(input: unknown): string {
  const clinicName = String(input ?? '').trim();
  if (!clinicName) {
    throw new Error('Numele clinicii este obligatoriu.');
  }
  return clinicName;
}

function formatCsvCountdown(nowLocal: DateTime, exportHour: number): string {
  const deadlineLocal = nowLocal.startOf('day').set({
    hour: exportHour,
    minute: 0,
    second: 0,
    millisecond: 0
  });
  const deadlineLabel = deadlineLocal.toFormat('HH:mm');

  if (nowLocal >= deadlineLocal) {
    return `CSV lipsa. Termen depasit (${deadlineLabel}).`;
  }

  const diff = deadlineLocal.diff(nowLocal, ['hours', 'minutes']).shiftTo('hours', 'minutes').toObject();
  const hours = Math.max(0, Math.floor(diff.hours ?? 0));
  const minutes = Math.max(0, Math.ceil(diff.minutes ?? 0));

  if (hours > 0) {
    return `Incarca CSV pana la ${deadlineLabel} (${hours}h ${minutes}m ramase).`;
  }

  return `Incarca CSV pana la ${deadlineLabel} (${minutes}m ramase).`;
}

function buildCsvTemplate(clinicTimezone: string): string {
  const day1 = DateTime.now().setZone(clinicTimezone).startOf('day').plus({ days: 1 });
  const day2 = day1.plus({ days: 1 });

  const header = 'appointment_id,start_datetime,phone,appointment_type,patient_name,provider_name,status';
  const rows = [
    `APT-TPL-001,${day1.set({ hour: 9, minute: 0 }).toFormat('yyyy-MM-dd HH:mm')},0712345678,Consultatie initiala,Popescu Ana,Dr. Ionescu,pending`,
    `APT-TPL-002,${day1.set({ hour: 11, minute: 30 }).toFormat('yyyy-MM-dd HH:mm')},0722334455,Detartraj,Marin Ioan,Dr. Pavel,confirmed`,
    `APT-TPL-003,${day2.set({ hour: 14, minute: 0 }).toFormat('yyyy-MM-dd HH:mm')},0733445566,Control periodic,Stan Maria,Dr. Radu,pending`
  ];

  return `${header}\n${rows.join('\n')}\n`;
}

function sendCsvTemplate(res: Response, timezone: string): void {
  const csvTemplate = buildCsvTemplate(timezone);
  const filename = `confirmor_csv_template_${DateTime.now().toFormat('yyyyMMdd')}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csvTemplate);
}

function badRequest(res: Response, message: string): void {
  res.status(400).send(renderTokenNeutralPage(message));
}

function formatImportMessage(summary: {
  totalRows: number;
  upsertedRows: number;
  canceledMissingCount: number;
}): string {
  return `Import OK. Rows: ${summary.totalRows}, upserted: ${summary.upsertedRows}, missing->canceled_by_patient: ${summary.canceledMissingCount}`;
}

function adminRedirectWithMessage(res: Response, key: 'message' | 'error', value: string): void {
  const encoded = encodeURIComponent(value);
  res.redirect(`/admin?${key}=${encoded}`);
}

async function handleCsvImportRequest(req: Request, res: Response): Promise<void> {
  const auth = req.authContext;
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'Missing file in multipart field "file"' });
    return;
  }

  const csvContent = req.file.buffer.toString('utf8');
  const summary = await importCsvSnapshot({
    clinic: auth.clinic,
    csvContent
  });

  res.status(200).json({
    ok: true,
    summary
  });
}

async function tokenAction(req: Request, res: Response, expectedPurpose: 'confirm' | 'cancel'): Promise<void> {
  const tokenValue = req.params.token;
  if (!tokenValue) {
    badRequest(res, 'Link invalid.');
    return;
  }

  const token = await findTokenWithAppointment(tokenValue);
  if (!token || !token.appointments) {
    res.status(200).send(renderTokenNeutralPage('Link invalid sau expirat.'));
    return;
  }

  const validation = validateTokenRecord({
    purpose: token.purpose,
    expectedPurpose,
    expiresAt: token.expires_at,
    usedAt: token.used_at
  });

  if (!validation.ok) {
    res.status(200).send(renderTokenNeutralPage('Link invalid, expirat sau deja folosit.'));
    return;
  }

  const clinic = await getClinicById(token.appointments.clinic_id);
  if (!clinic) {
    res.status(404).send(renderTokenNeutralPage('Clinica nu a fost gasita.'));
    return;
  }

  if (expectedPurpose === 'confirm') {
    const updated = await setAppointmentStatus(token.appointment_id, 'confirmed', ['pending']);
    if (!updated) {
      const current = await getAppointmentById(token.appointment_id);
      if (current?.status === 'confirmed') {
        await markAllTokensUsedForAppointment(token.appointment_id);
        res.status(200).send(renderTokenSuccessPage('Programarea este deja confirmata.'));
        return;
      }

      res.status(200).send(renderTokenNeutralPage('Programarea nu mai poate fi confirmata.'));
      return;
    }

    await markAllTokensUsedForAppointment(token.appointment_id);
    await sendConfirmedAckIfEnabled({ clinic, appointment: updated });

    res.status(200).send(renderTokenSuccessPage('Programarea a fost confirmata cu succes.'));
    return;
  }

  const canceled = await setAppointmentStatus(token.appointment_id, 'canceled_by_patient', ['pending', 'confirmed']);
  if (!canceled) {
    res.status(200).send(renderTokenNeutralPage('Programarea nu mai poate fi anulata.'));
    return;
  }

  await markAllTokensUsedForAppointment(token.appointment_id);
  await notifyClinicForPatientCancellation({ clinic, appointment: canceled });
  res.status(200).send(renderTokenSuccessPage('Programarea a fost anulata.'));
}

export function buildRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.redirect('/login');
  });

  router.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  router.get('/api/cron/tick', async (req, res, next) => {
    try {
      if (env.CRON_SECRET) {
        const authHeader = req.header('authorization') ?? '';
        const expected = `Bearer ${env.CRON_SECRET}`;
        if (authHeader !== expected) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
      }

      await runSchedulerTick();
      res.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/csv-template', (_req, res) => {
    sendCsvTemplate(res, env.DEFAULT_TIMEZONE);
  });

  router.get('/admin/login', (req, res) => {
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;
    res.status(200).send(renderAdminLoginPage({ csrfToken: csrfToken(req), error }));
  });

  router.post('/admin/login', async (req, res, next) => {
    try {
      if (env.ADMIN_EMAILS.length === 0) {
        res
          .status(403)
          .send(renderAdminLoginPage({ csrfToken: csrfToken(req), error: 'ADMIN_EMAILS nu este configurat.' }));
        return;
      }

      const email = parseEmail(req.body.email);
      const password = parsePassword(req.body.password, 'Password');

      const authClient = createSupabaseAuthClient();
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });

      if (error || !data.session || !data.user) {
        res.status(401).send(renderAdminLoginPage({ csrfToken: csrfToken(req), error: 'Credentiale invalide.' }));
        return;
      }

      if (!isPlatformAdminEmail(email)) {
        clearAdminSessionCookies(res);
        res.status(403).send(renderAdminLoginPage({ csrfToken: csrfToken(req), error: 'Acces admin interzis.' }));
        return;
      }

      setAdminSessionCookies(res, data.session);
      res.redirect('/admin');
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/logout', (_req, res) => {
    clearAdminSessionCookies(res);
    res.redirect('/admin/login');
  });

  router.get('/login', (req, res) => {
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;
    res.status(200).send(renderLoginPage({ csrfToken: csrfToken(req), error }));
  });

  router.post('/login', async (req, res, next) => {
    try {
      const email = String(req.body.email ?? '').trim();
      const password = String(req.body.password ?? '').trim();

      if (!email || !password) {
        res.status(400).send(renderLoginPage({ csrfToken: csrfToken(req), error: 'Email si parola obligatorii.' }));
        return;
      }

      const authClient = createSupabaseAuthClient();
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });

      if (error || !data.session || !data.user) {
        res.status(401).send(renderLoginPage({ csrfToken: csrfToken(req), error: 'Credentiale invalide.' }));
        return;
      }

      const manager = await getManagerUserByAuthId(data.user.id);
      if (!manager) {
        clearSessionCookies(res);
        res.status(403).send(renderLoginPage({ csrfToken: csrfToken(req), error: 'Cont fara clinica asociata.' }));
        return;
      }

      setSessionCookies(res, data.session);
      res.redirect('/dashboard');
    } catch (error) {
      next(error);
    }
  });

  router.get('/logout', (_req, res) => {
    clearSessionCookies(res);
    res.redirect('/login');
  });

  router.get('/c/:token', async (req, res, next) => {
    try {
      await tokenAction(req, res, 'confirm');
    } catch (error) {
      next(error);
    }
  });

  router.get('/x/:token', async (req, res, next) => {
    try {
      await tokenAction(req, res, 'cancel');
    } catch (error) {
      next(error);
    }
  });

  const adminRouter = Router();

  adminRouter.get('/admin', requirePlatformAdminAuth, async (req, res, next) => {
    try {
      const clinicAccounts = await listClinicAccounts();
      const message = typeof req.query.message === 'string' ? req.query.message : undefined;
      const error = typeof req.query.error === 'string' ? req.query.error : undefined;

      res.status(200).send(
        renderAdminDashboardPage({
          adminEmail: req.adminContext!.email,
          csrfToken: csrfToken(req),
          message,
          error,
          clinicAccounts: clinicAccounts.map((item) => ({
            clinicId: item.clinic.id,
            clinicName: item.clinic.name,
            timezone: item.clinic.timezone,
            exportHour: item.clinic.export_hour,
            deadlineHour: item.clinic.deadline_hour,
            createdAtIso: item.clinic.created_at,
            managerEmail: item.managerEmail
          }))
        })
      );
    } catch (error) {
      next(error);
    }
  });

  adminRouter.post('/admin/clinics', requirePlatformAdminAuth, async (req, res) => {
    try {
      const clinicName = parseClinicName(req.body.clinic_name);
      const timezone = parseTimezone(req.body.timezone);
      const exportHour = parseHour(req.body.export_hour);
      const deadlineHour = parseHour(req.body.deadline_hour);
      const managerEmail = parseEmail(req.body.manager_email);
      const managerPassword = parsePassword(req.body.manager_password, 'Manager password');

      const created = await createClinicWithManager({
        clinicName,
        timezone,
        exportHour,
        deadlineHour,
        managerEmail,
        managerPassword
      });

      adminRedirectWithMessage(
        res,
        'message',
        `Clinica "${created.clinic.name}" a fost creata. Manager: ${created.managerEmail ?? managerEmail}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      adminRedirectWithMessage(res, 'error', message);
    }
  });

  adminRouter.post('/admin/clinics/:clinicId/settings', requirePlatformAdminAuth, async (req, res) => {
    try {
      const clinicId = String(req.params.clinicId ?? '').trim();
      if (!clinicId) {
        throw new Error('Clinic ID invalid.');
      }

      const clinicName = parseClinicName(req.body.clinic_name);
      const timezone = parseTimezone(req.body.timezone);
      const exportHour = parseHour(req.body.export_hour);
      const deadlineHour = parseHour(req.body.deadline_hour);

      const updated = await updateClinicPlatformSettings({
        clinicId,
        clinicName,
        timezone,
        exportHour,
        deadlineHour
      });

      adminRedirectWithMessage(res, 'message', `Setari actualizate pentru clinica "${updated.name}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      adminRedirectWithMessage(res, 'error', message);
    }
  });

  adminRouter.post('/admin/clinics/:clinicId/reset-password', requirePlatformAdminAuth, async (req, res) => {
    try {
      const clinicId = String(req.params.clinicId ?? '').trim();
      if (!clinicId) {
        throw new Error('Clinic ID invalid.');
      }

      const newPassword = parsePassword(req.body.new_password, 'New password');
      const result = await resetManagerPasswordForClinic(clinicId, newPassword);

      adminRedirectWithMessage(
        res,
        'message',
        `Parola a fost resetata pentru ${result.managerEmail ?? result.managerUserId}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      adminRedirectWithMessage(res, 'error', message);
    }
  });

  adminRouter.post('/admin/clinics/:clinicId/delete', requirePlatformAdminAuth, async (req, res) => {
    try {
      const clinicId = String(req.params.clinicId ?? '').trim();
      if (!clinicId) {
        throw new Error('Clinic ID invalid.');
      }

      const clinicAccounts = await listClinicAccounts();
      const target = clinicAccounts.find((item) => item.clinic.id === clinicId);
      if (target?.managerUserId && target.managerUserId === req.adminContext!.userId) {
        throw new Error('Nu poti sterge clinica asociata contului admin curent.');
      }

      const result = await deleteClinicAccount(clinicId);

      adminRedirectWithMessage(
        res,
        'message',
        `Clinica "${result.clinicName}" a fost stearsa.${result.managerEmail ? ` Manager: ${result.managerEmail}.` : ''}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      adminRedirectWithMessage(res, 'error', message);
    }
  });

  router.use(adminRouter);

  const authRouter = Router();
  authRouter.use(requireManagerAuth);

  authRouter.get('/dashboard', async (req, res, next) => {
    try {
      const clinic = req.authContext!.clinic;
      const dayLocal = dayAfterTomorrowLocal(clinic.timezone);
      const range = dayRangeUtc(dayLocal);

      const [counts, appointments] = await Promise.all([
        countAppointmentsByStatus(clinic.id, range.startUtcIso, range.endUtcIso),
        getAppointmentsInRange(clinic.id, range.startUtcIso, range.endUtcIso)
      ]);

      const nowLocal = DateTime.now().setZone(clinic.timezone);
      const csvLoaded = appointments.length > 0;
      const csvStatus = csvLoaded
        ? {
            state: 'loaded' as const,
            text: `CSV incarcat pentru ${dayLocal.toFormat('yyyy-MM-dd')}.`
          }
        : {
            state: 'missing' as const,
            text: formatCsvCountdown(nowLocal, clinic.export_hour)
          };

      res.status(200).send(
        renderDashboardPage({
          clinic,
          dayKey: dayLocal.toFormat('yyyy-MM-dd'),
          counts,
          appointments,
          csvStatus
        })
      );
    } catch (error) {
      next(error);
    }
  });

  authRouter.get('/dashboard/import', (req, res) => {
    const clinic = req.authContext!.clinic;
    const message = typeof req.query.message === 'string' ? req.query.message : undefined;
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;

    res.status(200).send(
      renderImportPage({
        clinic,
        csrfToken: csrfToken(req),
        message,
        error
      })
    );
  });

  authRouter.get('/dashboard/csv-template', (req, res) => {
    const clinic = req.authContext!.clinic;
    sendCsvTemplate(res, clinic.timezone);
  });

  authRouter.post('/dashboard/import', upload.single('file'), async (req, res, next) => {
    try {
      const auth = req.authContext!;
      if (!req.file) {
        res.redirect('/dashboard/import?error=Missing%20file');
        return;
      }

      const csvContent = req.file.buffer.toString('utf8');
      const summary = await importCsvSnapshot({
        clinic: auth.clinic,
        csvContent
      });

      res.redirect(`/dashboard/import?message=${encodeURIComponent(formatImportMessage(summary))}`);
    } catch (error) {
      next(error);
    }
  });

  authRouter.get('/dashboard/appointments', async (req, res, next) => {
    try {
      const clinic = req.authContext!.clinic;
      const requestedDay = typeof req.query.day === 'string' ? req.query.day : '';

      const dayLocal = requestedDay
        ? DateTime.fromISO(requestedDay, { zone: clinic.timezone }).startOf('day')
        : dayAfterTomorrowLocal(clinic.timezone);

      if (!dayLocal.isValid) {
        res.status(400).send(renderTokenNeutralPage('Invalid day parameter. Use YYYY-MM-DD.'));
        return;
      }

      const range = dayRangeUtc(dayLocal);
      const appointments = await getAppointmentsInRange(clinic.id, range.startUtcIso, range.endUtcIso);

      res.status(200).send(
        renderAppointmentsPage({
          clinic,
          day: dayLocal.toFormat('yyyy-MM-dd'),
          appointments
        })
      );
    } catch (error) {
      next(error);
    }
  });

  authRouter.post(
    '/api/clinics/:clinicId/csv-import',
    requireClinicOwnership,
    upload.single('file'),
    async (req, res, next) => {
      try {
        await handleCsvImportRequest(req, res);
      } catch (error) {
        next(error);
      }
    }
  );

  router.use(authRouter);

  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected error';

    if (req.path.startsWith('/api/')) {
      res.status(500).json({ error: message });
      return;
    }

    res.status(500).send(renderTokenNeutralPage(`Eroare: ${message}`));
  });

  return router;
}
