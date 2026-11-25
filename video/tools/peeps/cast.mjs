import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
const B = './package/build/';
const mk = async (dir, name, opts = {}) => renderToStaticMarkup(React.createElement((await import(B + dir + '/' + name + '.js')).default, opts));
const SKIN = '#F2C7A2', LINE = '#14152E';
const cast = {
  agai:   { body: ['BlazerBlackTee', { blazerColor: '#FFFFFF' }], hair: 'ShortTwo', acc: 'Glasses' },
  aibek:  { body: ['Hoodie', { topColor: '#3A3CF4' }], hair: 'ShortThree' },
  aiperi: { body: ['Tee', { topColor: '#E5484D' }], hair: 'LongHair' },
};
const out = { faces: {}, cast: {} };
for (const f of fs.readdirSync(B + 'face').filter(f => f.endsWith('.js') && f !== 'index.js'))
  try { out.faces[f.slice(0, -3)] = await mk('face', f.slice(0, -3), { outlineColor: LINE }); } catch (e) {}
for (const [k, c] of Object.entries(cast)) {
  out.cast[k] = {
    body: await mk('body/effigy', c.body[0], { skinColor: SKIN, outlineColor: LINE, ...c.body[1] }),
    hair: await mk('head', c.hair, { skinColor: SKIN, outlineColor: LINE }),
    acc: c.acc ? await mk('accessory', c.acc, { outlineColor: LINE }) : '',
  };
}
fs.writeFileSync(process.argv[2], 'window.PEEPS = ' + JSON.stringify(out) + ';\n');
console.log('faces', Object.keys(out.faces).length, 'cast', Object.keys(out.cast));
