import { startServer } from './server.mjs';

import { derefPath } from './state.mjs';

// 
// load the card data
//
import { readFile } from 'fs/promises';

const cards_json = JSON.parse(await readFile('./cards.json', 'utf8'));
const cards = cards_json.reduce((m, c) => (m[c._['@id']] = c, m), {});

function toDeck(cards, comm, side) {
  // pick non-optional cards by committment level and side
  return Object
    .values(cards)
    .filter(c => c.front.deck === comm &&
                 c.front.side === side &&
                 !c.front.optional);
}

export function id(name) {
  return `:${name}`;
}

export function moveCard(id, src, dst) {
  // find card in src
  const i = src.findIndex(c => c._['@id'] === id);
  if (i < 0) {
    throw new Error(`${id} not found in src`);
  }

  // remove card from src
  const c = src[i];
  src.splice(i, 1);

  // add card to dst
  dst.push(c);
}

export function shuffle(a) {
  // Durstenfeld shuffle
  for (let i = a.length - 1; i > 0; --i) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

export function drawCards(g, p) {
  // draw up to 7
  while (g.hand[p].length < 7 && g.draw[p].length > 0) {
    // draw from draw pile to hand
    g.hand[p].push(g.draw[p].pop());
    g.hand[p][g.hand[p].length - 1]._.front = [p];
  }

  if (g.hand[p].length < 7) {
    // draw pile exhausted, add discards to draw pile
    g.draw[p] = g.discard[p];
    g.discard[p] = [];

    shuffle(g.draw[p]);
  }
  
  while (g.hand[p].length < 7 && g.draw[p].length > 0) {
    // draw from draw pile to hand
    g.hand[p].push(g.draw[p].pop());
    g.hand[p][g.hand[p].length - 1]._.front = [p];
  }
}

// Comittment
export const MOBILIZATION = 0;
export const LIMITED_WAR = 1;
export const TOTAL_WAR = 2;

export const AP = id('ap');
export const CP = id('cp');

// set up the initial (pre-dealing) state
export const g0 = {
  'deck': {
    'mobilization': {
      [AP]: toDeck(cards, MOBILIZATION, 'AP'),
      [CP]: toDeck(cards, MOBILIZATION, 'CP')
    },
    'limited war': {
      [AP]: toDeck(cards, LIMITED_WAR, 'AP'),
      [CP]: toDeck(cards, LIMITED_WAR, 'CP')
    },
    'total war': {
      [AP]: toDeck(cards, TOTAL_WAR, 'AP'),
      [CP]: toDeck(cards, TOTAL_WAR, 'CP')
    }
  },
  'draw': {
    [AP]: [],
    [CP]: []
  },
  'discard': {
    [AP]: [],
    [CP]: []
  },
  'removed': {
    [AP]: [],
    [CP]: []
  },
  'hand': {
    [AP]: [],
    [CP]: []
  },
  'combat': {
    [AP]: [],
    [CP]: []
  }
};

let max_id = 0;

// GoA start
moveCard(id('CP1'), g0.deck.mobilization[CP], g0.hand[CP]);
g0.hand[CP][0]._.front = [CP];

// set up the draw piles and draw initial hands
for (const p of [AP, CP]) {
  [g0.draw[p], g0.deck.mobilization[p]] = [g0.deck.mobilization[p], g0.draw[p]];
  for (const c of g0.draw[p]) {
    c._.front = [];
  }

  shuffle(g0.draw[p]);
  drawCards(g0, p);
}

import { isObject } from './util.mjs';

export function* idGen(o) {
  if (isObject(o)) {
    if (o?._?.['@id'] !== undefined) {
      yield o._['@id'];
    }

    for (const k of Object.keys(o)) {
      yield* idGen(o[k]);
    }
  }
}

export function shuffleIds(itr, targets, idmap) {
  shuffle(targets);
  let j = 0;
  for (let i of itr) {
    idmap[i] = targets[j++];
  }
}

export function* pathWalk(o, path) {
  yield [o, [...path]];
  if (isObject(o)) {
    for (const k of Object.keys(o)) {
      yield* pathWalk(o[k], [...path, k]); 
    }
  }
}

export function* idWalk(o, path) {
  if (isObject(o)) {
    if (o?._?.['@id'] !== undefined) { 
      yield [o._['@id'], [...path]];
    }

    for (const k of Object.keys(o)) {
      yield* idWalk(o[k], [...path, k]); 
    }
  }
}

// put the player ids into the id maps
const g2ap = { [AP]: AP, [CP]: CP };
const g2cp = { [AP]: AP, [CP]: CP };

// prepare an array of the right length for shuffling the view card ids
const sh = [...idGen(g0)].map((_, i) => id(i+1));

shuffleIds(idGen(g0), sh, g2ap);
shuffleIds(idGen(g0), sh, g2cp);

const idmap = Object.fromEntries(idWalk(g0, []));

const g = {
  's': g0,
  'o': idmap,
  'g2v': {
    [AP]: g2ap,
    [CP]: g2cp
  },
  'v2g': {
    [AP]: Object.fromEntries(Object.entries(g2ap).map(([k, v]) => [v, k])),
    [CP]: Object.fromEntries(Object.entries(g2cp).map(([k, v]) => [v, k]))
  },
  'u2p': {
    'uckelman': ':cp'
  },
  'actions': {
    'draw': (s, dst_p, src_p, pid) => {
      const card = derefPath(s, src_p).pop();
      card._.front.push(pid);
      derefPath(s, dst_p).push(card);
    },
    'play': (s, dst_p, src_p, pid) => {
      const deck = derefPath(s, src_p.slice(0, -1));
      const [card] = deck.splice(src_p[-1], 1);
      delete card._.front;
      derefPath(s, dst_p).push(card);
    },
    'shuffle': (s, deck_p) => {
      const deck = derefPath(s, deck_p);
      deck.for_each(card => card._.front = []);
      shuffle(deck);
    }
  }
};

startServer(g);
