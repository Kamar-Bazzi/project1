import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AccountStatus, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;
const REQUIRED_VARIABLES = [
  'DEV_ADMIN_EMAIL',
  'DEV_ADMIN_PASSWORD',
  'DEV_DOCTOR_EMAIL',
  'DEV_DOCTOR_PASSWORD',
];

loadDotEnv(resolve(process.cwd(), '.env'));

function loadDotEnv(path) {
  if (!existsSync(path)) return;

  const contents = readFileSync(path, 'utf8');
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    const quote = value[0];
    if (
      (quote === '"' || quote === "'") &&
      value.endsWith(quote) &&
      value.length >= 2
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requireVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for npm run seed:uat`);
  }

  return value;
}

function validateRequiredEnvironment() {
  const missing = REQUIRED_VARIABLES.filter(
    (name) => !process.env[name]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required UAT seed variables: ${missing.join(', ')}`,
    );
  }
}

function normalizeEmail(value) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error(`Invalid email address for UAT seed: ${value}`);
  }

  return email;
}

async function upsertRoleUser({ email, password, name, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== role) {
    throw new Error(
      `Refusing to change ${email} from ${existing.role} to ${role}. Choose a different DEV_*_EMAIL or update the account manually.`,
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date();
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      passwordChangedAt: now,
      accountStatus: AccountStatus.ACTIVE,
      failedLoginAttempts: 0,
      lastFailedLoginAt: null,
      lockedUntil: null,
      emailVerifiedAt: now,
    },
    create: {
      name,
      email,
      passwordHash,
      passwordChangedAt: now,
      role,
      accountStatus: AccountStatus.ACTIVE,
      emailVerifiedAt: now,
      notificationPreference: {
        create: {
          pushEnabled: false,
        },
      },
    },
  });

  return { user, created: !existing };
}

async function seedAdmin() {
  const email = normalizeEmail(requireVariable('DEV_ADMIN_EMAIL'));
  const password = requireVariable('DEV_ADMIN_PASSWORD');
  const name = process.env.DEV_ADMIN_NAME?.trim() || 'UAT Admin';

  return upsertRoleUser({
    email,
    password,
    name,
    role: UserRole.ADMIN,
  });
}

async function seedDoctor() {
  const email = normalizeEmail(requireVariable('DEV_DOCTOR_EMAIL'));
  const password = requireVariable('DEV_DOCTOR_PASSWORD');
  const name = process.env.DEV_DOCTOR_NAME?.trim() || 'UAT Doctor';
  const specialization =
    process.env.DEV_DOCTOR_SPECIALIZATION?.trim() || 'General Medicine';
  const licenseNumber =
    process.env.DEV_DOCTOR_LICENSE_NUMBER?.trim() || 'UAT-DOCTOR-LICENSE';

  const result = await upsertRoleUser({
    email,
    password,
    name,
    role: UserRole.DOCTOR,
  });

  await prisma.doctor.upsert({
    where: { userId: result.user.id },
    update: {
      specialization,
      licenseNumber,
    },
    create: {
      userId: result.user.id,
      specialization,
      licenseNumber,
    },
  });

  return result;
}

async function main() {
  validateRequiredEnvironment();

  const admin = await seedAdmin();
  const doctor = await seedDoctor();

  console.log(
    JSON.stringify(
      {
        seeded: true,
        destructive: false,
        admin: {
          email: admin.user.email,
          role: admin.user.role,
          accountStatus: admin.user.accountStatus,
          created: admin.created,
        },
        doctor: {
          email: doctor.user.email,
          role: doctor.user.role,
          accountStatus: doctor.user.accountStatus,
          created: doctor.created,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
