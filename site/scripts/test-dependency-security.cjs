const { test } = require('node:test');
const assert = require('node:assert/strict');
const braces = require('braces');
const forge = require('node-forge');

test('braces rejects pathological nesting before recursive AST walking', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const pattern = open.repeat(3000) + 'a,b' + close.repeat(3000);
    for (const operation of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => operation(pattern), { name: 'SyntaxError', message: /maximum nesting depth/ });
    }
  }
  assert.deepEqual(braces.expand('src/{a,b}/{1..3}.ts'), [
    'src/a/1.ts', 'src/a/2.ts', 'src/a/3.ts', 'src/b/1.ts', 'src/b/2.ts', 'src/b/3.ts',
  ]);
  assert.equal(braces.compile('a{b,c}d'), 'a(b|c)d');
});

test('braces also bounds ASTs supplied directly to its public walkers', () => {
  const root = { type: 'root', nodes: [] };
  let parent = root;
  for (let i = 0; i < 1000; i++) {
    const child = { type: 'paren', nodes: [], parent };
    parent.nodes.push(child);
    parent = child;
  }
  parent.nodes.push({ type: 'text', value: 'a' });
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(root), { name: 'SyntaxError', message: /maximum nesting depth/ });
  }
});

test('RSA verification rejects unconsumed nested DigestAlgorithm elements', () => {
  const { publicKey, privateKey } = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 3 });
  const md = forge.md.sha256.create().update('dependency security regression');
  const digest = md.digest().getBytes();
  const { asn1 } = forge;
  const node = (type, value, constructed = false) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const signature = (parameters, extra) => {
    const algorithm = [node(asn1.Type.OID, asn1.oidToDer(forge.oids.sha256).getBytes())];
    if (parameters) algorithm.push(node(asn1.Type.NULL, ''));
    if (extra) algorithm.push(node(asn1.Type.OCTETSTRING, 'unconsumed garbage'));
    const encoded = asn1.toDer(node(asn1.Type.SEQUENCE, [
      node(asn1.Type.SEQUENCE, algorithm, true), node(asn1.Type.OCTETSTRING, digest),
    ], true)).getBytes();
    return privateKey.sign(encoded, 'NONE');
  };
  assert.equal(publicKey.verify(digest, privateKey.sign(md)), true);
  for (const parameters of [true, false]) {
    assert.equal(publicKey.verify(digest, signature(parameters, false)), true);
    assert.throws(() => publicKey.verify(digest, signature(parameters, true)), /valid RSASSA-PKCS1-v1_5/);
  }
  assert.equal(publicKey.verify(forge.md.sha256.create().update('different').digest().getBytes(), signature(true, false)), false);
});
