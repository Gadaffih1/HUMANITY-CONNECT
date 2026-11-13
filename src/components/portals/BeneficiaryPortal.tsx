import React, { useEffect, useState, useRef } from 'react';
import {
  LayoutDashboard,
  User,
  Home,
  BookOpen,
  Mic,
  Camera,
  FileText,
  MapPin,
  HeartHandshake,
  PlusCircle,
  Award,
  Wallet,
  Bell,
  Users,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Lock,
  Upload,
  Download,
  Square,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  GlossyButton,
  NeedCard,
  NotificationList,
  ModalDialog,
  formatMoney,
  verificationLabel,
  type PublicNeedItem,
} from '../ui/DesignSystem';

type BeneficiaryScreen =
  | 'dashboard'
  | 'personal'
  | 'household'
  | 'story'
  | 'audio'
  | 'photos'
  | 'documents'
  | 'location'
  | 'needs'
  | 'add-need'
  | 'sponsorship'
  | 'assistance'
  | 'messages'
  | 'family'
  | 'empowerment'
  | 'consent'
  | 'help';

const LABELS = {
  en: {
    portalTitle: 'Beneficiary Portal',
    refLabel: 'Unique Case Reference',
    saveBtn: 'Save Changes',
    aiAssist: 'Refine with Gemini AI (Kiswahili / English)',
    photoRule: 'Up to 3 recommended photographs per case (provide a safe exception reason for more).',
  },
  sw: {
    portalTitle: 'Tovuti ya Mpokeaji Msaada',
    refLabel: 'Nambari ya Kipekee ya Kesi',
    saveBtn: 'Hifadhi Mabadiliko',
    aiAssist: 'Boresha na Gemini AI (Kiswahili / Kiingereza)',
    photoRule: 'Hadi picha 3 zinapendekezwa kwa kila kesi (toa sababu ya usalama kwa ziada).',
  },
};

