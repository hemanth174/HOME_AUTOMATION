'use client';

// Standardized voice utility to ensure all pages use the exact same voice
let selectedVoice = null;

// Initialize and pick the standard voice
const initVoice = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Prefer high-quality standard English female voices for consistency
  const preferredNames = [
    'Google UK English Female',
    'Google US English',
    'Microsoft Zira',
    'Samantha'
  ];

  for (const name of preferredNames) {
    const match = voices.find(v => v.name.includes(name));
    if (match) {
      selectedVoice = match;
      return selectedVoice;
    }
  }

  // Fallback to the first English voice
  const englishVoice = voices.find(v => v.lang.startsWith('en'));
  if (englishVoice) {
    selectedVoice = englishVoice;
    return selectedVoice;
  }

  // Final fallback to the very first voice available
  selectedVoice = voices[0];
  return selectedVoice;
};

// Listen for voices to load if not already loaded (Chrome bug)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    initVoice();
  };
}

export const speak = (text) => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    if (!selectedVoice) {
      initVoice();
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // Tweak rate and pitch for a premium feel
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      resolve();
    };

    utterance.onerror = () => {
      resolve();
    };

    window.speechSynthesis.speak(utterance);
  });
};

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};
