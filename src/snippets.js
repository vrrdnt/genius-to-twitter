import { fingerprint } from "./history.js";

const TERMINAL_PUNCTUATION = /[.!?…]["'’”)]*$/u;
const INLINE_STAGE_DIRECTION =
  /\([^)]*\b(?:ad[ -]?libs?|ad[ -]?libbed|background|chant(?:ed|ing|s)?|echo(?:ed|es|ing)?|instrumental|laugh(?:ed|ing|s)?|repeat(?:ed|ing|s)?|sample(?:d|s)?|several times|spoken|x\s*\d+)\b[^)]*\)/giu;
const EMBEDDED_SECTION_HEADER =
  /(\[(?:breakdown|bridge|chorus|hook|instrumental|interlude|intro|outro|part|post-chorus|pre-chorus|prelude|refrain|skit|verse)\b[^\]\n]*\])/giu;
const UNRESOLVED_TRANSCRIPTION = /\[(?:\?|inaudible|unclear)\]/iu;
const SENTENCE_SEGMENTER = new Intl.Segmenter("en", { granularity: "sentence" });
const PERFORMER_ROLE_WORDS = new Set([
  "additional",
  "and",
  "both",
  "feat",
  "featuring",
  "ft",
  "rap",
  "rapping",
  "singing",
  "spoken",
  "vocals",
  "voice",
  "with",
  "x",
]);
const CONTINUATION_WORDS = new Set([
  "and",
  "as",
  "because",
  "but",
  "cause",
  "cos",
  "for",
  "if",
  "nor",
  "or",
  "so",
  "than",
  "that",
  "then",
  "though",
  "to",
  "until",
  "when",
  "while",
  "with",
  "yet",
]);

function parseHeader(header) {
  const colon = header.indexOf(":");
  const type = (colon === -1 ? header : header.slice(0, colon)).trim().toLowerCase();
  const performer = colon === -1 ? "" : header.slice(colon + 1).trim();
  return { header, type, performer };
}

function isMetadataLine(line) {
  const normalized = line.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    /^\d+\s*contributors?/u.test(normalized) ||
    /^(you might also like|contributors?|translations?)$/u.test(normalized) ||
    /^\d*embed$/u.test(normalized)
  );
}

function cleanLyricLine(sourceLine) {
  return sourceLine
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\d*Embed$/iu, "")
    .replace(INLINE_STAGE_DIRECTION, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

export function parseLyrics(lyrics) {
  const stanzas = [];
  let section = parseHeader("Unknown");
  let lines = [];
  const normalizedLyrics = lyrics
    .normalize("NFKC")
    .replace(/\r/g, "")
    .replace(EMBEDDED_SECTION_HEADER, "\n$1\n");

  const flush = () => {
    if (lines.length > 0) stanzas.push({ section, lines });
    lines = [];
  };

  for (const sourceLine of normalizedLyrics.split("\n")) {
    const line = cleanLyricLine(sourceLine);
    const header = line.match(/^\[([^\]]+)\]$/u);
    if (header) {
      flush();
      section = parseHeader(header[1]);
    } else if (!line) {
      flush();
    } else if (!isMetadataLine(line)) {
      lines.push(line);
    }
  }
  flush();
  return stanzas;
}

