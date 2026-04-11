const FALLBACK_NAMES = [
  "NovaFox27",
  "PixelDash41",
  "EchoFlare58",
  "JadeStride19",
  "BlazeQuest64",
  "ShadowPulse33",
  "CipherSpark72",
  "CometViper25",
];

export const getRandomFallbackOpponentName = () =>
  FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
