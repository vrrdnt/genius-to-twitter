import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCandidates,
  calculateRepetitionPenalty,
  chooseCandidate,
  parseLyrics,
} from "../src/snippets.js";

const song = {
  id: 42,
  title: "A Small Song",
  fullTitle: "A Small Song by Example Artist",
  artist: { id: 7, name: "Example Artist" },
};

test("parseLyrics preserves stanza and section boundaries while removing metadata", () => {
  const stanzas = parseLyrics(`[Verse 1: Example Artist]
First line
Second line.

You might also like
[Chorus]
Third line
Fourth line!
12Embed`);

  assert.deepEqual(
    stanzas.map(({ section, lines }) => ({ section: section.header, lines })),
    [
      { section: "Verse 1: Example Artist", lines: ["First line", "Second line."] },
      { section: "Chorus", lines: ["Third line", "Fourth line!"] },
    ],
  );
});

test("parseLyrics removes performance directions but preserves meaningful parentheticals", () => {
  const stanzas = parseLyrics(`[Hook]
People keep coloring (ad-libbed several times)
The answer comes back (if you listen).

[Outro]
(Laughing)
Only the final line remains.`);

  assert.deepEqual(stanzas[0].lines, [
    "People keep coloring",
    "The answer comes back (if you listen).",
  ]);
  assert.deepEqual(stanzas[1].lines, ["Only the final line remains."]);
});

test("parseLyrics separates section headers collapsed into Genius page metadata", () => {
  const stanzas = parseLyrics(
    "19 ContributorsSong LyricsA page description.[verse 1]\nFirst lyric line\nSecond lyric line.",
  );

  assert.deepEqual(
    stanzas.map(({ section, lines }) => ({ section: section.header, lines })),
    [
      {
        section: "verse 1",
        lines: ["First lyric line", "Second lyric line."],
      },
    ],
  );
});

test("candidate generation keeps configured artist sections and excludes featured-only sections", () => {
  const lyrics = `[Verse 1: Guest Artist]
These lines belong to somebody else
They should never become our post.

[Verse 2: Rory]
I drew a map around the quiet
Then found a road that led me home.`;
  const candidates = buildCandidates({
    lyrics,
    song,
    artistNames: ["Example Artist", "Rory"],
    minLines: 2,
    maxLines: 2,
  });

  assert.equal(candidates.length, 1);
  assert.match(candidates[0].text, /I drew a map/);
  assert.doesNotMatch(candidates[0].text, /somebody else/);
});

test("shared sections are rejected while unlabeled collaboration sections remain eligible", () => {
  const collaboration = {
    ...song,
    featuredArtists: [{ id: 8, name: "Guest Artist" }],
  };
  const lyrics = `[Verse]
These unlabeled lines could be either performer
They are allowed when Genius does not identify a singer.

[Verse 1: Example Artist & Guest Artist]
These lines are explicitly shared
They should not become a post either.

[Verse 2: Example Artist]
I drew a map around the quiet
Then found a road that led me home.`;
  const candidates = buildCandidates({
    lyrics,
    song: collaboration,
    artistNames: ["Example Artist"],
    minLines: 2,
    maxLines: 2,
  });

  assert.ok(candidates.length > 0);
  assert.deepEqual(
    new Set(candidates.map((candidate) => candidate.section)),
    new Set(["Verse", "Verse 2: Example Artist"]),
  );
  assert.ok(
    candidates.every(
      (candidate) => candidate.section !== "Verse 1: Example Artist & Guest Artist",
    ),
  );
});

test("performer-only headers and configured alter egos remain eligible", () => {
  const collaboration = {
    ...song,
    featuredArtists: [{ id: 9, name: "Alternate Persona" }],
  };
  const candidates = buildCandidates({
    lyrics: `[Example Artist]
The first identity opens the doorway
Then carries the thought to its end.

[Alternate Persona]
The second identity follows the map
And reaches the same destination.`,
    song: collaboration,
    artistNames: ["Example Artist", "Alternate Persona"],
    minLines: 2,
    maxLines: 2,
  });

  assert.deepEqual(
    new Set(candidates.map((candidate) => candidate.section)),
    new Set(["Example Artist", "Alternate Persona"]),
  );
});

