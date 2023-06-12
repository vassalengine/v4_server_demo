export function dump_it(obj) {
  console.dir(
    obj,
    {
      depth: null,
      maxArrayLength: null,
      maxStringLength: null
    }
  );
}

export function isObject(o) {
  // null is an object, lol
  return o !== null && typeof(o) === 'object';
}
