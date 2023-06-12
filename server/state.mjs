import { enablePatches } from "immer";

enablePatches();

import { applyPatches, produce, produceWithPatches } from "immer";

import { dump_it, isObject } from './util.mjs';

export function strip(o, filter) {
  // remove objects which don't match the filter
  for (const k of Object.keys(o)) {
    if (filter(o, k)) {
      if (isObject(o[k])) {
        strip(o[k], filter);
      }
    }
    else {
      delete o[k];
    }
  }
  return o;
}

export function id(x) {
  return ':' + x;
}

export function isId(x) {
  return typeof(x) === 'string' && x.startsWith(':');
}

export function translate(o, map) {
  const new_o = {};

  for (const k of Object.keys(o)) {
    // translate value
    if (isId(o[k])) {
      // it's an id
      o[k] = map[o[k]];
    }
    else if (isObject(o[k])) {
      // it's an object: descend
      translate(o[k], map);
    }

    // translate keys which are ids
    if (isId(k)) {
      const new_k = map[k];
      if (new_o[new_k] === undefined) {
        // translated key is new; take value
        new_o[new_k] = o[k];
      }
      else {
        // translated key exists; should not happen
        throw new Error("should not happen");
      }

      delete o[k];
    }
  }

  // insert the new entries with ids as keys
  for (const [k, v] of Object.entries(new_o)) {
    o[k] = v;    
  }

  return o;
}

export function isVisible(o, k, player) {
  if (k === '_') {
    return true;  // TODO: for now
  }
  const v = o?._?.[k];
  return v === undefined || v.includes(player);
}

export function makeView(g, pid) {
  return produce(g.s, s => {
    s = strip(s, (o, k) => isVisible(o, k, pid));
    s = translate(s, g.g2v[pid]);
  });
}

export function derefPath(o, path) {
  return path.reduce((v, k) => v[k], o);
/*
  let v = o;
  for (let k of path) {
    v = v[k];
  }
  return v;
*/
}

export function makeIdMap(o, path, map) {
  if (isObject(o)) {
    if (o?._?.['@id'] !== undefined) { 
      map[o._['@id']] = [...path];
    }

    for (const k of Object.keys(o)) {
      makeIdMap(o[k], [...path, k], map);
    }
  }
}

export function restoreHidden(g0, g1, actor) {
  for (let [k, p1] of Object.entries(g1.o)) {
    const p0 = g0.o[k];
    if (p0 !== undefined) {
      const v0 = derefPath(g0.s, p0);
      const v1 = derefPath(g1.s, p1);
      for (let k_ of Object.keys(v0._)) {
        if (!k_.startsWith('@')) {
          if (!isVisible(v0, k_, actor)) {
            v1[k_] = v0[k_]; 
          }
        }
      }
    }
  }
}

export function translatePatches(patches, map) {
  return produce(patches, p => {
    translate(p, map);
  });
}

export function updateGlobal(pv, g0, pid) {
  const pg = translatePatches(pv, g0.v2g[pid]);

  const g1 = {
    's': applyPatches(g0.s, pg),
    'o': {...g0.o}
  };

  for (let p of pg) {
    // no ids on removed paths
    // TODO: handle copy, move?
    if (p.op === 'add' || p.op === 'replace') {
      const obj = derefPath(g1.s, p.path);
      makeIdMap(obj, p.path, g1.o);
    }
  }

  return produce(g1, g => restoreHidden(g0, g, pid));
}

export function applyAction(action, g) {
  return produceWithPatches(g.s, s => {
    g.actions[action.action](s, ...action.args);
  });
}

export function doAction(action, g, pid) {
  let pg, _;
  [g.s, pg, _] = applyAction(action, g);

  return translatePatches(pg, g.g2v[pid]);
}
