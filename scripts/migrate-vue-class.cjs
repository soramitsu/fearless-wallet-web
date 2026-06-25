const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(repoRoot, 'src');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, out);
    else if (entry.isFile() && fullPath.endsWith('.vue')) out.push(fullPath);
  }

  return out;
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let quote = '';
  let isTemplate = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === quote) {
        quote = '';
        isTemplate = false;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      isTemplate = ch === '`';
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function splitTopLevelMembers(body) {
  const members = [];
  let start = 0;
  let depth = 0;
  let paren = 0;
  let bracket = 0;
  let quote = '';
  let isTemplate = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  const push = (end) => {
    const value = body.slice(start, end).trim();
    if (value) members.push(value);
    start = end;
  };

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const next = body[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === quote) {
        quote = '';
        isTemplate = false;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      isTemplate = ch === '`';
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket--;

    if (depth === 0 && paren === 0 && bracket === 0 && ch === ';') {
      push(i + 1);
    } else if (depth === 0 && paren === 0 && bracket === 0 && ch === '\n') {
      const rest = body.slice(i + 1);
      if (/^\s*(?:@\w+|(?:async\s+)?(?:get\s+|set\s+)?[A-Za-z_$][\w$]*\s*(?:<[^>\n]+>)?\s*\(|(?:public|private|protected|readonly|static|\s)+[A-Za-z_$]|[A-Za-z_$][\w$]*\s*[!:?=])/.test(rest)) {
        const candidate = body.slice(start, i).trim();
        if (candidate.endsWith('}')) push(i + 1);
      }
    }
  }

  push(body.length);

  return members;
}

function parseDecoratedProperty(member, decoratorName) {
  const re = new RegExp(`^@${decoratorName}(?:\\(([^]*)\\))?\\s+((?:public|private|protected|readonly|static)\\s+)*([A-Za-z_$][\\w$]*)[!:?][^=;]*(?:=\\s*([^;]+))?;?$`);
  const match = member.match(re);
  if (!match) return null;

  return {
    args: (match[1] || '').trim(),
    name: match[3],
    initializer: match[4]?.trim(),
  };
}

function parsePropSync(member) {
  const parsed = parseDecoratedProperty(member, 'PropSync');
  if (!parsed) return null;
  const args = splitArgs(parsed.args);

  return {
    name: parsed.name,
    propName: stripQuotes(args[0]),
    options: args[1] || 'undefined',
  };
}

function parseRef(member) {
  const parsed = parseDecoratedProperty(member, 'Ref');
  if (!parsed) return null;

  return {
    name: parsed.name,
    refName: stripQuotes(splitArgs(parsed.args)[0]),
  };
}

function parseVModel(member) {
  const parsed = parseDecoratedProperty(member, 'VModel');
  if (!parsed) return null;

  return {
    name: parsed.name,
    options: parsed.args || '{}',
  };
}

function splitArgs(args) {
  const values = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < args.length; i++) {
    const ch = args[i];

    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      values.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = args.slice(start).trim();
  if (tail) values.push(tail);

  return values;
}

function stripQuotes(value) {
  return value?.replace(/^['"`]|['"`]$/g, '') || '';
}

function parseWatch(member) {
  const match = member.match(/^((?:@Watch\([^)]*\)\s*)+)([\s\S]*)$/);
  if (!match) return null;

  const decorators = [...match[1].matchAll(/@Watch\(([^)]*)\)/g)].map((decorator) => decorator[1].trim());
  const method = match[2].trim();
  const methodName = method.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/)?.[1];

  if (!methodName) return null;

  return {
    decorators,
    method,
    methodName,
  };
}

function parseAccessor(member, kind) {
  const match = member.match(new RegExp(`^(?:public\\s+|private\\s+|protected\\s+)?${kind}\\s+([A-Za-z_$][\\w$]*)\\s*\\(([^)]*)\\)\\s*(?::\\s*[^\\{]+)?\\{([\\s\\S]*)\\}$`));
  if (!match) return null;

  return {
    name: match[1],
    params: match[2],
    body: match[3],
  };
}

function parseMethod(member) {
  const match = member.match(/^(?:(public|private|protected)\s+)?(?:(async)\s+)?([A-Za-z_$][\w$]*)\s*(<[^>{}]+>)?\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{([\s\S]*)\}$/);
  if (!match) return null;

  return {
    name: match[3],
    asyncKeyword: match[2] ? 'async ' : '',
    typeParams: match[4] || '',
    params: match[5],
    body: match[6],
  };
}

function parseDataField(member) {
  const cleaned = member
    .replace(/^(?:public|private|protected|readonly)\s+/, '')
    .replace(/;$/, '')
    .trim();
  const match = cleaned.match(/^([A-Za-z_$][\w$]*)\s*(?::[^=]+)?(?:=\s*([\s\S]+))?$/);
  if (!match) return null;
  if (!match[2]) return null;

  return {
    name: match[1],
    initializer: match[2].trim(),
  };
}

function indentBlock(block, spaces = 4) {
  const prefix = ' '.repeat(spaces);

  return block
    .trim()
    .split('\n')
    .map((line) => (line.trim() ? prefix + line : line))
    .join('\n');
}

function buildProps(props, propSyncs, vmodels) {
  const entries = [];

  for (const prop of props) entries.push(`    ${prop.name}: ${prop.args || 'undefined'},`);
  for (const prop of propSyncs) entries.push(`    ${prop.propName}: ${prop.options},`);
  for (const model of vmodels) entries.push(`    modelValue: ${model.options || '{}'},`);

  if (!entries.length) return '';

  return `  props: {\n${entries.join('\n')}\n  },\n`;
}

function buildData(fields) {
  if (!fields.length) return '';

  const entries = fields.map((field) => `      ${field.name}: ${field.initializer},`);

  return `  data() {\n    return {\n${entries.join('\n')}\n    };\n  },\n`;
}

function buildComputed(getters, setters, propSyncs, refs, vmodels) {
  const chunks = [];
  const setterMap = new Map(setters.map((setter) => [setter.name, setter]));
  const getterNames = new Set();

  for (const getter of getters) {
    getterNames.add(getter.name);
    const setter = setterMap.get(getter.name);
    if (setter) {
      chunks.push(`    ${getter.name}: {\n      get() {\n${indentBlock(getter.body, 8)}\n      },\n      set(${setter.params}) {\n${indentBlock(setter.body, 8)}\n      },\n    },`);
    } else {
      chunks.push(`    ${getter.name}() {\n${indentBlock(getter.body, 6)}\n    },`);
    }
  }

  for (const prop of propSyncs) {
    if (getterNames.has(prop.name)) continue;
    chunks.push(`    ${prop.name}: {\n      get() {\n        return this.${prop.propName};\n      },\n      set(value) {\n        this.$emit('update:${prop.propName}', value);\n      },\n    },`);
  }

  for (const model of vmodels) {
    if (getterNames.has(model.name)) continue;
    chunks.push(`    ${model.name}: {\n      get() {\n        return this.modelValue;\n      },\n      set(value) {\n        this.$emit('update:modelValue', value);\n      },\n    },`);
  }

  for (const ref of refs) {
    chunks.push(`    ${ref.name}() {\n      return this.$refs.${ref.refName};\n    },`);
  }

  if (!chunks.length) return '';

  return `  computed: {\n${chunks.join('\n')}\n  },\n`;
}

function buildWatch(watches) {
  if (!watches.length) return '';

  const entries = [];

  for (const watch of watches) {
    for (const decorator of watch.decorators) {
      const args = splitArgs(decorator);
      const source = stripQuotes(args[0]);
      const options = args[1];
      if (options) entries.push(`    ${JSON.stringify(source)}: { handler: '${watch.methodName}', ...${options} },`);
      else entries.push(`    ${JSON.stringify(source)}: '${watch.methodName}',`);
    }
  }

  return `  watch: {\n${entries.join('\n')}\n  },\n`;
}

function buildMethods(methods) {
  if (!methods.length) return '';

  const entries = methods.map((method) => `    ${method.asyncKeyword}${method.name}${method.typeParams}(${method.params}) {\n${indentBlock(method.body, 6)}\n    },`);

  return `  methods: {\n${entries.join('\n')}\n  },\n`;
}

function ensureDefineComponentImport(script) {
  if (script.includes("from 'vue'") && script.includes('defineComponent')) return script;

  const decoratorImport = /import\s+\{[^}]*\}\s+from\s+'vue-property-decorator';\n?/.exec(script);
  if (!decoratorImport) return script;

  return script.replace(decoratorImport[0], "import { defineComponent } from 'vue';\n");
}

