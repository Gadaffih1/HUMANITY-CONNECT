import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  Smartphone,
  Mail,
  Building2,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GlossyButton } from '../ui/DesignSystem';
import { KENYAN_47_COUNTIES, ROLE_DEFINITIONS, type RoleCode } from '../../types/domain';
import { normalizeKenyanMsisdn } from '../../lib/talksasaUtils';

const REGISTERABLE_ROLES: RoleCode[] = [
  'ORPHAN_GUARDIAN',
  'DESTITUTE',
  'NEEDY',
  'SUPPORTIVE',
  'WELL_WISHER',
];

export const AuthScreens: React.FC<{
  initialMode?: 'login' | 'register' | 'reset';
  presetRole?: string;
  onSuccess: () => void;
  onOpenSuperAdmin?: () => void;
}> = ({ initialMode = 'login', presetRole = 'SUPPORTIVE', onSuccess, onOpenSuperAdmin }) => {
  const { loginWithPassword, registerAccount, apiFetch } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Registration form (supports multi-role + separate beneficiary flows)
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>([
    REGISTERABLE_ROLES.includes(presetRole as RoleCode) ? (presetRole as RoleCode) : 'SUPPORTIVE',
  ]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [password, setPassword] = useState('');
  const [county, setCounty] = useState('Nairobi');
  const [subCounty, setSubCounty] = useState('');
  const [guardianOrgName, setGuardianOrgName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('');
  const [organisationName, setOrganisationName] = useState('');
  const [vulnerabilitySummary, setVulnerabilitySummary] = useState('');

  // Password reset
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const [sandboxHint, setSandboxHint] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
    setFeedback(null);
  }, [initialMode]);

  useEffect(() => {
    if (REGISTERABLE_ROLES.includes(presetRole as RoleCode)) {
      setSelectedRoles([presetRole as RoleCode]);
    }
  }, [presetRole]);

  const selectRole = (code: RoleCode) => {
    setSelectedRoles([code]);
    setFeedback(null);
  };

  const isOrphanSelected = selectedRoles.includes('ORPHAN_GUARDIAN');
  const isBeneficiarySelected = selectedRoles.some((r) =>
    ['ORPHAN_GUARDIAN', 'DESTITUTE', 'NEEDY'].includes(r)
  );
  const isWellWisherSelected = selectedRoles.includes('WELL_WISHER');

  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const emailVal = String(fd.get('email') ?? loginEmail).trim();
    const passwordVal = String(fd.get('password') ?? loginPassword);
    if (!emailVal || !passwordVal) {
      setFeedback({ type: 'error', text: 'Please enter both your email address and password.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await loginWithPassword(emailVal, passwordVal);
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Sign in failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phoneE164.trim();

    if (trimmedName.length < 2) {
      setFeedback({ type: 'error', text: 'Please enter your full name (at least 2 characters).' });
      return;
    }
    const phoneCheck = normalizeKenyanMsisdn(trimmedPhone);
    if (!phoneCheck.ok) {
      setFeedback({
        type: 'error',
        text: phoneCheck.error || 'Enter a valid Kenyan phone number (e.g. +254712345678 or 0712345678).',
      });
      return;
    }
    if (password.length < 8) {
      setFeedback({ type: 'error', text: 'Password must be at least 8 characters long.' });
      return;
    }
    if (isOrphanSelected && !guardianRelationship.trim()) {
      setFeedback({
        type: 'error',
        text: 'Please specify the guardian relationship or welfare authority.',
      });
      return;
    }

    setBusy(true);
    try {
      await registerAccount({
        email: trimmedEmail,
        password,
        fullName: trimmedName,
        phoneE164: phoneCheck.e164,
        countryCode: 'KE',
        selectedRoles,
        county,
        subCounty: subCounty.trim() || undefined,
        guardianOrgName: isOrphanSelected ? guardianOrgName.trim() || undefined : undefined,
        guardianRelationship: isOrphanSelected ? guardianRelationship.trim() || undefined : undefined,
        isMinorCase: isOrphanSelected,
        organisationName: isWellWisherSelected ? organisationName.trim() || undefined : undefined,
        supporterType: isWellWisherSelected ? 'WELL_WISHER' : 'SUPPORTIVE',
        vulnerabilitySummary: isBeneficiarySelected ? vulnerabilitySummary.trim() || undefined : undefined,
      });
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Registration failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleResetRequest = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ message: string; sandboxCode?: string }>(
        '/api/auth/password-reset/request',
        {
          method: 'POST',
          body: JSON.stringify({ email: resetEmail }),
        }
      );
      setResetRequested(true);
      if (res.sandboxCode) setSandboxHint(`Verification code: ${res.sandboxCode}`);
      setFeedback({ type: 'success', text: res.message });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await apiFetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({
          email: resetEmail,
          code: resetCode,
          newPassword: resetNewPass,
        }),
      });
      setFeedback({ type: 'success', text: 'Password updated. You may now sign in securely.' });
      setMode('login');
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Guidance Panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="hc-card p-5 space-y-2">
            <div className="text-xs font-semibold text-[#287A59]">Account Categories</div>
            <ul className="text-xs text-[#4A636A] space-y-1.5">
              <li><strong className="text-[#102E36]">1. Orphan / Guardian:</strong> Guardian or welfare org proxy intake.</li>
              <li><strong className="text-[#102E36]">2. Destitute:</strong> Acute displacement & emergency relief intake.</li>
              <li><strong className="text-[#102E36]">3. Needy:</strong> Medical, rent, school & empowerment needs.</li>
              <li><strong className="text-[#102E36]">4. Supportive:</strong> Direct sponsors & community volunteers.</li>
              <li><strong className="text-[#102E36]">5. Well Wisher:</strong> Philanthropists, companies, NGOs & churches.</li>
            </ul>
          </div>
        </div>

        {/* Right Interactive Auth Card */}
        <div className="lg:col-span-7 hc-card p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center gap-2 p-1 rounded-xl bg-[#EAE6DC]/70 w-fit">
            <button
              type="button"
              onClick={() => { setMode('login'); setFeedback(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                mode === 'login' ? 'bg-[#102E36] text-[#FAF9F6]' : 'text-[#102E36]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setFeedback(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                mode === 'register' ? 'bg-[#102E36] text-[#FAF9F6]' : 'text-[#102E36]'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => { setMode('reset'); setFeedback(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                mode === 'reset' ? 'bg-[#102E36] text-[#FAF9F6]' : 'text-[#102E36]'
              }`}
            >
              Reset Password
            </button>
          </div>

          {feedback && (
            <div
              className={`p-3.5 rounded-xl text-sm flex items-start gap-2.5 border ${
                feedback.type === 'error'
                  ? 'bg-[#9F2D20]/10 border-[#9F2D20]/25 text-[#9F2D20]'
                  : 'bg-[#287A59]/10 border-[#287A59]/25 text-[#287A59]'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{feedback.text}</span>
            </div>
          )}

          {mode === 'login' && (
            <div className="space-y-5">
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label htmlFor="auth-login-email" className="block text-xs font-semibold text-[#102E36] mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="auth-login-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="name@example.co.ke"
                    className="w-full px-4 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="auth-login-password" className="block text-xs font-semibold text-[#102E36]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(loginEmail);
                        setMode('reset');
                        setFeedback(null);
                      }}
                      className="text-xs font-semibold text-[#287A59] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="auth-login-password"
                      name="password"
                      type={showLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-4 pr-10 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <button
                      type="button"
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#4A636A] hover:text-[#102E36]"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <GlossyButton type="submit" variant="teal" size="lg" className="w-full" disabled={busy}>
                  <KeyRound className="w-4 h-4" />
                  {busy ? 'Verifying...' : 'Sign In Securely'}
                </GlossyButton>
              </form>

              {onOpenSuperAdmin && (
                <div className="pt-3 border-t border-[#102E36]/10 flex flex-wrap items-center justify-between gap-2 text-xs text-[#4A636A]">
                  <span>Platform governance & officer access?</span>
                  <button
                    type="button"
                    onClick={onOpenSuperAdmin}
                    className="inline-flex items-center gap-1.5 font-semibold text-[#102E36] hover:text-[#287A59]"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Super Admin Sign In
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#102E36]">
                  Select Account Category (One Category Only)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {REGISTERABLE_ROLES.map((code) => {
                    const meta = ROLE_DEFINITIONS[code];
                    const active = selectedRoles.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => selectRole(code)}
                        className={`text-left p-3 rounded-xl border transition-colors ${
                          active
                            ? 'bg-[#102E36] text-[#FAF9F6] border-[#102E36]'
                            : 'bg-white text-[#102E36] border-[#102E36]/15 hover:bg-[#EAE6DC]/50'
                        }`}
                      >
                        <div className="text-xs font-bold">{meta.label}</div>
                        <div
                          className={`text-[11px] mt-0.5 line-clamp-2 ${
                            active ? 'text-[#FAF9F6]/80' : 'text-[#4A636A]'
                          }`}
                        >
                          {meta.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Grace Wanjiku"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">
                    Kenya Phone (M-Pesa / OTP)
                  </label>
                  <input
                    type="tel"
                    required
                    value={phoneE164}
                    onChange={(e) => setPhoneE164(e.target.value)}
                    placeholder="+254712345678"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="grace@example.co.ke"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">Password (8+ chars)</label>
                  <div className="relative">
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Strong passphrase"
                      className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <button
                      type="button"
                      aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowRegisterPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#4A636A] hover:text-[#102E36]"
                    >
                      {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">County</label>
                  <select
                    value={county}
                    onChange={(e) => setCounty(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  >
                    {KENYAN_47_COUNTIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">Sub-County / Ward</label>
                  <input
                    type="text"
                    value={subCounty}
                    onChange={(e) => setSubCounty(e.target.value)}
                    placeholder="e.g. Naivasha / Westlands"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
              </div>

              {isOrphanSelected && (
                <div className="p-4 rounded-xl bg-[#EAE6DC]/50 border border-[#102E36]/10 space-y-3">
                  <div className="text-xs font-bold text-[#102E36]">
                    Minor Protection — Verified Guardian / Welfare Organisation Details
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      value={guardianRelationship}
                      onChange={(e) => setGuardianRelationship(e.target.value)}
                      placeholder="Guardian Relationship (e.g. Aunt / Children's Officer)"
                      className="w-full px-3.5 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <input
                      type="text"
                      value={guardianOrgName}
                      onChange={(e) => setGuardianOrgName(e.target.value)}
                      placeholder="Verifying Children's Home / School / Chief Office"
                      className="w-full px-3.5 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                    />
                  </div>
                </div>
              )}

              {isBeneficiarySelected && (
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">
                    Brief Household Situation Summary
                  </label>
                  <textarea
                    rows={2}
                    value={vulnerabilitySummary}
                    onChange={(e) => setVulnerabilitySummary(e.target.value)}
                    placeholder="Describe current household situation (do not enter minor full names or exact street address)."
                    className="w-full px-3.5 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
              )}

              {isWellWisherSelected && (
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">
                    <Building2 className="w-3.5 h-3.5 inline mr-1" />
                    Company / Foundation / Institutional Name (Optional for Individual Philanthropist)
                  </label>
                  <input
                    type="text"
                    value={organisationName}
                    onChange={(e) => setOrganisationName(e.target.value)}
                    placeholder="e.g. Savannah Impact Foundation"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
              )}

              <GlossyButton type="submit" variant="gold" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Provisioning Account...' : 'Create Humanity Connect Account'}
              </GlossyButton>
            </form>
          )}

          {mode === 'reset' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-[#102E36]">Account Email</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="name@example.co.ke"
                    className="flex-1 min-w-[200px] px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                  <GlossyButton type="button" variant="teal" onClick={handleResetRequest} disabled={busy}>
                    <Mail className="w-4 h-4" />
                    Send Reset Code
                  </GlossyButton>
                </div>
                {sandboxHint && (
                  <div className="text-xs font-mono-num text-[#287A59]">{sandboxHint}</div>
                )}
              </div>

              {resetRequested && (
                <form onSubmit={handleResetConfirm} className="space-y-3 pt-3 border-t border-[#102E36]/10">
                  <input
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="6-digit verification code"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                  <div className="relative">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={resetNewPass}
                      onChange={(e) => setResetNewPass(e.target.value)}
                      placeholder="New password (8+ chars)"
                      className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <button
                      type="button"
                      aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowResetPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#4A636A] hover:text-[#102E36]"
                    >
                      {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <GlossyButton type="submit" variant="green" disabled={busy}>
                    Confirm Password Reset
                  </GlossyButton>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const AccountSecurityPanel: React.FC = () => {
  const { user, apiFetch, refreshUser } = useAuth();
  const [sessions, setSessions] = useState<Array<{
    id: string;
    deviceLabel: string;
    activeRoleCode: string;
    lastSeenAt: string;
    revokedAt: string | null;
    isCurrent: boolean;
  }>>([]);
  const [phoneInput, setPhoneInput] = useState(user?.phoneE164 || '');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [mfaSetupSecret, setMfaSetupSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSessions = async () => {
    const data = await apiFetch<{ sessions: typeof sessions }>('/api/auth/sessions');
    setSessions(data.sessions);
  };

  React.useEffect(() => {
    loadSessions().catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-sm ${
            msg.type === 'error'
              ? 'bg-[#9F2D20]/10 border-[#9F2D20]/25 text-[#9F2D20]'
              : 'bg-[#287A59]/10 border-[#287A59]/25 text-[#287A59]'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Phone OTP & Email Verification */}
        <div className="hc-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#102E36]">
            <Smartphone className="w-4 h-4 text-[#287A59]" />
            Phone OTP & Email Verification
          </div>
          <div className="text-xs text-[#4A636A]">
            Email: {user?.emailVerified ? 'Verified' : 'Pending'} · Phone:{' '}
            {user?.phoneVerified ? 'Verified' : 'Pending'}
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+254712345678 or 0712345678"
              className="flex-1 px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              size="sm"
              variant="ivory"
              onClick={async () => {
                setMsg(null);
                try {
                  const res = await apiFetch<{ sandboxOtp?: string }>('/api/auth/verify-phone/send', {
                    method: 'POST',
                    body: JSON.stringify({ phoneE164: phoneInput }),
                  });
                  setMsg({
                    type: 'success',
                    text: res.sandboxOtp
                      ? `Phone OTP sent (sandbox code: ${res.sandboxOtp})`
                      : 'Phone OTP sent.',
                  });
                } catch (err: any) {
                  setMsg({ type: 'error', text: err.message || 'Unable to send phone OTP.' });
                }
              }}
            >
              Send OTP
            </GlossyButton>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={phoneOtp}
              onChange={(e) => setPhoneOtp(e.target.value)}
              placeholder="6-digit phone OTP"
              className="flex-1 px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              size="sm"
              variant="green"
              onClick={async () => {
                setMsg(null);
                try {
                  await apiFetch('/api/auth/verify-phone/confirm', {
                    method: 'POST',
                    body: JSON.stringify({ code: phoneOtp }),
                  });
                  await refreshUser();
                  setMsg({ type: 'success', text: 'Phone number verified.' });
                } catch (err: any) {
                  setMsg({ type: 'error', text: err.message || 'Phone verification failed.' });
                }
              }}
            >
              Verify Phone
            </GlossyButton>
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#102E36]/10">
            <input
              type="text"
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value)}
              placeholder="Email verification code"
              className="flex-1 px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              size="sm"
              variant="ivory"
              onClick={async () => {
                setMsg(null);
                try {
                  const res = await apiFetch<{ sandboxCode?: string }>('/api/auth/verify-email/send', {
                    method: 'POST',
                  });
                  setMsg({
                    type: 'success',
                    text: res.sandboxCode
                      ? `Email code issued (sandbox: ${res.sandboxCode})`
                      : 'Email sent.',
                  });
                } catch (err: any) {
                  setMsg({ type: 'error', text: err.message || 'Unable to send email code.' });
                }
              }}
            >
              Send
            </GlossyButton>
            <GlossyButton
              size="sm"
              variant="teal"
              onClick={async () => {
                setMsg(null);
                try {
                  await apiFetch('/api/auth/verify-email/confirm', {
                    method: 'POST',
                    body: JSON.stringify({ code: emailCode }),
                  });
                  await refreshUser();
                  setMsg({ type: 'success', text: 'Email verified.' });
                } catch (err: any) {
                  setMsg({ type: 'error', text: err.message || 'Email verification failed.' });
                }
              }}
            >
              Confirm
            </GlossyButton>
          </div>
        </div>

        {/* MFA TOTP Setup & Verification */}
        <div className="hc-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#102E36]">
            <Lock className="w-4 h-4 text-[#D9A84E]" />
            Multi-Factor Authentication (TOTP MFA)
          </div>
          <p className="text-xs text-[#4A636A]">
            Status: {user?.mfaEnabled ? 'Enabled' : 'Not Configured'} · Session Step-Up:{' '}
            {user?.mfaVerifiedInSession ? 'Verified' : 'Standard'}
          </p>
          <GlossyButton
            size="sm"
            variant="teal"
            onClick={async () => {
              setMsg(null);
              try {
                const res = await apiFetch<{ secret: string; currentVerificationHint?: string }>(
                  '/api/auth/mfa/setup',
                  { method: 'POST' }
                );
                setMfaSetupSecret(res.secret);
                if (res.currentVerificationHint) {
                  setMsg({
                    type: 'success',
                    text: `TOTP secret initialized. Current authenticator code: ${res.currentVerificationHint}`,
                  });
                }
              } catch (err: any) {
                setMsg({ type: 'error', text: err.message || 'MFA initialization failed.' });
              }
            }}
          >
            Initialize TOTP MFA
          </GlossyButton>
          {mfaSetupSecret && (
            <div className="p-3 rounded-xl bg-[#EAE6DC]/60 text-xs font-mono-num break-all">
              Secret Key: {mfaSetupSecret}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="6-digit authenticator code"
              className="flex-1 px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              size="sm"
              variant="gold"
              onClick={async () => {
                setMsg(null);
                try {
                  await apiFetch('/api/auth/mfa/verify', {
                    method: 'POST',
                    body: JSON.stringify({ code: mfaCode }),
                  });
                  await refreshUser();
                  setMsg({ type: 'success', text: 'MFA verified for active session.' });
                } catch (err: any) {
                  setMsg({ type: 'error', text: err.message || 'MFA verification failed.' });
                }
              }}
            >
              Verify MFA
            </GlossyButton>
          </div>
        </div>
      </div>

      {/* Active Devices & Sessions */}
      <div className="hc-card p-5 space-y-3">
        <div className="text-sm font-bold text-[#102E36]">Active Device Sessions</div>
        <div className="divide-y divide-[#102E36]/10">
          {sessions.map((s) => (
            <div key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-semibold text-[#102E36]">
                  {s.deviceLabel} {s.isCurrent ? '(Current Session)' : ''}
                </div>
                <div className="text-[#4A636A]">
                  Role: {s.activeRoleCode} · Last active {new Date(s.lastSeenAt).toLocaleString('en-KE')}
                </div>
              </div>
              {!s.revokedAt ? (
                <GlossyButton
                  size="sm"
                  variant="ivory"
                  onClick={async () => {
                    await apiFetch(`/api/auth/sessions/${s.id}`, { method: 'DELETE' });
                    await loadSessions();
                  }}
                >
                  Revoke Device
                </GlossyButton>
              ) : (
                <span className="text-[#9F2D20]">Revoked</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
