// Story beats. Beats with an `x` fire when a player walks past that column
// (strictly in order, once each — the server enforces ordering in multiplayer).
// Beats without an `x` are played by the game directly (e.g. the ending).

export const CHARS = {
  details: { name: 'Details', color: '#FFF3E6' },
  cora: { name: 'Cora', color: '#FF4FA0' },
  baron: { name: 'Baron Marrow', color: '#FF5A36' },
  note: { name: 'A very small note', color: '#FFC145' }
};

export const STORY = [
  {
    id: 0, x: 6, who: 'details',
    lines: [
      "Tuesday. Six in the evening. Cora was proofreading the good armchair when the floor opened up and swallowed her whole.",
      "The house ate my partner. Honestly? On brand for this house."
    ]
  },
  {
    id: 1, x: 34, who: 'note',
    lines: [
      "Left on the rug, in handwriting the size of a grain of rice:",
      "\"She reads too closely. She notices things. We're keeping her.\" — The Management"
    ]
  },
  {
    id: 2, x: 64, who: 'cora',
    lines: [
      "Details? DETAILS. I can hear you clomping around up there.",
      "I'm fine. I'm in the basement. I've been re-alphabetising their entire filing system out of pure spite.",
      "Get down here before they finish whatever they're building."
    ]
  },
  {
    id: 3, x: 86, who: 'cora', stage: 1,
    lines: [
      "You're in the kitchen now — mind the Swappers, they blink right past you.",
      "They're funnelling every misplaced sock in the city down here. There's a boss. Baron Marrow.",
      "He's the size of a breadbin and roughly twice as smug."
    ]
  },
  {
    id: 4, x: 120, who: 'details',
    lines: [
      "On my way down. Collecting the socks as I go — feels rude to leave them.",
      "Try not to alphabetise anything load-bearing, Cora."
    ]
  },
  {
    id: 5, x: 156, who: 'cora', stage: 2,
    lines: [
      "Basement. Good. It's darker down here and everything hums.",
      "Last stretch. He's at the end, sitting on a throne he built out of stolen remote controls."
    ]
  },
  {
    id: 6, x: 200, who: 'cora',
    lines: [
      "He's right there. Hit him when he stops to gloat — and he always stops to gloat.",
      "When he's crowing, jump on his head. When he's moving, stay off him."
    ]
  },
  {
    id: 7, x: 210, who: 'baron', spawnBoss: true,
    lines: [
      "The famous Details. You noticed a great many things on the way down here.",
      "The loose thread. The switched labels. The sock, the sock, the sock.",
      "Notice. THIS."
    ]
  },

  // --- ending, played on the 'win' signal ---
  {
    id: 8, who: 'baron',
    lines: [
      "...I had that sock collection catalogued. Cross-referenced. By colour AND by owner.",
      "Fine. Take her. Take the socks. See if I ever swallow anyone through a floor again."
    ]
  },
  {
    id: 9, who: 'cora',
    lines: [
      "Took you long enough. Untie me — no. The LEFT knot. The other left, you noticing menace.",
      "There. Thank you. I had most of it handled, for the record."
    ]
  },
  {
    id: 10, who: 'details',
    lines: [
      "Found you.",
      "Cora: \"You found everything on the way here. I'm just the last item on the list.\"",
      "Let's go home. Watch the floor."
    ]
  }
];

export const ENDING_BEATS = [8, 9, 10];

export function beatById(id) {
  return STORY.find((b) => b.id === id);
}