export const BeneficiaryPortal: React.FC = () => {
  const { apiFetch, user } = useAuth();
  const [lang, setLang] = useState<'en' | 'sw'>('en');
  const [screen, setScreen] = useState<BeneficiaryScreen>('dashboard');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Editable profile & story fields
  const [displayAlias, setDisplayAlias] = useState('');
  const [county, setCounty] = useState('Nairobi');
  const [subCounty, setSubCounty] = useState('');
  const [ward, setWard] = useState('');
  const [landmarkHint, setLandmarkHint] = useState('');
  const [vulnerabilitySummary, setVulnerabilitySummary] = useState('');
  const [storyTitle, setStoryTitle] = useState('');
  const [storyNarrative, setStoryNarrative] = useState('');
  const [audioTranscript, setAudioTranscript] = useState('');
  const [photoExceptionReason, setPhotoExceptionReason] = useState('');

  // Audio recording
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Family member form
  const [memberName, setMemberName] = useState('');
  const [memberRel, setMemberRel] = useState('Child / Dependent');
  const [memberAge, setMemberAge] = useState('10');
  const [memberSchool, setMemberSchool] = useState('Primary School');

  // Guardian form
  const [guardianRel, setGuardianRel] = useState('Aunt / Legal Guardian');
  const [guardianOrg, setGuardianOrg] = useState('');

  // Add Need form
  const [needCategoryId, setNeedCategoryId] = useState('');
  const [needTitle, setNeedTitle] = useState('');
  const [needDesc, setNeedDesc] = useState('');
  const [needAmountKes, setNeedAmountKes] = useState('15000');
  const [needFrequency, setNeedFrequency] = useState<'ONE_TIME' | 'MONTHLY' | 'TERMLY' | 'QUARTERLY'>('ONE_TIME');
  const [needDuration, setNeedDuration] = useState('1');
  const [needDeadline, setNeedDeadline] = useState('');
  const [needPriority, setNeedPriority] = useState<'P1_CRITICAL' | 'P2_URGENT' | 'P3_HIGH' | 'P4_MODERATE' | 'P5_DEVELOPMENTAL'>('P2_URGENT');
  const [needEvidence, setNeedEvidence] = useState('');

  // Safeguarding Help & AI Assist
  const [helpSummary, setHelpSummary] = useState('');
  const [helpCategory, setHelpCategory] = useState('SAFEGUARDING_HELP');
  const [dsarText, setDsarText] = useState('');
  const [previewDoc, setPreviewDoc] = useState<{ title: string; mimeType: string; base64Content: string } | null>(null);

  const t = LABELS[lang];

  const loadPortal = async () => {
    try {
      const res = await apiFetch<any>('/api/beneficiary/portal');
      setData(res);
      setDisplayAlias(res.profile.displayAlias || '');
      setCounty(res.profile.county || 'Nairobi');
      setSubCounty(res.profile.subCounty || '');
      setWard(res.profile.ward || '');
      setLandmarkHint(res.profile.landmarkHint || '');
      setVulnerabilitySummary(res.profile.vulnerabilitySummary || '');
      setAudioTranscript(res.profile.audioTranscript || '');
      setGuardianOrg(res.profile.guardianOrgName || '');
      if (res.stories?.[0]) {
        setStoryTitle(res.stories[0].title || '');
        setStoryNarrative(res.stories[0].narrative || '');
      }
      if (res.categories?.[0] && !needCategoryId) {
        setNeedCategoryId(res.categories[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, []);

  const saveProfileFields = async (overrides: Record<string, unknown> = {}) => {
    setErrorMsg(null);
    setFeedback(null);
    try {
      await apiFetch('/api/beneficiary/profile', {
        method: 'PUT',
        body: JSON.stringify({
          displayAlias,
          county,
          subCounty,
          ward,
          landmarkHint,
          vulnerabilitySummary,
          audioTranscript,
          audioLanguage: lang,
          storyTitle,
          storyNarrative,
          storyLanguage: lang,
          ...overrides,
        }),
      });
      await loadPortal();
      setFeedback(lang === 'sw' ? 'Taarifa zimehifadhiwa salama.' : 'Profile saved securely.');
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleFileUpload = async (
    file: File,
    docCategory: string,
    exceptionReason?: string
  ) => {
    setErrorMsg(null);
    setFeedback(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const resultStr = String(reader.result || '');
        const base64Content = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
        await apiFetch('/api/beneficiary/media', {
          method: 'POST',
          body: JSON.stringify({
            docCategory,
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64Content,
            exceptionReason,
          }),
        });
        await loadPortal();
        setFeedback('File encrypted and stored in private vault.');
      } catch (err: any) {
        setErrorMsg(err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((tr) => tr.stop());
        const reader = new FileReader();
        reader.onload = async () => {
          const b64 = String(reader.result || '').split(',')[1];
          if (b64) {
            await apiFetch('/api/beneficiary/media', {
              method: 'POST',
              body: JSON.stringify({
                docCategory: 'AUDIO_NARRATION',
                filename: `narration-${Date.now()}.webm`,
                mimeType: 'audio/webm',
                base64Content: b64,
              }),
            });
            await loadPortal();
            setFeedback('Voice narration encrypted and saved.');
          }
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      setErrorMsg('Microphone permission is unavailable in this browser context. You can type or upload an audio file instead.');
    }
  };

  const navItems: Array<{ id: BeneficiaryScreen; label: string; labelSw: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: '1. Dashboard', labelSw: '1. Dashibodi', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'personal', label: '2. Personal Info', labelSw: '2. Taarifa Binafsi', icon: <User className="w-4 h-4" /> },
    { id: 'household', label: '3. Household Details', labelSw: '3. Maelezo ya Kaya', icon: <Home className="w-4 h-4" /> },
    { id: 'story', label: '4. My Story', labelSw: '4. Hadithi Yangu', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'audio', label: '5. Audio Narration', labelSw: '5. Simulizi ya Sauti', icon: <Mic className="w-4 h-4" /> },
    { id: 'photos', label: '6. Photograph Uploads', labelSw: '6. Picha za Kesi', icon: <Camera className="w-4 h-4" /> },
    { id: 'documents', label: '7. Private Documents', labelSw: '7. Nyaraka za Siri', icon: <FileText className="w-4 h-4" /> },
    { id: 'location', label: '8. Location Info', labelSw: '8. Eneo', icon: <MapPin className="w-4 h-4" /> },
    { id: 'needs', label: '9. My Needs', labelSw: '9. Mahitaji Yangu', icon: <HeartHandshake className="w-4 h-4" /> },
    { id: 'add-need', label: '10. Add New Need', labelSw: '10. Ongeza Hitaji', icon: <PlusCircle className="w-4 h-4" /> },
    { id: 'sponsorship', label: '11. Sponsorship Status', labelSw: '11. Hali ya Ufadhili', icon: <Award className="w-4 h-4" /> },
    { id: 'assistance', label: '12. Assistance Received', labelSw: '12. Msaada Uliopokelewa', icon: <Wallet className="w-4 h-4" /> },
    { id: 'messages', label: '13. Messages & Alerts', labelSw: '13. Ujumbe na Arifa', icon: <Bell className="w-4 h-4" /> },
    { id: 'family', label: '14. Family & Guardians', labelSw: '14. Familia na Walezi', icon: <Users className="w-4 h-4" /> },
    { id: 'empowerment', label: '15. Empowerment Centre', labelSw: '15. Kituo cha Uwezeshaji', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'consent', label: '16. Privacy & Consent', labelSw: '16. Faragha na Idhini', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'help', label: '17. Help & Support', labelSw: '17. Msaada na Ulinzi', icon: <HelpCircle className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="hc-card p-10 text-center text-sm text-[#4A636A]">
          Loading encrypted beneficiary portal...
        </div>
      </div>
    );
  }

  const profile = data?.profile;
  const photos = (data?.mediaRecords || []).filter((m: any) => m.docCategory === 'CASE_PHOTOGRAPH');
  const docs = (data?.mediaRecords || []).filter(
    (m: any) => m.docCategory !== 'CASE_PHOTOGRAPH' && m.docCategory !== 'AUDIO_NARRATION'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Desktop Sidebar & Mobile Horizontal Nav */}
        <aside className="lg:w-72 shrink-0 space-y-4">
          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto pb-2 lg:pb-0">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setScreen(item.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors text-left ${
                  screen === item.id
                    ? 'bg-[#102E36] text-[#FAF9F6] shadow-xs'
                    : 'bg-[#FAF9F6] text-[#102E36] border border-[#102E36]/10 hover:bg-[#EAE6DC]/60'
                }`}
              >
                {item.icon}
                <span>{lang === 'sw' ? item.labelSw : item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Screen Viewport */}
        <main className="flex-1 min-w-0 space-y-5">
          {feedback && (
            <div className="p-3.5 rounded-xl bg-[#287A59]/10 border border-[#287A59]/25 text-sm text-[#287A59]">
              {feedback}
            </div>
          )}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-[#9F2D20]/10 border border-[#9F2D20]/25 text-sm text-[#9F2D20]">
              {errorMsg}
            </div>
          )}

          {screen === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="hc-card p-5">
                  <div className="text-xs text-[#4A636A]">Verification Stage</div>
                  <div className="text-lg font-extrabold text-[#102E36] mt-1">
                    {verificationLabel(profile?.verificationLevel || 'V0')}
                  </div>
                  <div className="text-xs text-[#287A59] mt-1">
                    Public Listing: {profile?.publicListingApproved ? 'Approved & Consented' : 'Private Until V4'}
                  </div>
                </div>
                <div className="hc-card p-5">
                  <div className="text-xs text-[#4A636A]">Active Need Requests</div>
                  <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
                    {data?.needs?.length || 0}
                  </div>
                  <div className="text-xs text-[#4A636A] mt-1">Multiple needs supported</div>
                </div>
                <div className="hc-card p-5">
                  <div className="text-xs text-[#4A636A]">Direct Assistance Received</div>
                  <div className="text-2xl font-extrabold font-mono-num text-[#287A59] mt-1">
                    {formatMoney(
                      (data?.disbursements || []).reduce((acc: number, d: any) => acc + d.amountMinor, 0),
                      'KES'
                    )}
                  </div>
                  <div className="text-xs text-[#4A636A] mt-1">Verified disbursements</div>
                </div>
              </div>

              <div className="hc-card p-6 space-y-3">
                <h3 className="text-lg font-bold text-[#102E36]">
                  {lang === 'sw' ? 'Hatua Zinazofuata za Kesi Yako' : 'Your Verification & Support Checklist'}
                </h3>
                <p className="text-sm text-[#4A636A]">
                  Complete your personal information, private documents, and consent preferences. Minor
                  cases remain strictly protected under verified guardian authority and never expose
                  private contact details.
                </p>
                <div className="flex flex-wrap gap-2.5 pt-2">
                  <GlossyButton size="sm" variant="gold" onClick={() => setScreen('add-need')}>
                    Add New Need Request
                  </GlossyButton>
                  <GlossyButton size="sm" variant="teal" onClick={() => setScreen('documents')}>
                    Upload Private Documents
                  </GlossyButton>
                  <GlossyButton size="sm" variant="ivory" onClick={() => setScreen('consent')}>
                    Manage Consent Controls
                  </GlossyButton>
                </div>
              </div>
            </div>
          )}

          {screen === 'personal' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Personal & Case Identity Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">Account Holder</label>
                  <input
                    disabled
                    value={user?.fullName || ''}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#EAE6DC]/50 border border-[#102E36]/15"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">
                    Public Safe Display Alias (Protects Identity)
                  </label>
                  <input
                    value={displayAlias}
                    onChange={(e) => setDisplayAlias(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">
                  Household Vulnerability Summary
                </label>
                <textarea
                  rows={3}
                  value={vulnerabilitySummary}
                  onChange={(e) => setVulnerabilitySummary(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <GlossyButton variant="teal" onClick={() => saveProfileFields()}>
                {t.saveBtn}
              </GlossyButton>
            </div>
          )}

          {(screen === 'household' || screen === 'family') && (
            <div className="space-y-5">
              <div className="hc-card p-6 space-y-4">
                <h3 className="text-lg font-bold text-[#102E36]">
                  Household & Family Members (Encrypted Minor Protection)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input
                    placeholder="Member full name (encrypted)"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    className="px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                  <input
                    placeholder="Relationship"
                    value={memberRel}
                    onChange={(e) => setMemberRel(e.target.value)}
                    className="px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                  <input
                    type="number"
                    placeholder="Age"
                    value={memberAge}
                    onChange={(e) => setMemberAge(e.target.value)}
                    className="px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                  <input
                    placeholder="Schooling / Care Status"
                    value={memberSchool}
                    onChange={(e) => setMemberSchool(e.target.value)}
                    className="px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <GlossyButton
                  size="sm"
                  variant="green"
                  onClick={async () => {
                    await apiFetch('/api/beneficiary/household', {
                      method: 'POST',
                      body: JSON.stringify({
                        fullName: memberName,
                        relationship: memberRel,
                        ageYears: Number(memberAge) || 0,
                        schoolingStatus: memberSchool,
                      }),
                    });
                    setMemberName('');
                    await loadPortal();
                    setFeedback('Household member added with encrypted PII.');
                  }}
                >
                  Add Household Member
                </GlossyButton>

                <div className="divide-y divide-[#102E36]/10 pt-2">
                  {(data?.householdMembers || []).map((m: any) => (
                    <div key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div>
                        <span className="font-bold text-[#102E36]">{m.fullName}</span>
                        <span className="text-xs text-[#4A636A] ml-2">
                          {m.relationship} · Age {m.ageYears} · {m.schoolingStatus}
                        </span>
                      </div>
                      {m.isMinor && (
                        <span className="text-xs font-semibold text-[#287A59]">
                          Minor Protected (Alias: {m.memberAlias})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="hc-card p-6 space-y-4">
                <h3 className="text-base font-bold text-[#102E36]">Verified Guardian / Organisation Stewardship</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={guardianRel}
                    onChange={(e) => setGuardianRel(e.target.value)}
                    placeholder="Guardian Relationship"
                    className="px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                  <input
                    value={guardianOrg}
                    onChange={(e) => setGuardianOrg(e.target.value)}
                    placeholder="Children's Home / Chief / Welfare Office"
                    className="px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <GlossyButton
                  size="sm"
                  variant="teal"
                  onClick={async () => {
                    await apiFetch('/api/beneficiary/guardian', {
                      method: 'POST',
                      body: JSON.stringify({
                        relationshipType: guardianRel,
                        guardianOrgName: guardianOrg,
                      }),
                    });
                    await loadPortal();
                    setFeedback('Guardian stewardship updated for verification.');
                  }}
                >
                  Save Guardian Record
                </GlossyButton>
              </div>
            </div>
          )}

          {screen === 'story' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">My Story (Human Review Required Before Public Display)</h3>
              <input
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                placeholder="Story Headline"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <textarea
                rows={6}
                value={storyNarrative}
                onChange={(e) => setStoryNarrative(e.target.value)}
                placeholder="Share your household context respectfully in English or Kiswahili..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <div className="flex flex-wrap gap-2.5">
                <GlossyButton variant="teal" onClick={() => saveProfileFields()}>
                  {t.saveBtn}
                </GlossyButton>
                <GlossyButton
                  variant="gold"
                  onClick={async () => {
                    try {
                      const res = await apiFetch<{ output: string }>('/api/ai/assist', {
                        method: 'POST',
                        body: JSON.stringify({
                          mode: 'STORY_WRITING',
                          text: storyNarrative || vulnerabilitySummary,
                          language: lang,
                        }),
                      });
                      setStoryNarrative(res.output);
                      setFeedback('AI story draft prepared. Please review carefully before saving.');
                    } catch (err: any) {
                      setErrorMsg(err.message);
                    }
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  {t.aiAssist}
                </GlossyButton>
              </div>
            </div>
          )}

          {screen === 'audio' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Audio Narration (English & Kiswahili)</h3>
              <p className="text-sm text-[#4A636A]">
                Record a dignified voice narration explaining your household needs. Audio files are encrypted
                in private cloud storage.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <GlossyButton variant={recording ? 'gold' : 'teal'} onClick={toggleRecording}>
                  {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {recording ? 'Stop & Encrypt Recording' : 'Start Voice Recording'}
                </GlossyButton>
                {audioUrl && <audio controls src={audioUrl} className="h-10" />}
              </div>
              <textarea
                rows={4}
                value={audioTranscript}
                onChange={(e) => setAudioTranscript(e.target.value)}
                placeholder="Voice transcript (Kiswahili or English)..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <div className="flex flex-wrap gap-2.5">
                <GlossyButton variant="green" onClick={() => saveProfileFields()}>
                  Save Transcript
                </GlossyButton>
                <GlossyButton
                  variant="ivory"
                  onClick={async () => {
                    try {
                      const res = await apiFetch<{ output: string }>('/api/ai/assist', {
                        method: 'POST',
                        body: JSON.stringify({
                          mode: 'TRANSLATE_SW_EN',
                          text: audioTranscript,
                          language: lang,
                        }),
                      });
                      setAudioTranscript(res.output);
                      setFeedback('Transcript translated via secure Gemini service.');
                    } catch (err: any) {
                      setErrorMsg(err.message);
                    }
                  }}
                >
                  Translate Kiswahili / English
                </GlossyButton>
              </div>
            </div>
          )}

          {screen === 'photos' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Photograph Uploads ({photos.length} / 3 Recommended)</h3>
              <p className="text-sm text-[#4A636A]">{t.photoRule}</p>
              {photos.length >= 3 && (
                <input
                  value={photoExceptionReason}
                  onChange={(e) => setPhotoExceptionReason(e.target.value)}
                  placeholder="Safe exception reason required for 4th+ photograph (e.g. storm damage evidence)"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#D9A84E]"
                />
              )}
              <label className="inline-flex items-center gap-2 hc-btn hc-btn-teal px-4 py-2.5 text-sm cursor-pointer">
                <Upload className="w-4 h-4" />
                Upload Encrypted Case Photograph
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, 'CASE_PHOTOGRAPH', photoExceptionReason);
                  }}
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {photos.map((p: any) => (
                  <div key={p.id} className="p-4 rounded-xl border border-[#102E36]/15 bg-white space-y-2 text-xs">
                    <div className="font-mono-num text-[#102E36] truncate">{p.objectKey}</div>
                    <div className="text-[#4A636A]">
                      {(p.byteSize / 1024).toFixed(1)} KB · {p.reviewStatus}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {screen === 'documents' && (
            <div className="hc-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#287A59]" />
                <h3 className="text-lg font-bold text-[#102E36]">Private Encrypted Document Vault</h3>
              </div>
              <p className="text-sm text-[#4A636A]">
                Original IDs, Chief’s letters, Birth Certificates, School Fee Slips, and Medical Bills are
                AES-256 encrypted in private cloud storage and never exposed publicly.
              </p>
              <div className="flex flex-wrap gap-3">
                {[
                  { code: 'NATIONAL_ID', label: 'Upload National ID / Passport' },
                  { code: 'GUARDIAN_LETTER', label: 'Upload Guardian / Chief Letter' },
                  { code: 'SCHOOL_FEE_SLIP', label: 'Upload School Fee Structure' },
                  { code: 'MEDICAL_BILL', label: 'Upload Medical Invoice' },
                ].map((docBtn) => (
                  <label
                    key={docBtn.code}
                    className="hc-btn hc-btn-ivory px-4 py-2 text-xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {docBtn.label}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUpload(f, docBtn.code);
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="divide-y divide-[#102E36]/10 pt-2">
                {docs.map((d: any) => (
                  <div key={d.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-[#102E36]">{d.docCategory.replace(/_/g, ' ')}</div>
                      <div className="text-[#4A636A] font-mono-num">
                        SHA-256: {d.checksumSha256.slice(0, 16)}… · {d.reviewStatus}
                      </div>
                    </div>
                    <GlossyButton
                      size="sm"
                      variant="ivory"
                      onClick={async () => {
                        const res = await apiFetch<{ mimeType: string; base64Content: string }>(
                          `/api/beneficiary/media/${d.id}/download`
                        );
                        setPreviewDoc({
                          title: d.docCategory,
                          mimeType: res.mimeType,
                          base64Content: res.base64Content,
                        });
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Decrypt & View
                    </GlossyButton>
                  </div>
                ))}
              </div>
            </div>
          )}

          {screen === 'location' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Location Information (Privacy Protected)</h3>
              <p className="text-sm text-[#4A636A]">
                Only County is shown publicly after V4 approval. Exact ward and landmark hints are encrypted
                strictly for assigned verification officers.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <input
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  placeholder="County"
                  className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
                <input
                  value={subCounty}
                  onChange={(e) => setSubCounty(e.target.value)}
                  placeholder="Sub-County"
                  className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
                <input
                  value={ward}
                  onChange={(e) => setWard(e.target.value)}
                  placeholder="Ward"
                  className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <input
                value={landmarkHint}
                onChange={(e) => setLandmarkHint(e.target.value)}
                placeholder="Encrypted officer landmark hint (never published)"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <GlossyButton variant="teal" onClick={() => saveProfileFields()}>
                Save Protected Location
              </GlossyButton>
            </div>
          )}

          {screen === 'needs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#102E36]">My Household Needs</h3>
                <GlossyButton size="sm" variant="gold" onClick={() => setScreen('add-need')}>
                  + Add New Need
                </GlossyButton>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(data?.needs || []).map((n: PublicNeedItem) => (
                  <NeedCard key={n.id} need={n} />
                ))}
              </div>
            </div>
          )}

          {screen === 'add-need' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Submit New Need Request</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">Need Category</label>
                  <select
                    value={needCategoryId}
                    onChange={(e) => setNeedCategoryId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  >
                    {(data?.categories || []).map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#102E36] mb-1">Requested Amount (KES)</label>
                  <input
                    type="number"
                    min={100}
                    value={needAmountKes}
                    onChange={(e) => setNeedAmountKes(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
              </div>
              <input
                value={needTitle}
                onChange={(e) => setNeedTitle(e.target.value)}
                placeholder="Need Title (e.g. Term 2 Secondary Tuition Balance)"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <textarea
                rows={3}
                value={needDesc}
                onChange={(e) => setNeedDesc(e.target.value)}
                placeholder="Detailed description of need and impact..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={needFrequency}
                  onChange={(e) => setNeedFrequency(e.target.value as any)}
                  className="px-3 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="ONE_TIME">One-Time</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="TERMLY">School Term</option>
                  <option value="QUARTERLY">Quarterly</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={needDuration}
                  onChange={(e) => setNeedDuration(e.target.value)}
                  placeholder="Duration (Months)"
                  className="px-3 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
                <input
                  type="date"
                  value={needDeadline}
                  onChange={(e) => setNeedDeadline(e.target.value)}
                  className="px-3 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={needPriority}
                  onChange={(e) => setNeedPriority(e.target.value as any)}
                  className="px-3 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="P1_CRITICAL">P1 Critical</option>
                  <option value="P2_URGENT">P2 Urgent</option>
                  <option value="P3_HIGH">P3 High</option>
                  <option value="P4_MODERATE">P4 Moderate</option>
                  <option value="P5_DEVELOPMENTAL">P5 Developmental</option>
                </select>
                <input
                  value={needEvidence}
                  onChange={(e) => setNeedEvidence(e.target.value)}
                  placeholder="Supporting evidence note (e.g. Fee slip uploaded)"
                  className="px-3 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <GlossyButton
                variant="gold"
                onClick={async () => {
                  try {
                    await apiFetch('/api/beneficiary/needs', {
                      method: 'POST',
                      body: JSON.stringify({
                        categoryId: needCategoryId,
                        title: needTitle,
                        description: needDesc,
                        supportingEvidenceNotes: needEvidence,
                        targetAmountMinor: Math.round(Number(needAmountKes || 0) * 100),
                        currency: 'KES',
                        deadlineAt: needDeadline || undefined,
                        isRecurring: needFrequency !== 'ONE_TIME',
                        frequency: needFrequency,
                        durationMonths: Number(needDuration) || 1,
                        priorityTier: needPriority,
                      }),
                    });
                    setNeedTitle('');
                    setNeedDesc('');
                    await loadPortal();
                    setScreen('needs');
                    setFeedback('Need request submitted with unique reference for human assessment.');
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  }
                }}
              >
                Submit Need for Verification
              </GlossyButton>
            </div>
          )}

          {screen === 'sponsorship' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Sponsorship Status</h3>
              {(data?.sponsorships || []).length === 0 ? (
                <p className="text-sm text-[#4A636A]">
                  Once your case reaches V4 verification and receives supporter consent, active direct
                  sponsorships appear here.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.sponsorships.map((s: any) => (
                    <div key={s.id} className="p-4 rounded-xl border border-[#102E36]/10 bg-white flex justify-between">
                      <div>
                        <div className="font-bold text-[#102E36]">Direct Sponsorship</div>
                        <div className="text-xs text-[#4A636A]">Status: {s.status}</div>
                      </div>
                      <div className="font-mono-num font-bold text-[#287A59]">
                        {formatMoney(s.monthlyAmountMinor, s.currency)} / mo
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {screen === 'assistance' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Verified Assistance & Disbursements Received</h3>
              {(data?.disbursements || []).length === 0 ? (
                <p className="text-sm text-[#4A636A]">No disbursements settled yet.</p>
              ) : (
                <div className="divide-y divide-[#102E36]/10">
                  {data.disbursements.map((d: any) => (
                    <div key={d.id} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-semibold text-[#102E36]">{d.pathway} · {d.channel}</div>
                        <div className="text-xs text-[#4A636A] font-mono-num">Ref: {d.externalReference}</div>
                      </div>
                      <div className="font-mono-num font-bold text-[#287A59]">
                        {formatMoney(d.amountMinor, d.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {screen === 'messages' && <NotificationList items={data?.notifications || []} />}

          {screen === 'empowerment' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Empowerment Centre</h3>
              <p className="text-sm text-[#287A59] font-medium">
                Policy Guarantee: Joining an empowerment programme never automatically terminates your active
                humanitarian support.
              </p>
              {(data?.empowermentMilestones || []).map((em: any) => (
                <div key={em.id} className="p-4 rounded-xl bg-white border border-[#102E36]/10 space-y-2">
                  <div className="flex justify-between text-sm font-bold text-[#102E36]">
                    <span>{em.pathwayName}</span>
                    <span className="font-mono-num text-[#287A59]">{em.completionPct}%</span>
                  </div>
                  <div className="text-xs text-[#4A636A]">{em.moduleTitle} · {em.microGrantStatus}</div>
                </div>
              ))}
              <GlossyButton
                size="sm"
                variant="green"
                onClick={async () => {
                  await apiFetch('/api/operations/empowerment/enrol', {
                    method: 'POST',
                    body: JSON.stringify({
                      beneficiaryId: profile.id,
                      pathwayName: 'Digital Literacy & M-Pesa Bookkeeping',
                      moduleTitle: 'Household Financial Resilience Cohort',
                    }),
                  });
                  await loadPortal();
                  setFeedback('Enrolled in Empowerment Centre programme.');
                }}
              >
                Enrol in Skills & Financial Literacy Cohort
              </GlossyButton>
            </div>
          )}

          {screen === 'consent' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Privacy, Minor Protection & Consent Controls</h3>
              <div className="space-y-3">
                {[
                  { scope: 'DATA_PROCESSING', label: 'Essential Verification Data Processing Consent' },
                  { scope: 'PUBLIC_STORY', label: 'Public Verified Profile Listing Consent (Requires V4 & Minor Clearance)' },
                  { scope: 'MEDIA_PUBLISHING', label: 'Approved Non-Identifying Media Consent' },
                  { scope: 'AI_TRIAGE', label: 'Opt-In Gemini Kiswahili/English Narrative & Intake Assistance' },
                ].map((c) => {
                  const latest = (data?.consents || []).find((r: any) => r.consentScope === c.scope);
                  const active = Boolean(latest?.granted);
                  return (
                    <div key={c.scope} className="p-4 rounded-xl bg-white border border-[#102E36]/10 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-bold text-[#102E36]">{c.label}</div>
                        <div className="text-xs text-[#4A636A]">
                          Current state: {active ? 'Granted' : 'Withheld / Revoked'}
                        </div>
                      </div>
                      <GlossyButton
                        size="sm"
                        variant={active ? 'ivory' : 'green'}
                        onClick={async () => {
                          try {
                            await apiFetch('/api/beneficiary/consent', {
                              method: 'PUT',
                              body: JSON.stringify({ consentScope: c.scope, granted: !active }),
                            });
                            await loadPortal();
                          } catch (err: any) {
                            setErrorMsg(err.message);
                          }
                        }}
                      >
                        {active ? 'Revoke' : 'Grant Consent'}
                      </GlossyButton>
                    </div>
                  );
                })}
              </div>
              <div className="pt-4 border-t border-[#102E36]/10 space-y-2">
                <div className="text-sm font-bold text-[#102E36]">Data Protection Rights (Access / Correction / Deletion)</div>
                <div className="flex gap-2">
                  <input
                    value={dsarText}
                    onChange={(e) => setDsarText(e.target.value)}
                    placeholder="Describe your privacy access, correction, or deletion request..."
                    className="flex-1 px-3 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                  <GlossyButton
                    size="sm"
                    variant="teal"
                    onClick={async () => {
                      const res = await apiFetch<{ reference: string }>('/api/operations/privacy/dsar', {
                        method: 'POST',
                        body: JSON.stringify({ requestType: 'ACCESS_EXPORT', details: dsarText }),
                      });
                      setDsarText('');
                      setFeedback(`Privacy request ${res.reference} logged for DPO review.`);
                    }}
                  >
                    Submit Privacy Request
                  </GlossyButton>
                </div>
              </div>
            </div>
          )}

          {screen === 'help' && (
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Confidential Safeguarding & Support Desk</h3>
              <select
                value={helpCategory}
                onChange={(e) => setHelpCategory(e.target.value)}
                className="w-full sm:w-auto px-3.5 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="SAFEGUARDING_HELP">General Case Support</option>
                <option value="CHILD_PROTECTION">Urgent Child Protection Alert</option>
                <option value="APPEAL">Verification Appeal / Reassessment</option>
              </select>
              <textarea
                rows={4}
                value={helpSummary}
                onChange={(e) => setHelpSummary(e.target.value)}
                placeholder="Write confidentially in English or Kiswahili..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <GlossyButton
                variant="gold"
                onClick={async () => {
                  const res = await apiFetch<{ ticketId: string }>('/api/beneficiary/support-alert', {
                    method: 'POST',
                    body: JSON.stringify({ category: helpCategory, summary: helpSummary }),
                  });
                  setHelpSummary('');
                  await loadPortal();
                  setFeedback(`Confidential support ticket #${res.ticketId.slice(0, 8)} logged.`);
                }}
              >
                Send Confidential Alert
              </GlossyButton>
            </div>
          )}
        </main>
      </div>

      <ModalDialog
        open={Boolean(previewDoc)}
        title={`Decrypted Private Document: ${previewDoc?.title || ''}`}
        onClose={() => setPreviewDoc(null)}
      >
        {previewDoc && (
          <div className="space-y-3">
            {previewDoc.mimeType.startsWith('image/') ? (
              <img
                src={`data:${previewDoc.mimeType};base64,${previewDoc.base64Content}`}
                alt={previewDoc.title}
                className="max-h-96 mx-auto rounded-xl border border-[#102E36]/15"
              />
            ) : (
              <a
                href={`data:${previewDoc.mimeType};base64,${previewDoc.base64Content}`}
                download={`${previewDoc.title}.bin`}
                className="hc-btn hc-btn-teal px-4 py-2 text-sm"
              >
                Download Decrypted File
              </a>
            )}
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
