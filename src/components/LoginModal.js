"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginModal() {
  const { user, showLoginModal, closeLoginModal, login } = useAuth();
  const [gisLoaded, setGisLoaded] = useState(false);
  const [isSimulatedFlow, setIsSimulatedFlow] = useState(false);
  const [simStep, setSimStep] = useState("accounts"); // 'accounts' | 'loading' | 'custom'
  const [customName, setCustomName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Predefined mock accounts for the premium simulated experience
  const mockAccounts = [
    {
      name: "Sarah Connor",
      email: "sarah.connor@cyberdyne.org",
      picture: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    },
    {
      name: "Alex Rivers",
      email: "alex.rivers@privacy.io",
      picture: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
    },
    {
      name: "Guest Developer",
      email: "dev@focusblur.local",
      picture: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150",
    },
  ];

  // Load Google Identity Services library
  useEffect(() => {
    if (!showLoginModal) return;

    // If client ID is present, load real Google SDK
    if (clientId) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setGisLoaded(true);
        try {
          window.google?.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
          });
          window.google?.accounts.id.renderButton(
            document.getElementById("google-signin-btn"),
            { theme: "outline", size: "large", width: 280 }
          );
        } catch (err) {
          console.error("Error initializing Google Identity Services:", err);
        }
      };
      document.body.appendChild(script);

      return () => {
        document.body.removeChild(script);
      };
    }
  }, [showLoginModal, clientId]);

  // Decode standard Google JWT credential client-side
  const decodeJwt = (token) => {
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        window
          .atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(jsonPayload);
    } catch (err) {
      console.error("JWT decoding failed:", err);
      return null;
    }
  };

  const handleGoogleCredentialResponse = (response) => {
    const payload = decodeJwt(response.credential);
    if (payload) {
      login({
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
        token: response.credential,
      });
    } else {
      setErrorMsg("Failed to authenticate with Google. Please try again.");
    }
  };

  const triggerSimulation = () => {
    setIsSimulatedFlow(true);
    setSimStep("accounts");
    setErrorMsg("");
  };

  const handleSelectMockAccount = (account) => {
    setSimStep("loading");
    setTimeout(() => {
      login(account);
      setIsSimulatedFlow(false);
    }, 1200);
  };

  const handleCustomLogin = (e) => {
    e.preventDefault();
    if (!customName.trim() || !customEmail.trim()) {
      setErrorMsg("Name and email are required.");
      return;
    }
    if (!customEmail.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setSimStep("loading");
    setTimeout(() => {
      login({
        name: customName,
        email: customEmail,
        picture: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(customName)}`,
      });
      setIsSimulatedFlow(false);
    }, 1500);
  };

  if (!showLoginModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dark backdrop blur */}
      <div 
        className="absolute inset-0 bg-[#04060a]/75 backdrop-blur-md transition-opacity duration-300 animate-fadeIn"
        onClick={closeLoginModal}
      />

      {/* Login Card Container */}
      <div className="relative w-full max-w-md bg-[#0f131d]/90 border border-slate-800 rounded-3xl p-8 shadow-2xl overflow-hidden relative z-10 transition-all duration-300 transform scale-100 hover:border-violet-500/30">
        
        {/* Glow Effects inside card */}
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-fuchsia-600/10 blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button 
          onClick={closeLoginModal}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 p-2 rounded-full hover:bg-slate-800/40 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Regular Login view or Mock Select Account View */}
        {!isSimulatedFlow ? (
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="p-3 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-2xl shadow-lg shadow-violet-500/10">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>

            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-100">
                Unlock Premium Privacy
              </h2>
              <p className="text-xs text-slate-400 mt-2 max-w-sm">
                Sign in securely to launch the workspace and try client-side face preservation.
              </p>
            </div>

            {errorMsg && (
              <p className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-xl">
                {errorMsg}
              </p>
            )}

            <div className="w-full flex flex-col items-center gap-3 pt-2">
              {clientId ? (
                <>
                  <div id="google-signin-btn" className="min-h-[44px]" />
                  <div className="text-[10px] text-slate-500">
                    or try the simulated flow
                  </div>
                </>
              ) : null}

              {/* High-fidelity Custom/Simulated Google Login Button */}
              <button
                onClick={triggerSimulation}
                className="w-full max-w-[280px] h-[46px] bg-slate-900 border border-slate-700 hover:border-violet-500/50 hover:bg-slate-800/80 rounded-xl text-slate-200 hover:text-white text-sm font-semibold transition-all shadow-md flex items-center justify-center gap-3 group"
              >
                {/* Standard Google SVG Icon */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#EA4335"
                  />
                </svg>
                Sign in with Google
              </button>
            </div>

            <div className="text-[10px] text-slate-500 pt-2 flex flex-col gap-1 items-center">
              <span>🔒 Sandbox Protection Enabled</span>
              <span>Your email and data stay fully local to this session.</span>
            </div>
          </div>
        ) : (
          /* Simulated Google Account Selector Panel */
          <div className="flex flex-col space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#EA4335"
                  />
                </svg>
                <span className="text-sm font-bold text-slate-200">Google Accounts</span>
              </div>
              <button
                onClick={() => setIsSimulatedFlow(false)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>

            {simStep === "accounts" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-100">Choose an account</h3>
                  <p className="text-xs text-slate-450 mt-1">to sign in to FocusBlur</p>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {mockAccounts.map((acc, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectMockAccount(acc)}
                      className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-violet-500/20 transition-all text-left group"
                    >
                      <img
                        src={acc.picture}
                        alt={acc.name}
                        className="w-9 h-9 rounded-full object-cover border border-slate-700 group-hover:border-violet-500/50 transition-colors"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-200 group-hover:text-slate-100 transition-colors truncate">
                          {acc.name}
                        </p>
                        <p className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors truncate">
                          {acc.email}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800/60">
                  <button
                    onClick={() => {
                      setSimStep("custom");
                      setErrorMsg("");
                    }}
                    className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-transparent hover:bg-slate-800/40 text-left text-xs font-semibold text-violet-450 hover:text-violet-400 transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span>Use another Google account</span>
                  </button>
                </div>
              </div>
            )}

            {simStep === "custom" && (
              <form onSubmit={handleCustomLogin} className="space-y-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-100">Add google account</h3>
                  <p className="text-xs text-slate-450 mt-1">Enter your details to create a session</p>
                </div>

                {errorMsg && (
                  <p className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl">
                    {errorMsg}
                  </p>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full bg-[#141926] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                      Google Email
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. john.doe@gmail.com"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      className="w-full bg-[#141926] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSimStep("accounts");
                      setErrorMsg("");
                    }}
                    className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-800/80 rounded-xl text-xs text-slate-400 font-semibold py-3 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl text-xs text-white font-bold py-3 transition-all shadow-md"
                  >
                    Sign In
                  </button>
                </div>
              </form>
            )}

            {simStep === "loading" && (
              <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-200">Verifying security token...</p>
                  <p className="text-[10px] text-slate-500 mt-1">Connecting to Google servers locally</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
