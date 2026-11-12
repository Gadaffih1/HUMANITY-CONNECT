import React, { useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Smartphone,
  Mail,
  Building2,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GlossyButton } from '../ui/DesignSystem';
import { ROLE_DEFINITIONS, type RoleCode } from '../../types/domain';

const KENYA_COUNTIES = [
  'Nairobi',
  'Nakuru',
  'Kisumu',
  'Mombasa',
  'Kiambu',
  'Kilifi',
  'Kajiado',
  'Uasin Gishu',
  'Machakos',
  'Turkana',
  'Kitui',
  'Kakamega',
];

const REGISTERABLE_ROLES: RoleCode[] = [
  'ORPHAN_GUARDIAN',
  'DESTITUTE',
  'NEEDY',
  'SUPPORTIVE',
  'WELL_WISHER',
];

export const AuthScreens: React.FC<{
  initialMode?: 'login' | 'register';
  presetRole?: string;
  onSuccess: () => void;
}> = ({ initialMode = 'login', presetRole = 'SUPPORTIVE', onSuccess }) => {
  const { signInWithGoogle, loginWithPassword, registerAccount, apiFetch } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registration form (supports multi-role + separate beneficiary flows)
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>([
    REGISTERABLE_ROLES.includes(presetRole as RoleCode) ? (presetRole as RoleCode) : 'SUPPORTIVE',
  ]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneE164, setPhoneE164] = useState('+2547');
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

  const selectRole = (code: RoleCode) => {
    setSelectedRoles([code]);
  };

  const isOrphanSelected = selectedRoles.includes('ORPHAN_GUARDIAN');
  const isBeneficiarySelected = selectedRoles.some((r) =>
    ['ORPHAN_GUARDIAN', 'DESTITUTE', 'NEEDY'].includes(r)
  );
  const isWellWisherSelected = selectedRoles.includes('WELL_WISHER');

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await signInWithGoogle();
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Google Sign-In failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await loginWithPassword(loginEmail, loginPassword);
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Sign in failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await registerAccount({
        email,
        password,
        fullName,
        phoneE164,
        countryCode: 'KE',
        selectedRoles,
        county,
        subCounty,
        guardianOrgName: isOrphanSelected ? guardianOrgName : undefined,
        guardianRelationship: isOrphanSelected ? guardianRelationship : undefined,
        isMinorCase: isOrphanSelected,
        organisationName: isWellWisherSelected ? organisationName : undefined,
        supporterType: isWellWisherSelected ? 'WELL_WISHER' : 'SUPPORTIVE',
        vulnerabilitySummary: isBeneficiarySelected ? vulnerabilitySummary : undefined,
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
          <div className="hc-card p-6 bg-[#102E36] text-[#FAF9F6] space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#D9A84E]">
              <ShieldCheck className="w-4 h-4" />
              Safeguarding & Verified Access
            </div>
            <h2 className="text-2xl font-extrabold leading-snug">
              Humanity Connect Account Portal
            </h2>
            <p className="text-sm text-[#FAF9F6]/80 leading-relaxed">
              Choose the single account category that best matches your household, sponsorship, or
              institutional giving role.
            </p>
            <div className="pt-4 border-t border-[#FAF9F6]/15 space-y-2.5 text-xs text-[#FAF9F6]/85">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#D9A84E] shrink-0 mt-0.5" />
                <span>Phone OTP & Email verification protect every household and supporter account.</span>
              </div>
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-[#D9A84E] shrink-0 mt-0.5" />
                <span>
                  Super Admin and Field Officer roles cannot be self-selected; they are provisioned strictly
                  server-side with mandatory TOTP MFA.
                </span>
              </div>
            </div>
          </div>

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
              <GlossyButton
                type="button"
                variant="ivory"
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={handleGoogleSignIn}
              >
                <UserCheck className="w-4 h-4 text-[#287A59]" />
                Continue with Google Sign-In
              </GlossyButton>

              <div className="flex items-center gap-3 text-xs text-[#4A636A]">
                <div className="h-px flex-1 bg-[#102E36]/10" />
                <span>or sign in with email & password</span>
                <div className="h-px flex-1 bg-[#102E36]/10" />
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="name@example.co.ke"
                    className="w-full px-4 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-4 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <GlossyButton type="submit" variant="teal" size="lg" className="w-full" disabled={busy}>
                  <KeyRound className="w-4 h-4" />
                  {busy ? 'Verifying...' : 'Sign In Securely'}
                </GlossyButton>
              </form>
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
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Strong passphrase"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
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
                    {KENYA_COUNTIES.map((c) => (
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
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={resetNewPass}
                    onChange={(e) => setResetNewPass(e.target.value)}
                    placeholder="New password (8+ chars)"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
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
  const [phoneInput, setPhoneInput] = useState(user?.phoneE164 || '+2547');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [mfaSetupSecret, setMfaSetupSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

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
        <div className="p-3.5 rounded-xl bg-[#287A59]/10 border border-[#287A59]/25 text-sm text-[#287A59]">
          {msg}
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
              className="flex-1 px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              size="sm"
              variant="ivory"
              onClick={async () => {
                const res = await apiFetch<{ sandboxOtp?: string }>('/api/auth/verify-phone/send', {
                  method: 'POST',
                  body: JSON.stringify({ phoneE164: phoneInput }),
                });
                setMsg(res.sandboxOtp ? `Phone OTP sent (sandbox code: ${res.sandboxOtp})` : 'Phone OTP sent.');
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
                await apiFetch('/api/auth/verify-phone/confirm', {
                  method: 'POST',
                  body: JSON.stringify({ code: phoneOtp }),
                });
                await refreshUser();
                setMsg('Phone number verified.');
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
                const res = await apiFetch<{ sandboxCode?: string }>('/api/auth/verify-email/send', {
                  method: 'POST',
                });
                setMsg(res.sandboxCode ? `Email code issued (sandbox: ${res.sandboxCode})` : 'Email sent.');
              }}
            >
              Send
            </GlossyButton>
            <GlossyButton
              size="sm"
              variant="teal"
              onClick={async () => {
                await apiFetch('/api/auth/verify-email/confirm', {
                  method: 'POST',
                  body: JSON.stringify({ code: emailCode }),
                });
                await refreshUser();
                setMsg('Email verified.');
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
              const res = await apiFetch<{ secret: string; currentVerificationHint?: string }>(
                '/api/auth/mfa/setup',
                { method: 'POST' }
              );
              setMfaSetupSecret(res.secret);
              if (res.currentVerificationHint) {
                setMsg(`TOTP secret initialized. Current authenticator code: ${res.currentVerificationHint}`);
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
                await apiFetch('/api/auth/mfa/verify', {
                  method: 'POST',
                  body: JSON.stringify({ code: mfaCode }),
                });
                await refreshUser();
                setMsg('MFA verified for active session.');
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
