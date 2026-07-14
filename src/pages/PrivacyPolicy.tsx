import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, Server, RefreshCw } from 'lucide-react';

export function PrivacyPolicy() {
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
              Privacy Policy
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              Last updated: June 29, 2026
            </p>
          </div>
          <div className="flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 rounded-2xl w-fit">
            <Shield className="h-5 w-5 text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-300 tracking-wider uppercase">Secure Platform</span>
          </div>
        </div>

        <div className="space-y-8 text-slate-300 leading-relaxed relative z-10">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-indigo-400">1.</span> Introduction
            </h2>
            <p>
              Welcome to <strong>TaskPilot AI</strong> ("we", "our", or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application.
            </p>
            <p>
              Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access or use the application.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-indigo-400">2.</span> How We Use Google User Data
            </h2>
            <p className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl text-slate-300 text-sm">
              <strong>Crucial Google API Scopes Disclosure:</strong> TaskPilot AI requests access to specific Google Workspace API scopes to power its autonomous productivity and file management tools. We adhere strictly to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
            </p>
            <p>
              We request and use the following Google scopes exclusively for the core features listed below:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm text-slate-400">
              <li>
                <strong className="text-slate-200">Google Calendar (<code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300">.../auth/calendar</code>):</strong> Used to fetch your schedule, identify conflicts, suggest optimal task slots, and write new productivity events to your calendar.
              </li>
              <li>
                <strong className="text-slate-200">Google Drive (<code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300">.../auth/drive</code>):</strong> Used to search, organize, and reference relevant source documents that you select to assist in drafting tasks and plans.
              </li>
              <li>
                <strong className="text-slate-200">Google Docs (<code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300">.../auth/documents</code>):</strong> Used to compile action plans, export summary documents, and read task briefs.
              </li>
              <li>
                <strong className="text-slate-200">Google Sheets (<code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300">.../auth/spreadsheets</code>):</strong> Used to fetch status trackers and synchronize structured task checklists.
              </li>
              <li>
                <strong className="text-slate-200">Google Slides (<code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300">.../auth/presentations</code>):</strong> Used to export mission summaries and project quests into slides.
              </li>
            </ul>
            <p className="text-sm">
              Our use of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. Your Google data is <strong>never</strong> sold, shared with third-party advertisers, or used to train public machine learning models.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-indigo-400">3.</span> Information We Collect
            </h2>
            <p>
              We collect information that you directly provide to us, including:
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-[#161b22] border border-[#21262d] p-4 rounded-2xl flex gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl h-fit">
                  <Eye className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200 text-sm">Account Information</h3>
                  <p className="text-xs text-slate-400 mt-1">Your name, email address, and profile picture retrieved via Google Sign-In to personalize your dashboard.</p>
                </div>
              </div>
              <div className="bg-[#161b22] border border-[#21262d] p-4 rounded-2xl flex gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl h-fit">
                  <Server className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200 text-sm">Task & Project Data</h3>
                  <p className="text-xs text-slate-400 mt-1">Tasks, descriptions, priority scores, and risk parameters created within TaskPilot AI.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-indigo-400">4.</span> Data Security & Storage
            </h2>
            <div className="flex gap-4 bg-[#161b22] border border-[#21262d] p-5 rounded-2xl">
              <Lock className="h-6 w-6 text-emerald-400 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-200">Industry-Standard Encryption</p>
                <p className="text-sm text-slate-400">
                  All communications between your browser and our servers are encrypted using Secure Socket Layer (SSL/TLS) technology. User credentials and OAuth tokens are stored securely in Firestore using isolated permissions rules and environment-level secrets to guarantee safety.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-indigo-400">5.</span> Data Sharing & Retention
            </h2>
            <p>
              We do not share, sell, rent, or trade your personal information or Google API data with third parties for their promotional purposes. Your data is stored for as long as your account remains active. You can request complete deletion of your account and associated tokens at any time by contacting us.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-[#f0f6fc] flex items-center gap-2">
              <span className="text-indigo-400">6.</span> Contact Us
            </h2>
            <p>
              If you have any questions or concerns about this Privacy Policy, please feel free to reach out to our team at:
            </p>
            <div className="bg-slate-900/60 border border-[#21262d] px-5 py-4 rounded-2xl w-fit font-mono text-sm text-indigo-300">
              taskpilot.ai.support@gmail.com
            </div>
          </section>
        </div>

        <div className="border-t border-[#21262d] mt-12 pt-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 TaskPilot AI. All rights reserved.</p>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-indigo-400 transition-colors">Terms of Service</Link>
            <Link to="/" className="hover:text-indigo-400 transition-colors">Back to Homepage</Link>
          </div>
        </div>
      </div>
    </div>
  );
}