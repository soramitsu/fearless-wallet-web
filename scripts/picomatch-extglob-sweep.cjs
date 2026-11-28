'use strict';

// Checks that picomatch copies guarded against GHSA-fc5q-39xc-vjpf cannot be made to backtrack through a repeated
// extglob. Run by the dependency tests in a child process, which they stop after a deadline, because an unguarded
// copy takes longer than the age of the universe on some of these inputs.
//
//   node scripts/picomatch-extglob-sweep.cjs <picomatch directory>...
//
// For every copy: each named shape must compile to its literal text and match only itself; every `+(…)` and
// `*(…)` built from one or two atoms (alone, between path segments, and before a literal) must compile and answer
// seven crafted strings within a CPU budget per call; and a body with any atom other than literal
// characters and single-character classes must come out literal (or as upstream's flat `x*` rewrite of nested
// `*(x)` sequences). CPU time is measured per call, so a busy machine does not inflate it. Prints one JSON line.

const SHAPES = [
  '+(*)', '+(*a)', '*(*a)', '+(a*)', '*(a*b)', '+(*a|b)', '+(b|*a)', '+(*?a)', '+(**)', '+(*.js)', '*(*.js|*.ts)',
  '+(@(*a))', '+(a|@(*b))', '+({*a,b})', '+(+(*a))', '*(+(*a)|b)', 'x/+(*a)/y',
  '+(a*(a))', '+(*(a)a)', '+(["]*["])', '+(["]|*|["])',
  '+(a+)', '*(+(a)+(a))', '+({a,aa})', '+(@(a|aa))', '+(a?|a)', '+(a|aa)', '+(a|b)', '*(a|b)',
  '+(+(a))', '+((a))', '+(a(b))', '+(a{2})', '+(!(a))', '+(a@(b))'
];
const PLAIN = ['a', 'b', 'ab', '[ab]', '[a-c]', '[!a]', '["]', '"*"', '\\*', '.', '/', ','];
const RISKY = ['*', '?', 'a+', '{a,aa}', 'a|aa', 'a|b', '|', '@(a|aa)', '*(a)', '+(a)', '?(a)', '!(a)', '(a)', '@(*a)', '+(*a)', '["]*["]'];
const SUBJECTS = [
  'a'.repeat(64) + '!', 'a'.repeat(64) + '/', 'ab'.repeat(32) + '/', '"'.repeat(64) + '/', '[ab]'.repeat(16) + '!',
  'a.'.repeat(32) + '/', 'x/' + 'a'.repeat(64) + '!/y'
];
const MATCH_BUDGET_US = 50_000;
const COMPILE_BUDGET_US = 50_000;
const FLAT_STAR = /^\^\(\?:\(\?=\.\)(?:[^()|*+?\\[]|\[[^\]]+\])\*\)\$$/;
const literalSource = pattern => `^(?:${pattern.replace(/[-*+?.^${}(|)[\]]/g, '\\$&').replace(/\//g, '\\/')})$`;
const cpu = action => {
  const before = process.cpuUsage();
  const value = action();
  const { user, system } = process.cpuUsage(before);
  return [value, user + system];
};

const report = { copies: [], failures: [] };
for (const directory of process.argv.slice(2)) {
  const picomatch = require(directory);
  const stats = { directory, shapes: 0, patterns: 0, matches: 0, literal: 0, flat: 0, kept: 0, worstMatchUs: 0, worstPattern: '' };
  const fail = (...detail) => report.failures.push([directory, ...detail]);
  const exercise = pattern => {
    let re;
    try {
      let us;
      [re, us] = cpu(() => picomatch.makeRe(pattern));
      // As for matches below, a call over budget is measured again and the fastest kept.
      for (let retry = 0; us > COMPILE_BUDGET_US && retry < 2; retry++) us = Math.min(us, cpu(() => picomatch.makeRe(pattern))[1]);
      if (us > COMPILE_BUDGET_US) fail('compile budget', pattern, us);
    } catch (error) {
      fail('compile error', pattern, error.message);
      return undefined;
    }
    for (const subject of SUBJECTS) {
      // A call over budget is measured twice more and the fastest kept: a garbage collection can stall one call, an
      // exponential match is slow every time.
      let us = cpu(() => re.test(subject))[1];
      for (let retry = 0; us > MATCH_BUDGET_US && retry < 2; retry++) us = Math.min(us, cpu(() => re.test(subject))[1]);
      stats.matches++;
      if (us > stats.worstMatchUs) [stats.worstMatchUs, stats.worstPattern] = [us, pattern];
      if (us > MATCH_BUDGET_US) fail('match budget', pattern, subject.slice(0, 12), us);
    }
    return re;
  };

  for (const pattern of SHAPES) {
    stats.shapes++;
    const re = exercise(pattern);
    if (!re) continue;
    if (re.source !== literalSource(pattern)) fail('shape not literal', pattern, re.source);
    if (!picomatch.isMatch(pattern, pattern) || picomatch.isMatch('aaa', pattern)) fail('shape does not match only itself', pattern);
  }

  for (const first of [...PLAIN, ...RISKY]) {
    for (const second of ['', ...PLAIN, ...RISKY]) {
      for (const op of ['+', '*']) {
        const body = first + second;
        for (const pattern of [`${op}(${body})`, `x/${op}(${body})/y`, `${op}(${body})c`]) {
          stats.patterns++;
          const re = exercise(pattern);
          if (!re || pattern !== `${op}(${body})`) continue;
          if (re.source === literalSource(pattern)) stats.literal++;
          else if (FLAT_STAR.test(re.source)) stats.flat++;
          else {
            stats.kept++;
            // `+(?` and `*(?` do not open an extglob in picomatch (they read as a regex group), and a quote can leave
            // the parenthesis unclosed, so only the other bodies must come out literal.
            const checked = !body.startsWith('?') && !body.includes('"');
            if (checked && (RISKY.includes(first) || RISKY.includes(second))) fail('risky body kept', pattern, re.source);
          }
        }
      }
    }
  }
  report.copies.push(stats);
}
console.log(JSON.stringify(report));
process.exitCode = report.failures.length ? 1 : 0;
