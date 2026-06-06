import { Router } from 'express';
import {
  getUserByEmail, createUser, createWorkspace, addWorkspaceMember,
  createSession, deleteSession, createPasswordResetToken, consumePasswordResetToken,
  updateUserPassword, deleteUserSessions, createEmailVerificationToken,
  verifyEmailToken, sanitizeUser, resolveAuthContext, SESSION_COOKIE, cookieOptions,
} from '../auth-store.js';
import { comparePassword } from '../security.js';
import { validateSignup, validateLogin, validatePassword } from '../validation.js';
import { requireAuth } from '../auth.js';
import { getWorkspaceUsage } from '../plans.js';
import { logAudit } from '../audit.js';

const router = Router();

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
}

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

router.post('/signup', (req, res) => {
  const errors = validateSignup(req.body);
  if (errors) return res.status(400).json({ errors });

  if (getUserByEmail(req.body.email)) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const user = createUser({
    email: req.body.email,
    password: req.body.password,
    full_name: req.body.full_name,
  });

  const workspace = createWorkspace({
    name: req.body.workspace_name,
    site_url: req.body.site_url,
    plan_key: req.body.plan_key ?? 'starter',
  });

  addWorkspaceMember({ workspace_id: workspace.id, user_id: user.id, role: 'workspace_admin' });

  const verifyToken = createEmailVerificationToken(user.id);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[dev] Verify email: ${baseUrl(req)}/verify-email?token=${verifyToken}`);
  }

  const session = createSession({
    userId: user.id,
    workspaceId: workspace.id,
    role: 'workspace_admin',
    ip: clientIp(req),
    userAgent: req.headers['user-agent'],
    remember: false,
  });

  res.cookie(SESSION_COOKIE, session.id, cookieOptions(false));
  logAudit({ workspaceId: workspace.id, userId: user.id, action: 'signup' });
  logAudit({ workspaceId: workspace.id, userId: user.id, action: 'workspace_created' });

  res.json({
    user: sanitizeUser(user),
    workspace: { id: workspace.id, name: workspace.name, plan_key: workspace.plan_key },
    redirect: '/dashboard',
  });
});

router.post('/login', (req, res) => {
  const errors = validateLogin(req.body);
  if (errors) return res.status(400).json({ errors });

  const user = getUserByEmail(req.body.email);
  if (!user || !comparePassword(req.body.password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Your account has been suspended.' });
  }

  const ctx = resolveAuthContext(user.id);
  if (!ctx) return res.status(403).json({ error: 'No active workspace membership.' });

  const session = createSession({
    userId: user.id,
    workspaceId: ctx.workspaceId,
    role: ctx.role,
    ip: clientIp(req),
    userAgent: req.headers['user-agent'],
    remember: !!req.body.remember,
  });

  res.cookie(SESSION_COOKIE, session.id, cookieOptions(!!req.body.remember));
  logAudit({ workspaceId: ctx.workspaceId, userId: user.id, action: 'login' });

  res.json({
    user: sanitizeUser(user),
    role: ctx.role,
    redirect: ctx.isSuperAdmin ? '/admin' : '/dashboard',
  });
});

router.post('/logout', requireAuth, (req, res) => {
  deleteSession(req.auth.sessionId);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  logAudit({ workspaceId: req.auth.workspaceId, userId: req.auth.userId, action: 'logout' });
  res.json({ ok: true, redirect: '/login' });
});

router.get('/me', requireAuth, (req, res) => {
  const usage = req.auth.workspaceId && !req.auth.isSuperAdmin
    ? getWorkspaceUsage(req.auth.workspaceId)
    : null;
  res.json({ user: req.user, auth: req.auth, usage });
});

router.post('/forgot-password', (req, res) => {
  const email = req.body.email?.trim();
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const user = getUserByEmail(email);
  if (user) {
    const token = createPasswordResetToken(user.id);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[dev] Reset password: ${baseUrl(req)}/reset-password?token=${token}`);
    }
    logAudit({ userId: user.id, action: 'password_reset_requested' });
  }

  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

router.post('/reset-password', (req, res) => {
  const { token, password, confirm_password } = req.body;
  if (!token) return res.status(400).json({ error: 'Reset token is required.' });

  const passErr = validatePassword(password);
  if (passErr) return res.status(400).json({ error: passErr });
  if (password !== confirm_password) return res.status(400).json({ error: 'Passwords do not match.' });

  const row = consumePasswordResetToken(token);
  if (!row) return res.status(400).json({ error: 'Invalid or expired reset token.' });

  updateUserPassword(row.user_id, password);
  deleteUserSessions(row.user_id);
  logAudit({ userId: row.user_id, action: 'password_reset_completed' });

  res.json({ ok: true, redirect: '/login' });
});

router.post('/resend-verification', requireAuth, (req, res) => {
  if (req.user.email_verified_at) {
    return res.json({ message: 'Email is already verified.' });
  }
  const token = createEmailVerificationToken(req.user.id);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[dev] Verify email: ${baseUrl(req)}/verify-email?token=${token}`);
  }
  res.json({ message: 'Verification email sent.' });
});

router.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required.' });

  const user = verifyEmailToken(token);
  if (!user) return res.status(400).json({ error: 'Invalid or expired verification token.' });

  res.json({ ok: true, redirect: '/dashboard' });
});

export default router;