function normalizeName(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function decapitalizeOpening(line, artistNames) {
  const opening = line.match(/^([^\p{L}]*)([\p{L}][\p{L}\p{M}'’.-]*)/u);
  if (!opening) return line;

  const [, prefix, word] = opening;
  const letters = [...word].filter((character) => /\p{L}/u.test(character));
  const firstLetter = letters[0];
  if (!firstLetter || firstLetter === firstLetter.toLocaleLowerCase()) return line;

  const isFirstPerson = /^I(?:['’](?:d|ll|m|ve))?$/u.test(word);
  const isAllCaps =
    letters.length > 1 &&
    letters.every((character) => character === character.toLocaleUpperCase());
  const hasInternalCapital = letters
    .slice(1)
    .some((character) => character !== character.toLocaleLowerCase());
  const normalizedWord = normalizeName(word);
  const matchesArtistName = artistNames.some((name) =>
    normalizeName(name).split(" ").includes(normalizedWord),
  );

  const remainder = line.slice(opening[0].length);
  const nextWord = remainder.match(/^\s+([\p{L}][\p{L}\p{M}'’.-]*)/u)?.[1];
  const nextStartsWithCapital =
    nextWord &&
    nextWord !== "I" &&
    nextWord[0] !== nextWord[0].toLocaleLowerCase();

  if (
    isFirstPerson ||
    isAllCaps ||
    hasInternalCapital ||
    matchesArtistName ||
    nextStartsWithCapital
  ) {
    return line;
  }

  const decapitalized = `${word[0].toLocaleLowerCase()}${word.slice(1)}`;
  return `${prefix}${decapitalized}${remainder}`;
}

function decapitalizeSentences(line, artistNames) {
  return [...SENTENCE_SEGMENTER.segment(line)]
    .map(({ segment }) => decapitalizeOpening(segment, artistNames))
    .join("");
}

function includesWholeName(value, name) {
  return ` ${value} `.includes(` ${name} `);
}

function sectionBelongsOnlyToArtist(section, artistNames, featuredArtistNames) {
  if (artistNames.length === 0) return true;

  const allowedNames = artistNames.map(normalizeName).filter(Boolean);
  const guestNames = featuredArtistNames
    .map(normalizeName)
    .filter((name) => name && !allowedNames.includes(name));

  if (!section.performer) {
    const header = normalizeName(section.header);
    if (allowedNames.includes(header)) return true;
    if (guestNames.includes(header)) return false;
    return true;
  }

  const performer = normalizeName(section.performer);
  if (guestNames.some((name) => includesWholeName(performer, name))) return false;

  const matchingAllowedNames = allowedNames
    .filter((name) => includesWholeName(performer, name))
    .sort((a, b) => b.length - a.length);
  if (matchingAllowedNames.length === 0) return false;

  let remainder = ` ${performer} `;
  for (const name of matchingAllowedNames) {
    remainder = remainder.replaceAll(` ${name} `, " ");
  }
  const unexplainedWords = remainder
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .filter((word) => !PERFORMER_ROLE_WORDS.has(word));
  return unexplainedWords.length === 0;
}

function endsSentence(line) {
  return TERMINAL_PUNCTUATION.test(line.trim());
}

function startsAsContinuation(line) {
  const firstWord = normalizeName(line).split(" ")[0];
  return CONTINUATION_WORDS.has(firstWord);
}

function delimitersAreBalanced(text) {
  const pairs = [
    ["(", ")"],
    ["{", "}"],
  ];
  return pairs.every(
    ([open, close]) => text.split(open).length - 1 === text.split(close).length - 1,
  );
}

function sectionScore(type) {
  if (/chorus|refrain|hook/u.test(type)) return 3;
  if (/verse|bridge/u.test(type)) return 2;
  if (/intro|outro/u.test(type)) return 1;
  if (/instrumental|skit/u.test(type)) return -10;
  return 0;
}

function normalizedWords(lines) {
  return normalizeName(lines.join(" ")).split(" ").filter(Boolean);
}

export function calculateRepetitionPenalty(lines) {
  const normalizedLines = lines.map(normalizeName).filter(Boolean);
  const words = normalizedWords(lines);
  if (words.length === 0) return 0;

  let penalty = 0;
  const duplicateLines = normalizedLines.length - new Set(normalizedLines).size;
  penalty += duplicateLines * 4;

  if (words.length >= 6) {
    const diversity = new Set(words).size / words.length;
    if (diversity < 0.45) penalty += 6;
    else if (diversity < 0.6) penalty += 4;
    else if (diversity < 0.72) penalty += 2;

    const wordCounts = new Map();
    for (const word of words) wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    const dominantShare = Math.max(...wordCounts.values()) / words.length;
    if (dominantShare >= 0.35) penalty += 3;

    const bigrams = [];
    for (let index = 0; index < words.length - 1; index += 1) {
      bigrams.push(`${words[index]} ${words[index + 1]}`);
    }
    const repeatedBigrams = bigrams.length - new Set(bigrams).size;
    penalty += Math.min(repeatedBigrams * 2, 4);
  }

  return Math.min(penalty, 12);
}

function scoreWindow(lines, stanza, start, end) {
  const atStart = start === 0;
  const atEnd = end === stanza.lines.length;
  let score = sectionScore(stanza.section.type);
  if (atStart) score += 3;
  if (atEnd) score += 3;
  if (!atStart && endsSentence(stanza.lines[start - 1])) score += 2;
  if (endsSentence(lines.at(-1))) score += 4;
  if (!atStart && startsAsContinuation(lines[0])) score -= 3;
  if (lines.length >= 3) score += 1;
  if (lines.every((line) => normalizeName(line).split(" ").length >= 2)) score += 1;
  if (!delimitersAreBalanced(lines.join("\n"))) score -= 4;
  const repetitionPenalty = calculateRepetitionPenalty(lines);
  score -= repetitionPenalty;
  return { score, repetitionPenalty };
}

export function buildCandidates({
  lyrics,
  song,
  artistNames = [],
  minLines = 2,
  maxLines = 4,
  minCharacters = 35,
  maxPostLength = 280,
  excludedTerms = [],
}) {
  const candidates = [];
  const seen = new Set();
  const featuredArtistNames = (song.featuredArtists ?? []).map(
    (artist) => artist.name,
  );

  for (const stanza of parseLyrics(lyrics)) {
    if (/instrumental|skit/u.test(stanza.section.type)) continue;
    if (
      !sectionBelongsOnlyToArtist(
        stanza.section,
        artistNames,
        featuredArtistNames,
      )
    ) {
      continue;
    }

    for (let start = 0; start < stanza.lines.length; start += 1) {
      for (let length = minLines; length <= maxLines; length += 1) {
        const end = start + length;
        if (end > stanza.lines.length) break;
        const lines = stanza.lines.slice(start, end);
        const snippet = lines.join("\n");
        const lowered = snippet.toLowerCase();
        if (snippet.length < minCharacters) continue;
        if (UNRESOLVED_TRANSCRIPTION.test(snippet)) continue;
        if (excludedTerms.some((term) => lowered.includes(term))) continue;

        const formattedLines = lines.map((line) =>
          decapitalizeSentences(line, artistNames),
        );
        const text = formattedLines.join("\n");
        if (text.length > maxPostLength) continue;
        const id = fingerprint(text);
        if (seen.has(id)) continue;
        seen.add(id);

        const scoring = scoreWindow(lines, stanza, start, end);
        candidates.push({
          fingerprint: id,
          lines: formattedLines,
          text,
          score: scoring.score,
          repetitionPenalty: scoring.repetitionPenalty,
          section: stanza.section.header,
          song,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score || a.text.length - b.text.length);
}

export function chooseCandidate(candidates, recent = new Set(), random = Math.random) {
  const eligible = candidates.filter((candidate) => !recent.has(candidate.fingerprint));
  if (eligible.length === 0) return null;

  const bestScore = eligible[0].score;
  const pool = eligible.filter((candidate) => candidate.score >= bestScore - 2).slice(0, 20);
  const minimumScore = Math.min(...pool.map((candidate) => candidate.score));
  const weights = pool.map((candidate) => candidate.score - minimumScore + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;

  for (let index = 0; index < pool.length; index += 1) {
    target -= weights[index];
    if (target < 0) return pool[index];
  }
  return pool.at(-1);
}