function removeVueDecoratorImport(script) {
  return script.replace(/import\s+\{[^}]*\}\s+from\s+'vue-property-decorator';\n?/, '');
}

function transformFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const scriptMatch = original.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
  if (!scriptMatch || !scriptMatch[2].includes('vue-property-decorator')) return false;

  const scriptAttrs = scriptMatch[1];
  let script = scriptMatch[2];

  const componentIndex = script.search(/@Component(?:\s*\(|\s*\n)/);
  const classMatch = /export\s+default\s+class\s+([A-Za-z_$][\w$]*)\s+extends\s+Vue\s*\{/.exec(script);
  if (componentIndex === -1 || !classMatch) {
    console.warn(`Skipped ${path.relative(repoRoot, filePath)}: unsupported class component shape`);
    return false;
  }

  const className = classMatch[1];
  const classOpen = script.indexOf('{', classMatch.index);
  const classClose = findMatchingBrace(script, classOpen);
  if (classClose === -1) throw new Error(`Could not find class close in ${filePath}`);

  const componentDecorator = script.slice(componentIndex, classMatch.index).trim();
  const componentOptions = componentDecorator.startsWith('@Component(')
    ? componentDecorator.slice('@Component('.length, -1).trim() || '{}'
    : '{}';

  let importsAndDeclarations = script.slice(0, componentIndex);
  importsAndDeclarations = removeVueDecoratorImport(importsAndDeclarations);
  importsAndDeclarations = importsAndDeclarations.replace(/\n{3,}/g, '\n\n');
  importsAndDeclarations = `import { defineComponent } from 'vue';\n${importsAndDeclarations}`;

  const body = script.slice(classOpen + 1, classClose);
  const members = splitTopLevelMembers(body);

  const props = [];
  const propSyncs = [];
  const refs = [];
  const vmodels = [];
  const watches = [];
  const getters = [];
  const setters = [];
  const dataFields = [];
  const lifecycle = [];
  const methods = [];

  for (const member of members) {
    const propSync = parsePropSync(member);
    if (propSync) {
      propSyncs.push(propSync);
      continue;
    }

    const ref = parseRef(member);
    if (ref) {
      refs.push(ref);
      continue;
    }

    const vmodel = parseVModel(member);
    if (vmodel) {
      vmodels.push(vmodel);
      continue;
    }

    const prop = parseDecoratedProperty(member, 'Prop');
    if (prop) {
      props.push(prop);
      continue;
    }

    const watch = parseWatch(member);
    if (watch) {
      watches.push(watch);
      const parsedWatchMethod = parseMethod(watch.method);
      if (parsedWatchMethod) methods.push(parsedWatchMethod);
      continue;
    }

    const getter = parseAccessor(member, 'get');
    if (getter) {
      getters.push(getter);
      continue;
    }

    const setter = parseAccessor(member, 'set');
    if (setter) {
      setters.push(setter);
      continue;
    }

    const method = parseMethod(member);
    if (method) {
      if (['created', 'mounted', 'beforeMount', 'beforeUnmount', 'unmounted', 'updated', 'activated', 'deactivated'].includes(method.name)) {
        lifecycle.push(method);
      } else if (method.name === 'beforeDestroy') {
        lifecycle.push({ ...method, name: 'beforeUnmount' });
      } else if (method.name === 'destroyed') {
        lifecycle.push({ ...method, name: 'unmounted' });
      } else {
        methods.push(method);
      }
      continue;
    }

    const field = parseDataField(member);
    if (field) {
      dataFields.push(field);
      continue;
    }

    console.warn(`Unparsed member in ${path.relative(repoRoot, filePath)}:\n${member}\n`);
  }

  const optionSections = [];

  const normalizedOptions = componentOptions === '{}' ? `{ name: '${className}' }` : componentOptions.replace(/^\{/, `{ name: '${className}',`);
  optionSections.push(`export default defineComponent(${normalizedOptions.replace(/\}\s*$/, '')}${normalizedOptions.trim().endsWith(',') ? '' : ','}`);
  optionSections.push(buildProps(props, propSyncs, vmodels).trimEnd());
  optionSections.push(buildData(dataFields).trimEnd());
  optionSections.push(buildComputed(getters, setters, propSyncs, refs, vmodels).trimEnd());
  optionSections.push(buildWatch(watches).trimEnd());
  for (const hook of lifecycle) {
    optionSections.push(`  ${hook.asyncKeyword}${hook.name}${hook.typeParams}(${hook.params}) {\n${indentBlock(hook.body, 4)}\n  },`);
  }
  optionSections.push(buildMethods(methods).trimEnd());

  const newOptions = optionSections.filter(Boolean).join('\n');
  const newScript = `${importsAndDeclarations.trim()}\n\n${newOptions}\n});\n`;

  const transformed = original.replace(scriptMatch[0], `<script${scriptAttrs}>${newScript}</script>`);
  fs.writeFileSync(filePath, transformed);

  return true;
}

let count = 0;
for (const filePath of walk(srcRoot)) {
  if (transformFile(filePath)) count++;
}

console.info(`Converted ${count} class components.`);
