import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {parseMapJson, serializeMap} from '../io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLE_PATH = resolve(__dirname, '../../../../../../map_backup_2026-04-12.json');

describe('io round-trip', () => {
    it('parses the sample backup without error', () => {
        const text = readFileSync(SAMPLE_PATH, 'utf8');
        const {map} = parseMapJson(text);
        expect(map.areas.length).toBe(32);
        expect(map.docking_stations.length).toBe(1);
    });

    it('round-trips the sample backup deep-equal (no data loss)', () => {
        const text = readFileSync(SAMPLE_PATH, 'utf8');
        const original = JSON.parse(text);
        const parsed = parseMapJson(text);
        const serialized = serializeMap(parsed);
        expect(serialized).toEqual(original);
    });

    it('preserves unknown top-level fields', () => {
        const text = readFileSync(SAMPLE_PATH, 'utf8');
        const src = JSON.parse(text);
        src.__custom = {answer: 42};
        const parsed = parseMapJson(JSON.stringify(src));
        const serialized = serializeMap(parsed);
        expect(serialized).toHaveProperty('__custom');
        expect((serialized as unknown as {__custom: unknown}).__custom).toEqual({answer: 42});
    });

    it('preserves unknown per-area fields', () => {
        const text = readFileSync(SAMPLE_PATH, 'utf8');
        const src = JSON.parse(text);
        src.areas[0].extra = 'hello';
        src.areas[0].properties.foo = 'bar';
        const parsed = parseMapJson(JSON.stringify(src));
        const serialized = serializeMap(parsed);
        expect(serialized.areas[0]).toHaveProperty('extra', 'hello');
        expect(serialized.areas[0].properties).toHaveProperty('foo', 'bar');
    });

    it('preserves unknown per-dock fields', () => {
        const text = readFileSync(SAMPLE_PATH, 'utf8');
        const src = JSON.parse(text);
        src.docking_stations[0].custom = {a: 1};
        const parsed = parseMapJson(JSON.stringify(src));
        const serialized = serializeMap(parsed);
        expect(serialized.docking_stations[0]).toHaveProperty('custom');
        expect((serialized.docking_stations[0] as unknown as {custom: unknown}).custom).toEqual({a: 1});
    });

    it('reflects edits on outline and type while keeping unknown fields', () => {
        const text = readFileSync(SAMPLE_PATH, 'utf8');
        const src = JSON.parse(text);
        src.areas[0].marker = 'keep-me';
        const parsed = parseMapJson(JSON.stringify(src));
        parsed.map.areas[0].properties.type = 'nav';
        parsed.map.areas[0].outline.push({x: 999, y: 999});
        const serialized = serializeMap(parsed);
        expect(serialized.areas[0]).toHaveProperty('marker', 'keep-me');
        expect(serialized.areas[0].properties.type).toBe('nav');
        expect(serialized.areas[0].outline[serialized.areas[0].outline.length - 1]).toEqual({x: 999, y: 999});
    });
});
