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

export const speak = async (text, lang = "en-US") => {

    if(lang === "te-IN"){

        return await sarvamSpeak(text);

    }

    return new Promise((resolve)=>{

        if(typeof window==="undefined" || !window.speechSynthesis){
            resolve();
            return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        utterance.lang = lang;

        const voices = window.speechSynthesis.getVoices();

        const targetPrefix = lang.split("-")[0].toLowerCase();

        let voice = voices.find(v =>
            v.lang.toLowerCase().startsWith(targetPrefix)
        );

        if(voice){
            utterance.voice = voice;
        }else{
            if(!selectedVoice){
                initVoice();
            }
            if(selectedVoice){
                utterance.voice = selectedVoice;
            }
        }

        utterance.rate = 1;
        utterance.pitch = 1;

        utterance.onend = ()=>resolve();
        utterance.onerror = ()=>resolve();

        window.speechSynthesis.speak(utterance);

    });

}

async function sarvamSpeak(text) {

    const response = await fetch("/api/sarvam/tts", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            text,
            language: "te-IN"
        })

    });

    if (!response.ok) {
        console.error("Sarvam TTS failed");
        return;
    }

    const data = await response.json();

    const audioBase64 = data.audios[0];

    const audio = new Audio(
        `data:audio/wav;base64,${audioBase64}`
    );

    await audio.play();

}
export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};
