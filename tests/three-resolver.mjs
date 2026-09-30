// Node resolve hook: the browser maps the bare specifier 'three' through the
// import map in index.html; under Node (`node --import ./tests/three-resolver.mjs --test ...`)
// this maps it to the same vendored file so avatar.js can be unit-tested.
import { register } from 'node:module';
register('./three-resolver-hooks.mjs', import.meta.url);
