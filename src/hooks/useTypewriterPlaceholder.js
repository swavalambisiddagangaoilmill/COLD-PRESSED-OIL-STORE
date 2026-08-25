import { useEffect, useState } from "react";

const SEARCH_TERMS = [
  "Groundnut Oil",
  "Coconut Oil",
  "White Sesame Oil",
  "Black Sesame Oil",
  "Mustard Oil",
  "Sunflower Oil",
  "Safflower Oil",
  "Flaxseed Oil",
  "Niger Seed Oil",
  "Badam Oil",
  "Castor Oil",
  "Neem Oil",
  "Caranja Oil",
  "Herbal Oil",
  "Cold Pressed Oil",
  "Cooking Oil",
  "Specialty Oil",
];

const STATIC_PLACEHOLDER = "Search oils";

export default function useTypewriterPlaceholder(inputValue) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [visibleLength, setVisibleLength] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (inputValue || reducedMotion) return undefined;
    const phrase = SEARCH_TERMS[phraseIndex];
    let delay = deleting ? 42 : 76;
    let nextStep;

    if (!deleting && visibleLength < phrase.length) {
      if (visibleLength === 0) delay = 320;
      nextStep = () => setVisibleLength((length) => length + 1);
    } else if (!deleting) {
      delay = 1350;
      nextStep = () => setDeleting(true);
    } else if (visibleLength > 0) {
      nextStep = () => setVisibleLength((length) => length - 1);
    } else {
      delay = 260;
      nextStep = () => {
        setDeleting(false);
        setPhraseIndex((index) => (index + 1) % SEARCH_TERMS.length);
      };
    }

    const timer = window.setTimeout(nextStep, delay);
    return () => window.clearTimeout(timer);
  }, [deleting, inputValue, phraseIndex, reducedMotion, visibleLength]);

  if (inputValue || reducedMotion) return STATIC_PLACEHOLDER;
  return SEARCH_TERMS[phraseIndex].slice(0, visibleLength) || STATIC_PLACEHOLDER;
}
