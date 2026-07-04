// Tapbacks and other non-substance iMessage lines — skip at sync and mirror backend filter.

/** macOS Messages reaction/tapback text (English + localized French). */
export function isTapbackOrReactionMessage(text: string | null | undefined): boolean {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return false;
  if (/^(reacted|loved|liked|disliked|emphasized|questioned|laughed at|removed|edited|unsent)\b/i.test(s)) {
    return true;
  }
  if (/^(reacted|loved|liked|disliked|emphasized)\s+[\p{Emoji}\u200d]+/iu.test(s)) return true;
  if (/^a (aimé|réagi|ajouté|retiré|modifié|annulé|supprimé)\b/i.test(s)) return true;
  if (/^a ajouté des points d[''’]?exclamation à/i.test(s)) return true;
  if (/^a ajouté un point d[''’]?interrogation à/i.test(s)) return true;
  if (/^(reacted|loved|liked|emphasized|a aimé|a réagi|a ajouté).+[«"""].+[»"""]$/iu.test(s)) return true;
  return false;
}

export function isLowSignalMessage(text: string | null | undefined): boolean {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return true;
  if (isTapbackOrReactionMessage(s)) return true;
  if (s.length < 16) return true;
  if (/^attached (an? )?(image|photo|video|audio|file)/i.test(s)) return true;
  if (/^https?:\/\//i.test(s) && s.split(/\s+/).length < 4) return true;
  if (/^(ok|okay|k|lol|lmao|yep|yeah|yes|no|nvm|thanks|thank you|ty|gm|gn|good night|good morning)\.?$/i.test(s)) {
    return true;
  }
  return false;
}
