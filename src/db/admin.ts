import { supabaseAdmin } from './supabase';
import type { ClinicRow, UserRow } from '../types/domain';

export interface ClinicAccountSummary {
  clinic: ClinicRow;
  managerUserId: string | null;
  managerEmail: string | null;
}

async function deleteClinicById(clinicId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('clinics').delete().eq('id', clinicId);
  if (error) {
    throw error;
  }
}

async function deleteAuthUserById(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    throw error;
  }
}

async function findManagerByClinicId(clinicId: string): Promise<UserRow | null> {
  const managerResult = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('role', 'manager')
    .maybeSingle();

  if (managerResult.error && managerResult.error.code !== 'PGRST116') {
    throw managerResult.error;
  }

  return (managerResult.data as UserRow | null) ?? null;
}

async function findClinicById(clinicId: string): Promise<ClinicRow | null> {
  const clinicResult = await supabaseAdmin.from('clinics').select('*').eq('id', clinicId).maybeSingle();
  if (clinicResult.error && clinicResult.error.code !== 'PGRST116') {
    throw clinicResult.error;
  }

  return (clinicResult.data as ClinicRow | null) ?? null;
}

export async function listClinicAccounts(): Promise<ClinicAccountSummary[]> {
  const clinicsResult = await supabaseAdmin.from('clinics').select('*').order('created_at', { ascending: false });
  if (clinicsResult.error) {
    throw clinicsResult.error;
  }

  const managersResult = await supabaseAdmin.from('users').select('*').eq('role', 'manager');
  if (managersResult.error) {
    throw managersResult.error;
  }

  const clinics = (clinicsResult.data as ClinicRow[]) ?? [];
  const managers = (managersResult.data as UserRow[]) ?? [];
  const managerByClinicId = new Map<string, UserRow>(managers.map((manager) => [manager.clinic_id, manager]));
  const managerEmailByUserId = new Map<string, string | null>();

  await Promise.all(
    managers.map(async (manager) => {
      const authUser = await supabaseAdmin.auth.admin.getUserById(manager.id);
      if (authUser.error) {
        managerEmailByUserId.set(manager.id, null);
        return;
      }

      managerEmailByUserId.set(manager.id, authUser.data.user?.email ?? null);
    })
  );

  return clinics.map((clinic) => {
    const manager = managerByClinicId.get(clinic.id) ?? null;
    return {
      clinic,
      managerUserId: manager?.id ?? null,
      managerEmail: manager ? (managerEmailByUserId.get(manager.id) ?? null) : null
    };
  });
}

export async function createClinicWithManager(input: {
  clinicName: string;
  timezone: string;
  exportHour: number;
  deadlineHour: number;
  managerEmail: string;
  managerPassword: string;
}): Promise<ClinicAccountSummary> {
  const clinicResult = await supabaseAdmin
    .from('clinics')
    .insert({
      name: input.clinicName,
      timezone: input.timezone,
      export_hour: input.exportHour,
      deadline_hour: input.deadlineHour
    })
    .select('*')
    .single();

  if (clinicResult.error) {
    throw clinicResult.error;
  }

  const clinic = clinicResult.data as ClinicRow;

  const createAuthUser = await supabaseAdmin.auth.admin.createUser({
    email: input.managerEmail,
    password: input.managerPassword,
    email_confirm: true
  });

  if (createAuthUser.error || !createAuthUser.data.user) {
    await deleteClinicById(clinic.id);
    throw createAuthUser.error ?? new Error('Could not create auth user');
  }

  const authUserId = createAuthUser.data.user.id;

  const userInsert = await supabaseAdmin.from('users').insert({
    id: authUserId,
    clinic_id: clinic.id,
    role: 'manager'
  });

  if (userInsert.error) {
    await deleteAuthUserById(authUserId);
    await deleteClinicById(clinic.id);
    throw userInsert.error;
  }

  return {
    clinic,
    managerUserId: authUserId,
    managerEmail: createAuthUser.data.user.email ?? input.managerEmail
  };
}

export async function resetManagerPasswordForClinic(clinicId: string, newPassword: string): Promise<{
  managerUserId: string;
  managerEmail: string | null;
}> {
  const manager = await findManagerByClinicId(clinicId);
  if (!manager) {
    throw new Error('Clinic has no manager user.');
  }

  const updateAuthUser = await supabaseAdmin.auth.admin.updateUserById(manager.id, {
    password: newPassword
  });

  if (updateAuthUser.error) {
    throw updateAuthUser.error;
  }

  return {
    managerUserId: manager.id,
    managerEmail: updateAuthUser.data.user?.email ?? null
  };
}

export async function deleteClinicAccount(clinicId: string): Promise<{
  clinicId: string;
  clinicName: string;
  managerUserId: string | null;
  managerEmail: string | null;
}> {
  const clinic = await findClinicById(clinicId);
  if (!clinic) {
    throw new Error('Clinica nu exista.');
  }

  const manager = await findManagerByClinicId(clinicId);
  let managerEmail: string | null = null;

  if (manager) {
    const authUser = await supabaseAdmin.auth.admin.getUserById(manager.id);
    if (!authUser.error) {
      managerEmail = authUser.data.user?.email ?? null;
    }

    await deleteAuthUserById(manager.id);
  }

  await deleteClinicById(clinicId);

  return {
    clinicId: clinic.id,
    clinicName: clinic.name,
    managerUserId: manager?.id ?? null,
    managerEmail
  };
}

export async function updateClinicPlatformSettings(input: {
  clinicId: string;
  clinicName: string;
  timezone: string;
  exportHour: number;
  deadlineHour: number;
}): Promise<ClinicRow> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .update({
      name: input.clinicName,
      timezone: input.timezone,
      export_hour: input.exportHour,
      deadline_hour: input.deadlineHour
    })
    .eq('id', input.clinicId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as ClinicRow;
}
