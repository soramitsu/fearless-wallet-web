'use strict';

const MAX_DEPTH = 128;
const MAX_NODES = 65536;

// Validate iteratively before any upstream recursive AST walker runs. The
// parser's parent/prev backlinks are not child edges and are never recursed.
function assertBoundedAst(ast) {
  const checkedQueues = new Set();
  const assertBoundedQueue = queue => {
    if (queue === undefined || checkedQueues.has(queue)) return;
    if (!Array.isArray(queue)) throw new TypeError('Expected a brace expansion queue');
    const pendingValues = [[queue, 0, false]];
    const activeArrays = new Set();
    let valueCount = 0;
    while (pendingValues.length) {
      const [value, depth, exiting] = pendingValues.pop();
      if (exiting) {
        activeArrays.delete(value);
        continue;
      }
      if (++valueCount > MAX_NODES) throw new RangeError('Brace queue exceeds the safe node limit');
      if (typeof value === 'string') continue;
      if (!Array.isArray(value)) throw new TypeError('Expected brace queue strings or arrays');
      if (depth >= MAX_DEPTH) throw new RangeError('Brace queue exceeds the safe depth limit');
      if (activeArrays.has(value)) throw new RangeError('Cyclic brace expansion queues are unsupported');
      if (pendingValues.length + value.length + valueCount > MAX_NODES) throw new RangeError('Brace queue exceeds the safe node limit');
      activeArrays.add(value);
      pendingValues.push([value, depth, true]);
      for (let index = value.length - 1; index >= 0; index--) pendingValues.push([value[index], depth + 1, false]);
    }
    // Cache complete queue roots only: a previously checked nested array must
    // still be counted and checked at its new depth in another queue.
    checkedQueues.add(queue);
  };
  const pending = [[ast, 0]];
  const seen = new Set();
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node || typeof node !== 'object') throw new TypeError('Expected a brace AST node');
    if (node.value !== undefined && typeof node.value !== 'string') throw new TypeError('Expected a string brace AST value');
    assertBoundedQueue(node.queue);
    if (depth >= MAX_DEPTH) throw new RangeError('Brace nesting exceeds the safe depth limit');
    if (seen.has(node)) throw new RangeError('Cyclic or shared brace AST nodes are unsupported');
    seen.add(node);
    if (++count > MAX_NODES) throw new RangeError('Brace AST exceeds the safe node limit');
    // expand also follows parent links supplied by direct AST callers.
    const parents = new Set();
    let parent = node.parent;
    while (parent) {
      if (parents.has(parent) || parents.size >= MAX_DEPTH) throw new RangeError('Brace parent chain exceeds the safe depth limit');
      parents.add(parent);
      assertBoundedQueue(parent.queue);
      parent = parent.parent;
    }
    if (node.nodes !== undefined) {
      if (!Array.isArray(node.nodes)) throw new TypeError('Expected brace AST children');
      if (pending.length + node.nodes.length + count > MAX_NODES) throw new RangeError('Brace AST exceeds the safe node limit');
      for (const child of node.nodes) pending.push([child, depth + 1]);
    }
  }
}

module.exports = { MAX_DEPTH, MAX_NODES, assertBoundedAst };
