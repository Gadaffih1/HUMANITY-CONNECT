import React, { useState } from 'react';
import {
  HeartHandshake,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  Lock,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  GlossyButton,
  ModalDialog,
  type PublicBeneficiaryCardData,
  type PublicNeedItem,
} from './components/ui/DesignSystem';
import { PublicLandingPage } from './components/public/PublicLandingPage';
import { AuthScreens, AccountSecurityPanel } from './components/auth/AuthScreens';
import { BeneficiaryPortal } from './components/portals/BeneficiaryPortal';
import { SupporterPortal } from './components/portals/SupporterPortal';
import { CorporatePortal } from './components/portals/CorporatePortal';
import { AdminVerificationPortal } from './components/portals/AdminVerificationPortal';
import { ROLE_DEFINITIONS, type RoleCode } from './types/domain';

type AppRoute = 'public' | 'auth' | 'portal' | 'security';

const HumanityConnectShell: React.FC = () => {
  const { user, loading, switchRole, loginWithPassword, signInWithGoogle, logout } = useAuth();
  const [route, setRoute] = useState<AppRoute>('public');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [presetRole, setPresetRole] = useState<string>('SUPPORTIVE');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [spModalOpen, setSpModalOpen] = useState(false);
  const [spEmail, setSpEmail] = useState('');
  const [spPassword, setSpPassword] = useState('');
  const [spBusy, setSpBusy] = useState(false);
  const [spError, setSpError] = useState<string | null>(null);

  const [pendingCheckout, setPendingCheckout] = useState<{
    beneficiary?: PublicBeneficiaryCardData;
    need?: PublicNeedItem;
    fundId?: string;
    fundName?: string;
  } | null>(null);

  const openAuth = (mode: 'login' | 'register', role = 'SUPPORTIVE') => {
    setAuthMode(mode);
    setPresetRole(role);
    setRoute('auth');
    setMobileMenuOpen(false);
  };

  const renderActivePortal = () => {
    if (!user) return null;
    switch (user.activeRole) {
      case 'ORPHAN_GUARDIAN':
      case 'DESTITUTE':
      case 'NEEDY':
        return <BeneficiaryPortal />;
      case 'WELL_WISHER':
        return <CorporatePortal />;
      case 'SUPER_ADMIN':
      case 'FIELD_OFFICER':
        return <AdminVerificationPortal />;
      case 'SUPPORTIVE':
      default:
        return <SupporterPortal initialCheckoutTarget={pendingCheckout} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2EC] text-[#102E36]">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#102E36]/10 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setRoute('public');
              setMobileMenuOpen(false);
            }}
            className="flex items-center gap-2.5 text-left shrink-0"
          >
            <span className="w-9 h-9 rounded-xl bg-[#102E36] text-[#D9A84E] flex items-center justify-center shadow-xs">
              <HeartHandshake className="w-5 h-5" />
            </span>
            <span>
              <span className="block font-display font-extrabold text-sm sm:text-base tracking-tight text-[#102E36]">
                HUMANITY CONNECT
              </span>
              <span className="block text-[10px] font-medium text-[#287A59] leading-none">
                Together We Can Change Lives
              </span>
            </span>
          </button>

          {/* Zone 2: Concise Single-Line Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-[#102E36]">
            <button
              type="button"
              onClick={() => setRoute('public')}
              className={`whitespace-nowrap transition-colors hover:text-[#287A59] ${
                route === 'public' ? 'text-[#287A59]' : ''
              }`}
            >
              Public Cases & Funds
            </button>
            {user && (
              <button
                type="button"
                onClick={() => setRoute('portal')}
                className={`whitespace-nowrap transition-colors hover:text-[#287A59] ${
                  route === 'portal' ? 'text-[#287A59]' : ''
                }`}
              >
                My Workspace ({ROLE_DEFINITIONS[user.activeRole]?.shortLabel})
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={() => setRoute('security')}
                className={`whitespace-nowrap transition-colors hover:text-[#287A59] ${
                  route === 'security' ? 'text-[#287A59]' : ''
                }`}
              >
                Security & MFA
              </button>
            )}
          </nav>

          {/* Zone 3: Single Primary Action / Multi-Role Switcher */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
            {user ? (
              <>
                {user.roles.length > 1 && (
                  <select
                    aria-label="Switch active role"
                    value={user.activeRole}
                    onChange={async (e) => {
                      await switchRole(e.target.value as RoleCode);
                      setRoute('portal');
                    }}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-[#102E36]/15 text-[#102E36]"
                  >
                    {user.roles.map((r) => (
                      <option key={r} value={r}>
                        Role: {ROLE_DEFINITIONS[r]?.shortLabel || r}
                      </option>
                    ))}
                  </select>
                )}
                {route !== 'portal' && (
                  <GlossyButton size="sm" variant="teal" onClick={() => setRoute('portal')}>
                    Open Portal
                  </GlossyButton>
                )}
                <GlossyButton
                  size="sm"
                  variant="ivory"
                  onClick={async () => {
                    await logout();
                    setRoute('public');
                  }}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </GlossyButton>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAuth('login')}
                  className="px-3 py-2 text-xs font-semibold text-[#102E36] hover:text-[#287A59] whitespace-nowrap"
                >
                  Sign In
                </button>
                <GlossyButton size="sm" variant="gold" onClick={() => openAuth('register', 'SUPPORTIVE')}>
                  Get Started
                </GlossyButton>
              </>
            )}
          </div>

          {/* Mobile Hamburger Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="md:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-[#102E36]/15 text-[#102E36]"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#102E36]/10 bg-[#FAF9F6] px-4 py-4 space-y-3">
            <button
              type="button"
              onClick={() => {
                setRoute('public');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#EAE6DC]/60"
            >
              Public Cases & Funds
            </button>
            {user && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRoute('portal');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#EAE6DC]/60"
                >
                  My Portal ({ROLE_DEFINITIONS[user.activeRole]?.shortLabel})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoute('security');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#EAE6DC]/60"
                >
                  Security, OTP & TOTP MFA
                </button>
                {user.roles.length > 1 && (
                  <select
                    value={user.activeRole}
                    onChange={async (e) => {
                      await switchRole(e.target.value as RoleCode);
                      setRoute('portal');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full px-3 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  >
                    {user.roles.map((r) => (
                      <option key={r} value={r}>
                        Switch Role: {ROLE_DEFINITIONS[r]?.shortLabel || r}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}

            <div className="pt-2 border-t border-[#102E36]/10 flex gap-2">
              {user ? (
                <GlossyButton
                  variant="ivory"
                  className="w-full"
                  onClick={async () => {
                    await logout();
                    setRoute('public');
                    setMobileMenuOpen(false);
                  }}
                >
                  Sign Out
                </GlossyButton>
              ) : (
                <>
                  <GlossyButton variant="ivory" className="flex-1" onClick={() => openAuth('login')}>
                    Sign In
                  </GlossyButton>
                  <GlossyButton
                    variant="gold"
                    className="flex-1"
                    onClick={() => openAuth('register', 'SUPPORTIVE')}
                  >
                    Get Started
                  </GlossyButton>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {loading ? (
          <div className="max-w-7xl mx-auto p-10 text-center text-sm text-[#4A636A]">
            Initializing Humanity Connect...
          </div>
        ) : route === 'auth' ? (
          <AuthScreens
            initialMode={authMode}
            presetRole={presetRole}
            onSuccess={() => setRoute('portal')}
          />
        ) : route === 'security' && user ? (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#287A59]" />
              <h2 className="text-2xl font-extrabold text-[#102E36]">
                Account Security, OTP Verification & Device Sessions
              </h2>
            </div>
            <AccountSecurityPanel />
          </div>
        ) : route === 'portal' && user ? (
          renderActivePortal()
        ) : (
          <PublicLandingPage
            onNavigateAuth={openAuth}
            onStartSponsorship={(ben, need) => {
              setPendingCheckout({ beneficiary: ben, need });
              if (user) {
                setRoute('portal');
              } else {
                openAuth('register', 'SUPPORTIVE');
              }
            }}
            onOpenFundContribution={(fundId, fundName) => {
              setPendingCheckout({ fundId, fundName });
              if (user) {
                setRoute('portal');
              } else {
                openAuth('register', 'SUPPORTIVE');
              }
            }}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#102E36]/10 bg-[#FAF9F6] py-8 px-4 sm:px-6 lg:px-8 mt-12 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#4A636A]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#287A59]" />
            <span>
              <strong className="text-[#102E36]">HUMANITY CONNECT</strong> · Kenya Humanitarian &
              Sponsorship Platform · Child Safeguarding & Data Protection Compliant
            </span>
          </div>
          <div className="flex items-center justify-end w-full sm:w-auto">
            <button
              type="button"
              aria-label="Super Admin Login"
              title="Super Admin Login"
              onClick={async () => {
                setSpError(null);
                if (user?.roles.includes('SUPER_ADMIN')) {
                  if (user.activeRole !== 'SUPER_ADMIN') {
                    await switchRole('SUPER_ADMIN');
                  }
                  setRoute('portal');
                  return;
                }
                setSpModalOpen(true);
              }}
              className="px-2 py-0.5 text-[11px] font-mono-num font-semibold rounded-md border border-[#102E36]/20 bg-[#F4F2EC] text-[#4A636A] hover:text-[#102E36] hover:border-[#102E36]/40 transition-colors"
            >
              sp
            </button>
          </div>
        </div>
      </footer>

      {/* Dedicated Super Admin Sign-In Modal */}
      <ModalDialog
        open={spModalOpen}
        title="Super Admin Governance Sign In"
        subtitle="Authorised platform governance, verification & safeguarding access"
        onClose={() => {
          setSpModalOpen(false);
          setSpError(null);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSpBusy(true);
            setSpError(null);
            try {
              await loginWithPassword(spEmail, spPassword);
              setSpModalOpen(false);
              setSpEmail('');
              setSpPassword('');
              setRoute('portal');
            } catch (err: any) {
              setSpError(err.message || 'Super Admin sign in failed.');
            } finally {
              setSpBusy(false);
            }
          }}
        >
          {spError && (
            <div className="p-3 rounded-xl bg-[#9F2D20]/10 border border-[#9F2D20]/25 text-xs text-[#9F2D20]">
              {spError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-[#102E36] mb-1">
              Administrator Email
            </label>
            <input
              type="email"
              required
              value={spEmail}
              onChange={(e) => setSpEmail(e.target.value)}
              placeholder="admin@humanityconnect.org"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#102E36] mb-1">
              Administrator Password
            </label>
            <input
              type="password"
              required
              value={spPassword}
              onChange={(e) => setSpPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <GlossyButton type="submit" variant="teal" className="flex-1" disabled={spBusy}>
              <Lock className="w-4 h-4" />
              {spBusy ? 'Signing In...' : 'Sign In as Super Admin'}
            </GlossyButton>
            <GlossyButton
              type="button"
              variant="ivory"
              disabled={spBusy}
              onClick={async () => {
                setSpBusy(true);
                setSpError(null);
                try {
                  await signInWithGoogle();
                  setSpModalOpen(false);
                  setRoute('portal');
                } catch (err: any) {
                  setSpError(err.message || 'Google Sign-In failed.');
                } finally {
                  setSpBusy(false);
                }
              }}
            >
              Google Sign-In
            </GlossyButton>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <HumanityConnectShell />
    </AuthProvider>
  );
}
