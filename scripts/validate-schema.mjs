#!/usr/bin/env node
// Minimal JSON Schema (draft-07 subset) validator used by the governance check
// scripts (check-fixtures.sh, check-capability-matrix.sh, check-evidence-honesty.sh).
//
// Supported keywords: type, required, additionalProperties, properties, items,
// const, enum, pattern, minimum, allOf, not, if/then/else.
// Other annotation keywords ($schema, $id, title, description) are ignored.
//
// Usage: node validate-schema.mjs <schema.json> <instance.json>
import { readFileSync } from 'node:fs';

const [, , schemaPath, instancePath] = process.argv;

if (!schemaPath || !instancePath) {
  console.error('usage: validate-schema.mjs <schema.json> <instance.json>');
  process.exit(2);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`❌ cannot read/parse ${label} ${path}: ${error.message}`);
    process.exit(1);
  }
}

const schema = readJson(schemaPath, 'schema');
const instance = readJson(instancePath, 'instance');

const errors = [];

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validate(sch, inst, path) {
  if (sch.type) {
    const types = Array.isArray(sch.type) ? sch.type : [sch.type];
    const ok = types.some((t) => {
      switch (t) {
        case 'object': return isObject(inst);
        case 'array': return Array.isArray(inst);
        case 'string': return typeof inst === 'string';
        case 'integer': return typeof inst === 'number' && Number.isInteger(inst);
        case 'number': return typeof inst === 'number';
        case 'boolean': return typeof inst === 'boolean';
        case 'null': return inst === null;
        default: return true;
      }
    });
    if (!ok) {
      errors.push(`${path}: expected type ${types.join('/')}, got ${inst === null ? 'null' : Array.isArray(inst) ? 'array' : typeof inst}`);
    }
  }

  if (inst === null || inst === undefined) return;

  if ('const' in sch && sch.const !== inst) {
    errors.push(`${path}: expected const ${JSON.stringify(sch.const)}, got ${JSON.stringify(inst)}`);
  }
  if (sch.enum && !sch.enum.includes(inst)) {
    errors.push(`${path}: value ${JSON.stringify(inst)} not in enum ${JSON.stringify(sch.enum)}`);
  }

  if (typeof inst === 'string' && sch.pattern) {
    const re = new RegExp(sch.pattern);
    if (!re.test(inst)) {
      errors.push(`${path}: string ${JSON.stringify(inst)} does not match pattern ${sch.pattern}`);
    }
  }

  if (typeof inst === 'number' && sch.minimum !== undefined && inst < sch.minimum) {
    errors.push(`${path}: ${inst} < minimum ${sch.minimum}`);
  }

  if (isObject(inst)) {
    if (sch.required) {
      for (const req of sch.required) {
        if (!(req in inst)) errors.push(`${path}: missing required property "${req}"`);
      }
    }
    if (sch.properties) {
      for (const [key, sub] of Object.entries(sch.properties)) {
        if (key in inst) validate(sub, inst[key], `${path}.${key}`);
      }
    }
    if (sch.additionalProperties === false && sch.properties) {
      for (const key of Object.keys(inst)) {
        if (!(key in sch.properties)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
  }

  if (Array.isArray(inst) && sch.items) {
    for (let i = 0; i < inst.length; i++) validate(sch.items, inst[i], `${path}[${i}]`);
  }

  if (sch.allOf) {
    for (let i = 0; i < sch.allOf.length; i++) validate(sch.allOf[i], inst, `${path} [allOf ${i}]`);
  }

  if (sch.not) {
    const before = errors.length;
    validate(sch.not, inst, path);
    const matched = errors.length === before;
    errors.length = before;
    if (matched) errors.push(`${path}: value matched a forbidden schema`);
  }

  if (sch.if) {
    const before = errors.length;
    validate(sch.if, inst, path);
    const matched = errors.length === before;
    errors.length = before;
    if (matched && sch.then) validate(sch.then, inst, `${path} [then]`);
    if (!matched && sch.else) validate(sch.else, inst, `${path} [else]`);
  }
}

validate(schema, instance, '$');

if (errors.length > 0) {
  for (const e of errors.slice(0, 50)) console.error(`  - ${e}`);
  if (errors.length > 50) console.error(`  - ... and ${errors.length - 50} more`);
  console.error(`FAILED: ${errors.length} schema violation(s)`);
  process.exit(1);
}
console.log('✓ instance conforms to schema');