test("complete stanza windows outrank fragments and stay within the limit", () => {
  const lyrics = `[Verse]
And this begins halfway through a thought
with words that keep on running
I found the end and named it home.

[Chorus]
The morning put its coat on
The city answered back.`;
  const candidates = buildCandidates({
    lyrics,
    song,
    artistNames: ["Example Artist"],
    minLines: 2,
    maxLines: 3,
    maxPostLength: 120,
  });

  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].lines[0], "the morning put its coat on");
  assert.equal(candidates[0].lines.at(-1), "the city answered back.");
  assert.doesNotMatch(candidates[0].text, /A Small Song/u);
  assert.ok(candidates.every((candidate) => candidate.text.length <= 120));
});

test("candidate text contains only lyrics", () => {
  const candidate = buildCandidates({
    lyrics: "[Verse]\nThe morning put its coat on\nThe city answered back.",
    song,
    artistNames: ["Example Artist"],
    minLines: 2,
    maxLines: 2,
  })[0];

  assert.equal(
    candidate.text,
    "the morning put its coat on\nthe city answered back.",
  );
  assert.doesNotMatch(candidate.text, /A Small Song|Example Artist/u);
});

test("candidate selection avoids recent fingerprints and uses only the top score band", () => {
  const candidates = [
    { fingerprint: "recent", score: 10, text: "recent" },
    { fingerprint: "best", score: 9, text: "best" },
    { fingerprint: "near", score: 7, text: "near" },
    { fingerprint: "weak", score: 1, text: "weak" },
  ];
  const chosen = chooseCandidate(candidates, new Set(["recent"]), () => 0);
  assert.equal(chosen.fingerprint, "best");
  assert.equal(chooseCandidate(candidates, new Set(candidates.map((item) => item.fingerprint))), null);
});

test("repetitive hooks rank below coherent verse snippets", () => {
  const lyrics = `[Hook]
Yeah yeah yeah yeah
Yeah yeah yeah yeah.

[Verse]
I found a doorway in the static
Then walked through it into morning.`;
  const candidates = buildCandidates({
    lyrics,
    song,
    minLines: 2,
    maxLines: 2,
  });

  const hook = candidates.find((candidate) => candidate.section === "Hook");
  const verse = candidates.find((candidate) => candidate.section === "Verse");
  assert.ok(hook.repetitionPenalty >= 6);
  assert.equal(verse.repetitionPenalty, 0);
  assert.ok(verse.score > hook.score);
  assert.equal(candidates[0], verse);
});

test("repetition penalty detects duplicate lines and repeated phrases", () => {
  assert.equal(calculateRepetitionPenalty(["A varied opening", "A distinct ending"]), 0);
  assert.ok(calculateRepetitionPenalty(["Feel me now", "Feel me now"]) >= 6);
});

test("excluded terms are matched case-insensitively", () => {
  const candidates = buildCandidates({
    lyrics: "[Verse]\nA harmless opening line\nA FORBIDDEN closing line.",
    song,
    excludedTerms: ["forbidden"],
  });
  assert.deepEqual(candidates, []);
});

test("unresolved Genius transcription markers are rejected", () => {
  const candidates = buildCandidates({
    lyrics: "[Verse]\nA complete opening line\n[?] in the uncertain closing line.",
    song,
    minLines: 2,
    maxLines: 2,
  });
  assert.deepEqual(candidates, []);
});

test("lyric openings are decapitalized while likely proper nouns stay intact", () => {
  const candidates = buildCandidates({
    lyrics: `[Verse]
The morning put its coat on
"When the city answered back."
I kept listening
Mace Windu held the doorway
NASA watched NeoHooDoo leave.`,
    song,
    artistNames: ["Example Artist"],
    minLines: 5,
    maxLines: 5,
  });

  assert.deepEqual(candidates[0].lines, [
    "the morning put its coat on",
    '"when the city answered back."',
    "I kept listening",
    "Mace Windu held the doorway",
    "NASA watched NeoHooDoo leave.",
  ]);
  assert.doesNotMatch(candidates[0].text, /A Small Song|Example Artist/u);
});

test("later sentence openings on the same lyric line are also decapitalized", () => {
  const candidates = buildCandidates({
    lyrics: "[Verse]\nNASA watched the doorway. You walked through it.\nI stayed. Mace Windu left.",
    song,
    artistNames: ["Example Artist"],
    minLines: 2,
    maxLines: 2,
  });

  assert.deepEqual(candidates[0].lines, [
    "NASA watched the doorway. you walked through it.",
    "I stayed. Mace Windu left.",
  ]);
});
