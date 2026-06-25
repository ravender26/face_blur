"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";

const WorkspaceContext = createContext();

export function WorkspaceProvider({ children }) {
  const [activeMode, setActiveMode] = useState("upload"); // 'upload' | 'camera'
  const [status, setStatus] = useState("idle"); // 'idle', 'loading-model', 'processing', 'encoding', 'done'
  const [loading, setLoading] = useState(false);
  const [registeringFace, setRegisteringFace] = useState(false);
  const [error, setError] = useState(null);
  const [consoleLogs, setConsoleLogs] = useState([]);

  const [excludeTarget, setExcludeTarget] = useState(false);
  const [targetDescriptor, setTargetDescriptor] = useState(null);

  const excludeTargetRef = useRef(excludeTarget);
  const targetDescriptorRef = useRef(targetDescriptor);

  // Sync refs with state values for requestAnimationFrame loop access
  useEffect(() => {
    excludeTargetRef.current = excludeTarget;
  }, [excludeTarget]);

  useEffect(() => {
    targetDescriptorRef.current = targetDescriptor;
  }, [targetDescriptor]);

  // Console logging interceptor hook
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleLog = (type, ...args) => {
      const msg = args
        .map((arg) => {
          if (arg instanceof Error) return arg.message + "\n" + arg.stack;
          return typeof arg === "object" ? JSON.stringify(arg) : String(arg);
        })
        .join(" ");
      setConsoleLogs((prev) => [...prev.slice(-40), `[${type}] ${msg}`]);
    };

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog(...args);
      handleLog("log", ...args);
    };
    console.warn = (...args) => {
      originalWarn(...args);
      handleLog("warn", ...args);
    };
    console.error = (...args) => {
      originalError(...args);
      handleLog("error", ...args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  const handleModeChange = (mode) => {
    if (mode === activeMode || registeringFace) return;
    setActiveMode(mode);
    setStatus("idle");
    setLoading(false);
    setError(null);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        activeMode,
        setActiveMode,
        handleModeChange,
        status,
        setStatus,
        loading,
        setLoading,
        registeringFace,
        setRegisteringFace,
        error,
        setError,
        consoleLogs,
        setConsoleLogs,
        excludeTarget,
        setExcludeTarget,
        targetDescriptor,
        setTargetDescriptor,
        excludeTargetRef,
        targetDescriptorRef,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
