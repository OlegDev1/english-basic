#!/usr/bin/env node
// Проверка и склейка паков вопросов для «Угарного English».
//
//   node validate.mjs hotel data/hotel.json new-pack.json --out data/hotel.json
//   node validate.mjs party data/party.json extra-party.json --out data/party.json
//
// Режимы: hotel, runglish, grammar, emoji, party.
// Битые вопросы выкидываются с объяснением, дубли убираются, первый вариант всегда правильный.
import fs from 'node:fs';

const args = process.argv.slice(2);
const mode = args.shift();
const outIx = args.indexOf('--out');
const out = outIx >= 0 ? args.splice(outIx, 2)[1] : null;
if (!mode || !args.length) {
  console.error('Использование: node validate.mjs <hotel|runglish|grammar|emoji|party> файл.json [ещё.json ...] [--out итог.json]');
  process.exit(1);
}

const str = (v, min = 1, max = 400) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const norm = s => String(s).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim();
const uniq = a => new Set(a.map(norm)).size === a.length;

const CHECK = {
  hotel: q => {
    if (!str(q.g, 1, 16)) return 'g: нужен эмодзи гостя';
    if (!str(q.n, 2, 60)) return 'n: нужно имя гостя';
    if (!str(q.line, 3, 160)) return 'line: нужна реплика гостя по-английски';
    if (!str(q.tr, 3, 200)) return 'tr: нужен перевод реплики';
    if (!Array.isArray(q.o) || q.o.length !== 3) return 'o: нужно ровно 3 варианта';
    if (!q.o.every(x => Array.isArray(x) && str(x[0], 1, 160) && str(x[1], 3, 260))) return 'o: каждый вариант — [ответ, комментарий]';
    if (!uniq(q.o.map(x => x[0]))) return 'o: варианты повторяются';
    for (const k of ['p', 'r']) if (q[k] != null && !(typeof q[k] === 'number' && q[k] >= 0.1 && q[k] <= 2)) return `${k}: число от 0.1 до 2`;
  },
  runglish: q => {
    if (!str(q.ru, 2, 120)) return 'ru: нужна русская фраза';
    if (q.ctx != null && !str(q.ctx, 2, 120)) return 'ctx: пояснение слишком длинное';
    if (!Array.isArray(q.o) || q.o.length !== 3) return 'o: нужно ровно 3 варианта';
    if (!q.o.every(x => Array.isArray(x) && str(x[0], 1, 140) && str(x[1], 3, 260))) return 'o: каждый вариант — [фраза, комментарий]';
    if (!uniq(q.o.map(x => x[0]))) return 'o: варианты повторяются';
  },
  grammar: q => {
    if (!str(q.s, 5, 180) || q.s.split('___').length !== 2) return 's: в предложении должен быть ровно один пропуск ___';
    if (!Array.isArray(q.o) || q.o.length !== 3 || !q.o.every(x => str(x, 1, 40))) return 'o: нужно 3 коротких варианта';
    if (!uniq(q.o)) return 'o: варианты повторяются';
    if (!str(q.rule, 5, 220)) return 'rule: нужно правило';
    if (!str(q.tr, 3, 200)) return 'tr: нужен перевод';
  },
  emoji: q => {
    if (!str(q.e, 1, 40) || /[a-zа-яё]/i.test(q.e)) return 'e: только эмодзи, через « + »';
    if (!Array.isArray(q.o) || q.o.length !== 4 || !q.o.every(x => str(x, 1, 80))) return 'o: нужно 4 варианта';
    if (!uniq(q.o)) return 'o: варианты повторяются';
    if (!str(q.tr, 2, 160)) return 'tr: нужен перевод';
    if (!str(q.note, 3, 260)) return 'note: нужно пояснение';
  }
};
const KEY = { hotel: q => q.line, runglish: q => q.ru + ' ' + (q.ctx || ''), grammar: q => q.s, emoji: q => q.o[0] };

function load(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.error(`✗ ${f}: не читается как JSON (${e.message})`); process.exit(1); }
}

if (mode === 'party') {
  const res = { words: [], croc: [], nonsense: { s: [], v: [], o: [], e: [] } };
  const seen = new Set();
  const add = (list, item, key) => { const k = key + norm(Array.isArray(item) ? item[0] : item); if (seen.has(k)) return; seen.add(k); list.push(item); };
  for (const f of args) {
    const d = load(f);
    (d.words || []).filter(w => str(w, 1, 40)).forEach(w => add(res.words, w, 'w:'));
    (d.croc || []).filter(w => str(w, 3, 80)).forEach(w => add(res.croc, w, 'c:'));
    for (const k of ['s', 'v', 'o', 'e']) ((d.nonsense || {})[k] || []).filter(x => Array.isArray(x) && str(x[0]) && str(x[1])).forEach(x => add(res.nonsense[k], x, k + ':'));
  }
  console.log(`party: слов ${res.words.length}, «покажи» ${res.croc.length}, бред: ${Object.entries(res.nonsense).map(([k, v]) => k + '=' + v.length).join(' ')}`);
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
  process.exit(0);
}

if (!CHECK[mode]) { console.error('Неизвестный режим: ' + mode); process.exit(1); }
const result = [], seen = new Set();
let bad = 0, dup = 0;
for (const f of args) {
  const d = load(f);
  const list = Array.isArray(d) ? d : (d.questions || []);
  list.forEach((q, i) => {
    const err = q && typeof q === 'object' ? CHECK[mode](q) : 'не объект';
    if (err) { bad++; console.warn(`  ✗ ${f} #${i + 1}: ${err}`); return; }
    const k = norm(KEY[mode](q));
    if (seen.has(k)) { dup++; return; }
    seen.add(k); result.push(q);
  });
}
console.log(`${mode}: годных ${result.length}, битых ${bad}, дублей ${dup}`);
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
