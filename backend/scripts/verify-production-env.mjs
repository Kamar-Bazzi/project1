import webPush from 'web-push';

const errors = [];

if (process.env.NODE_ENV !== 'production') {
  errors.push('NODE_ENV must be "production"');
}

rejectPlaceholder(
  'DATABASE_URL',
  requireUrl('DATABASE_URL', ['postgres:', 'postgresql:']),
);
requireSecret('JWT_SECRET', 32);
rejectPlaceholder('APP_PUBLIC_URL', requireHttpsOrigin('APP_PUBLIC_URL'));
rejectPlaceholder('CORS_ORIGIN', requireHttpsOrigin('CORS_ORIGIN'));
requireExact('COOKIE_SECURE', 'true');
requireExact('AUTH_REQUIRE_VERIFIED_EMAIL', 'true');
requireExact('TRUST_PROXY', 'true');
optionalBoolean('SWAGGER_ENABLED');
optionalBoolean('HTTP_LOGGING');
requireDuration('JWT_ACCESS_EXPIRES_IN');
requireText('JWT_ISSUER');
requireText('JWT_AUDIENCE');
requireInteger('REFRESH_TOKEN_TTL_DAYS', 1, 90);
requireInteger('PASSWORD_RESET_TTL_MINUTES', 5, 120);
requireInteger('EMAIL_VERIFICATION_TTL_HOURS', 1, 168);

rejectPlaceholder('SMTP_HOST', requireText('SMTP_HOST'));
requireInteger('SMTP_PORT', 1, 65_535);
requireBoolean('SMTP_SECURE');
requireExact('SMTP_REQUIRE_TLS', 'true');
requireText('SMTP_USER');
requireSecret('SMTP_PASSWORD', 12);
rejectPlaceholder('SMTP_FROM', requireText('SMTP_FROM'));

rejectPlaceholder('WEB_PUSH_SUBJECT', requireText('WEB_PUSH_SUBJECT'));
requireText('WEB_PUSH_PUBLIC_KEY');
requireSecret('WEB_PUSH_PRIVATE_KEY', 20);
validateVapidConfiguration();

requireInteger('MEDICATION_REMINDER_LEAD_MINUTES', 1, 1_440);
requireInteger('MEDICATION_OVERDUE_GRACE_MINUTES', 1, 1_440);
requireInteger('APPOINTMENT_REMINDER_MAX_LOOKAHEAD_HOURS', 1, 168);
requireInteger('NOTIFICATION_DISPATCH_BATCH_SIZE', 1, 1_000);

if (errors.length > 0) {
  console.error('Production environment verification failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Production environment verification passed.');

function valueOf(name) {
  return process.env[name]?.trim() ?? '';
}

function requireText(name) {
  const value = valueOf(name);
  if (!value) {
    errors.push(`${name} is required`);
    return '';
  }

  return value;
}

function requireSecret(name, minimumLength) {
  const value = requireText(name);
  if (!value) {
    return;
  }

  if (value.length < minimumLength) {
    errors.push(`${name} must be at least ${minimumLength} characters`);
  }

  if (/(change[-_ ]?me|replace|example|password|secret)/i.test(value)) {
    errors.push(`${name} still contains a placeholder or weak value`);
  }
}

function requireExact(name, expected) {
  const value = requireText(name);
  if (value && value !== expected) {
    errors.push(`${name} must be "${expected}"`);
  }
}

function requireBoolean(name) {
  const value = requireText(name);
  if (value && value !== 'true' && value !== 'false') {
    errors.push(`${name} must be "true" or "false"`);
  }
}

function optionalBoolean(name) {
  const value = valueOf(name);
  if (value && value !== 'true' && value !== 'false') {
    errors.push(`${name} must be "true" or "false" when set`);
  }
}

function requireInteger(name, minimum, maximum) {
  const value = requireText(name);
  if (!value) {
    return;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    errors.push(
      `${name} must be an integer from ${minimum} through ${maximum}`,
    );
  }
}

function requireDuration(name) {
  const value = requireText(name);
  if (value && !/^\d+(s|m|h|d)$/.test(value)) {
    errors.push(`${name} must be a positive duration such as "15m"`);
  }
}

function requireHttpsOrigin(name) {
  const value = valueOf(name);
  if (!value) {
    requireText(name);
    return '';
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      errors.push(`${name} must use https:`);
    }
    if (url.username || url.password || url.search || url.hash) {
      errors.push(
        `${name} must be a public HTTPS origin without credentials, query, or fragment`,
      );
    }
    if (url.pathname !== '/' && url.pathname !== '') {
      errors.push(`${name} must not contain a path`);
    }
    return value;
  } catch {
    errors.push(`${name} must be a valid URL`);
    return value;
  }
}

function requireUrl(name, protocols) {
  const value = requireText(name);
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      errors.push(`${name} must use ${protocols.join(' or ')}`);
    }
    return value;
  } catch {
    errors.push(`${name} must be a valid URL`);
    return value;
  }
}

function rejectPlaceholder(name, value) {
  if (
    value &&
    /(change[-_ ]?me|replace|example\.(com|test)|localhost|url-encoded|inject-from)/i.test(
      value,
    )
  ) {
    errors.push(`${name} still contains a placeholder or local value`);
  }
}

function validateVapidConfiguration() {
  const subject = valueOf('WEB_PUSH_SUBJECT');
  const publicKey = valueOf('WEB_PUSH_PUBLIC_KEY');
  const privateKey = valueOf('WEB_PUSH_PRIVATE_KEY');

  if (!subject || !publicKey || !privateKey) {
    return;
  }

  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    errors.push(
      'WEB_PUSH_SUBJECT/PUBLIC_KEY/PRIVATE_KEY must be a valid VAPID configuration',
    );
  }
}
