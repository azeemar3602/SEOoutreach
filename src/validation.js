const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PLANS = new Set(['starter', 'pro', 'agency', 'enterprise']);
const VALID_ROLES = new Set(['super_admin', 'workspace_admin', 'member']);

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Valid email is required.';
  if (!EMAIL_RE.test(email.trim())) return 'Invalid email format.';
  return null;
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  return null;
}

export function validateSignup(body) {
  const errors = {};
  const nameErr = !body.full_name?.trim() ? 'Full name is required.' : null;
  if (nameErr) errors.full_name = nameErr;

  const emailErr = validateEmail(body.email);
  if (emailErr) errors.email = emailErr;

  const passErr = validatePassword(body.password);
  if (passErr) errors.password = passErr;

  if (body.password !== body.confirm_password) errors.confirm_password = 'Passwords do not match.';

  if (!body.workspace_name?.trim()) errors.workspace_name = 'Company / workspace name is required.';

  if (body.site_url && !/^https?:\/\/.+/i.test(body.site_url)) {
    errors.site_url = 'Website URL must start with http:// or https://';
  }

  const plan = body.plan_key ?? 'starter';
  if (!VALID_PLANS.has(plan)) errors.plan_key = 'Invalid plan selected.';

  return Object.keys(errors).length ? errors : null;
}

export function validateLogin(body) {
  const errors = {};
  const emailErr = validateEmail(body.email);
  if (emailErr) errors.email = emailErr;
  if (!body.password) errors.password = 'Password is required.';
  return Object.keys(errors).length ? errors : null;
}

export function validateRole(role) {
  return VALID_ROLES.has(role);
}

export { VALID_PLANS, VALID_ROLES };
