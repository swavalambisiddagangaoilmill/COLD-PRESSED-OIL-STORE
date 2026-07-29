// Floating AI chat widget for storefront guidance.
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Mic, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePopup } from "../../../context/PopupContext.jsx";
import { useServiceStatus } from "../../../hooks/useServiceStatus.js";
import { askAssistant } from "../../../services/aiService.js";

const responseMap = {
  "Best cooking oil": {
    text: "For everyday cooking, groundnut oil is a versatile choice because it has a warm nutty aroma and works well for Indian recipes.",
    followUps: ["Compare oils", "Storage tips", "Cold pressed vs refined"],
  },
  "Oils for children": {
    text: "For children, use familiar cooking oils in moderation and follow your pediatrician's advice for allergies or dietary needs.",
    followUps: ["Best cooking oil", "Storage tips"],
  },
  "Cold pressed vs refined": {
    text: "Cold pressed oils are extracted slowly with less heat, while refined oils are usually processed further for neutral flavor and longer shelf stability.",
    followUps: ["Compare oils", "Best cooking oil"],
  },
  "Storage tips": {
    text: "Store cooking oils tightly closed in a cool pantry, away from direct sunlight, heat, and moisture.",
    followUps: ["Best cooking oil", "Cold pressed vs refined"],
  },
  "Compare oils": {
    text: "Groundnut is robust for daily cooking, sesame is aromatic for tempering, mustard is sharp, and coconut is useful for traditional recipes and rituals.",
    followUps: ["Best cooking oil", "Storage tips"],
  },
};

const defaultReplies = ["Best cooking oil", "Oils for children", "Cold pressed vs refined", "Storage tips", "Compare oils"];

export default function ChatWidget() {
  const { activePopup, closePopups, togglePopup } = usePopup();
  const open = activePopup === "chat";
  const serviceStatus = useServiceStatus();
  const aiService = serviceStatus.services?.ai;
  const aiAvailable = aiService?.available !== false;
  const aiUnavailableMessage = aiService?.message || "AI assistant is temporarily unavailable.";
  const [input, setInput] = useState("");
  const panelRef = useRef(null);
  const messagesRef = useRef(null);
  const audioContextRef = useRef(null);
  const forceScrollRef = useRef(false);
  const nearBottomRef = useRef(true);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Namaste. Choose a quick reply or ask a question about oils." },
  ]);
  const [quickReplies, setQuickReplies] = useState(defaultReplies);
  const [typing, setTyping] = useState(false);
  const [showNewMessages, setShowNewMessages] = useState(false);

  const scrollToBottom = () => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    nearBottomRef.current = true;
    setShowNewMessages(false);
  };

  const updateScrollState = () => {
    const container = messagesRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    nearBottomRef.current = distanceFromBottom < 70;
    if (nearBottomRef.current) setShowNewMessages(false);
  };

  const playReplySound = () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = audioContextRef.current || new AudioContext();
    audioContextRef.current = context;
    context.resume?.();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(760, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  };

  const ask = (text) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    forceScrollRef.current = true;
    setMessages((current) => [...current, { role: "user", text: cleanText }]);
    setInput("");
    if (!aiAvailable) {
      setMessages((current) => [...current, { role: "assistant", text: aiUnavailableMessage }]);
      setQuickReplies(defaultReplies);
      return;
    }
    setTyping(true);
    window.setTimeout(async () => {
      const fallback = responseMap[cleanText] || {
        text: "AI assistance is currently unavailable for this question. Please contact our support team for personalized assistance.",
        followUps: ["Best cooking oil", "Storage tips", "Compare oils"],
      };
      const response = await askAssistant(cleanText).catch(() => fallback);
      setMessages((current) => [...current, { role: "assistant", text: response.text }]);
      setQuickReplies(response.followUps);
      setTyping(false);
      playReplySound();
    }, 650);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (event.target.closest("[data-popup-trigger]")) return;
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        closePopups();
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [closePopups, open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(scrollToBottom, 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (forceScrollRef.current || nearBottomRef.current) {
      forceScrollRef.current = false;
      window.setTimeout(scrollToBottom, 40);
      return;
    }
    setShowNewMessages(true);
  }, [messages, open, typing]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.aside
            ref={panelRef}
            data-popup-panel="chat"
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.97 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-[126] flex max-h-[min(82dvh,640px)] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-[1.5rem] border border-ink/10 bg-white shadow-soft sm:right-6"
            >
              <div className="flex items-start justify-between gap-4 bg-ink px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><Bot size={20} /></span>
                  <div>
                    <p className="font-serif text-2xl font-semibold leading-none">Swavalambi Siddaganga Oil Mill Assist</p>
                    <p className="mt-1 text-xs text-white/55">AI unavailable fallback enabled</p>
                  </div>
                </div>
                <button type="button" aria-label="Close chat" onClick={closePopups} className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
                  <X size={17} />
                </button>
              </div>

              <div className="relative h-[clamp(220px,45dvh,360px)] min-h-0">
                <div ref={messagesRef} onScroll={updateScrollState} className="h-full space-y-3 overflow-y-auto p-4">
                  {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-2xl p-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-ink text-white" : "bg-cream text-ink/75"}`}>
                      {message.text}
                    </div>
                  ))}
                  {typing && (
                    <div className="flex w-max gap-1 rounded-2xl bg-cream p-3">
                      {[0, 1, 2].map((item) => (
                        <span key={item} className="h-2 w-2 animate-pulse rounded-full bg-leaf" />
                      ))}
                    </div>
                  )}
                </div>
                {showNewMessages && (
                  <button type="button" onClick={scrollToBottom} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white shadow-soft transition hover:bg-leaf">
                    New messages
                  </button>
                )}
              </div>

              <div className="border-t border-ink/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {quickReplies.map((reply) => (
                    <button key={reply} type="button" onClick={() => ask(reply)} className="shrink-0 rounded-full bg-linen px-4 py-2 text-xs font-bold text-ink/65 transition hover:text-leaf">
                      {reply}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" aria-label="Voice search" disabled={!aiAvailable} title={aiAvailable ? "" : aiUnavailableMessage} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-linen text-leaf disabled:cursor-not-allowed disabled:opacity-50">
                    <Mic size={17} />
                  </button>
                  <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") ask(input);
                    }}
                    disabled={!aiAvailable}
                    placeholder={aiAvailable ? "Ask about oils" : aiUnavailableMessage}
                    className="h-11 min-w-0 flex-1 rounded-full border border-ink/10 px-4 text-sm outline-none focus:border-leaf"
                  />
                  <button type="button" disabled={!aiAvailable} onClick={() => ask(input || "I need help choosing an oil")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white disabled:cursor-not-allowed disabled:opacity-50">
                    <Send size={16} />
                  </button>
                </div>
              </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <button type="button" data-popup-trigger="chat" disabled={!aiAvailable} title={aiAvailable ? "" : aiUnavailableMessage} onClick={() => togglePopup("chat")} className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] z-[130] grid h-14 w-14 place-items-center rounded-full bg-ink text-white shadow-soft transition hover:bg-leaf disabled:cursor-not-allowed disabled:opacity-60" aria-label="Open chat">
        <Bot size={22} />
      </button>
    </>
  );
}














