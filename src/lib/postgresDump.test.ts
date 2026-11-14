import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dumpDataSelect, sqlLiteral } from './postgresDump.ts';

test('selects JSON columns as text without changing ordinary columns', () => {
  assert.equal(dumpDataSelect('example', [
    { column_name: 'specific_challenges', udt_name: 'jsonb' },
    { column_name: 'metadata', udt_name: 'json' },
    { column_name: 'tags', udt_name: '_text' },
    { column_name: 'odd"name', udt_name: 'text' },
  ]), 'SELECT "specific_challenges"::text AS "specific_challenges", "metadata"::text AS "metadata", "tags", "odd""name" FROM "public"."example"');
});

test('serializes JSON arrays, objects and scalars without confusing SQL NULL with JSON null', () => {
  assert.equal(sqlLiteral('[]', 'jsonb'), "'[]'::jsonb");
  assert.equal(sqlLiteral('["O\'Brien", {"path":"a\\\\b"}]', 'jsonb'), `E'["O''Brien", {"path":"a\\\\\\\\b"}]'::jsonb`);
  assert.equal(sqlLiteral('"hello"', 'json'), '\'"hello"\'::json');
  assert.equal(sqlLiteral('42', 'jsonb'), "'42'::jsonb");
  assert.equal(sqlLiteral('true', 'jsonb'), "'true'::jsonb");
  assert.equal(sqlLiteral('null', 'jsonb'), "'null'::jsonb");
  assert.equal(sqlLiteral(null, 'jsonb'), 'NULL');
  assert.throws(() => sqlLiteral([], 'jsonb'), /Expected jsonb data as text/);
});

test('continues to serialize PostgreSQL text arrays as arrays', () => {
  assert.equal(sqlLiteral([], '_text'), "'{}'::text[]");
  assert.equal(sqlLiteral(['one', "O'Brien"], '_text'), "ARRAY['one', 'O''Brien']::text[]");
});
