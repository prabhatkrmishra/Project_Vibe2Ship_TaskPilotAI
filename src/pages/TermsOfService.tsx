import { Link } from 'react-router-dom';
import { ArrowLeft, Scale, FileText, CheckCircle2, AlertOctagon } from 'lucide-react';

export function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-indigo-500 selection:text-white">
      <div className="max-w-4xl mx-auto bg-[#0d1117] border border-[#21262d] rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#21262d] pb-8 mb-8 relative z-10">
          <div>
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors mb-4 group">
              <ArrowLeft className="h-4 w-4 transform group-hover:-translate-x-1 transition-transform" /> Back to Homepage
            </Link>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#f0f6fc]">
              Terms of Service
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              Last updated: June 29, 2026
            </p>
          </div>
          <div className="flex items-center gap-3 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-2xl w-fit">
            <Scale className="h-5 w-5 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-300 tracking-wider uppercase">Legal Framework</span>
          </div>
        </div>

        <div className="space-y-8 text-slate-300 leading-relaxed relative z-10">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-cyan-400">1.</span> Acceptance of Terms
            </h2>
            <p>
              By accessing or using <strong>TaskPilot AI</strong> ("Service"), you agree to be bound by these Terms of Service ("Terms") and all applicable Indian laws, rules, and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-cyan-400">2.</span> Description of Service
            </h2>
            <p>
              TaskPilot AI is an autonomous, AI-driven task management and productivity application. The Service integrates with Google Workspace APIs (Calendar, Drive, Docs, Sheets, Slides) to automate, organize, and synthesize tasks, documents, and calendars for your personal or professional workflows.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-cyan-400">3.</span> Use License & Eligibility
            </h2>
            <p>
              Permission is granted to temporarily access the Service for personal or professional use. Under this license and in accordance with Indian cyber laws, you may not:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-slate-400">
              <li>Modify, copy, or distribute the materials.</li>
              <li>Attempt to decompile, reverse engineer, or hack any software contained in the Service.</li>
              <li>Remove any copyright or other proprietary notations from the materials.</li>
              <li>Host, display, upload, modify, publish, transmit, store, update or share any information that is harmful, harassing, defamatory, obscene, or violates any active Indian law.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-cyan-400">4.</span> Google Integration and India Data Privacy Policies
            </h2>
            <div className="bg-[#161b22] border border-[#21262d] p-5 rounded-2xl space-y-3">
              <p className="text-sm text-slate-300">
                Our integrations with Google Workspace APIs require active authentication tokens. By connecting your Google account, you grant TaskPilot AI the permission to perform tasks as specified during consent. We handle all data in compliance with the Information Technology Act, 2000, IT Rules 2011, and the Digital Personal Data Protection (DPDP) Act, 2023.
              </p>
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400">
                  You retain complete ownership over all files, calendar entries, and data generated or edited via Google Workspace APIs.
                </p>
              </div>
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400">
                  You may revoke TaskPilot AI's access to your Google Account at any time through your Google Security Settings page.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-cyan-400">5.</span> Disclaimer of Warranties
            </h2>
            <div className="flex gap-4 bg-amber-500/5 border border-amber-500/10 p-5 rounded-2xl">
              <AlertOctagon className="h-6 w-6 text-amber-500 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-400">"As Is" Disclaimer</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  The services and materials on TaskPilot AI are provided on an "as is" and "as available" basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-cyan-400">6.</span> Limitation of Liability
            </h2>
            <p>
              In no event shall TaskPilot AI or its partners be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials or integration services, even if we have been notified of the possibility of such damage under relevant Indian statutes.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-cyan-400">7.</span> Governing Law and Jurisdiction
            </h2>
            <p>
              These Terms of Service, your relationship with the Service, and any disputes arising out of or in connection with them shall be governed by, and construed in accordance with, the laws of India (specifically the Information Technology Act, 2000, and allied rules). Any legal action or proceeding related to this Service shall be brought exclusively in the competent courts of New Delhi, India.
            </p>
          </section>
        </div>

        <div className="border-t border-[#21262d] mt-12 pt-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 TaskPilot AI. All rights reserved.</p>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-cyan-400 transition-colors">Privacy Policy</Link>
            <Link to="/" className="hover:text-cyan-400 transition-colors">Back to Homepage</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
