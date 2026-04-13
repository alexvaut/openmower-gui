import {describe, expect, it} from 'vitest';
import type {Area} from '../types';
import {buildOriginalOutlineMap, validateArea, validateMap} from '../validity';

function area(id: string, outline: Array<[number, number]>): Area {
    return {id, properties: {type: 'mow'}, outline: outline.map(([x, y]) => ({x, y}))};
}

describe('validateArea', () => {
    it('accepts a triangle', () => {
        expect(validateArea(area('t', [[0, 0], [1, 0], [0, 1]]))).toBeNull();
    });

    it('rejects < 3 points', () => {
        expect(validateArea(area('p', [[0, 0], [1, 0]]))).toMatch(/3 points/);
    });

    it('rejects zero area (collinear)', () => {
        expect(validateArea(area('z', [[0, 0], [1, 0], [2, 0]]))).toMatch(/zero/);
    });

    it('rejects a bowtie', () => {
        expect(
            validateArea(area('b', [[0, 0], [2, 2], [2, 0], [0, 2]])),
        ).toMatch(/self-intersecting/);
    });
});

describe('validateMap', () => {
    it('aggregates errors', () => {
        const res = validateMap({
            areas: [
                area('good', [[0, 0], [1, 0], [0, 1]]),
                area('short', [[0, 0], [1, 0]]),
                area('bowtie', [[0, 0], [2, 2], [2, 0], [0, 2]]),
            ],
            docking_stations: [],
        });
        expect(res.ok).toBe(false);
        expect(res.errors).toHaveLength(2);
        expect(res.errors.map(e => e.areaId).sort()).toEqual(['bowtie', 'short']);
    });

    it('grandfathers pre-existing invalid polygons that were not modified', () => {
        const bowtie = area('bowtie', [[0, 0], [2, 2], [2, 0], [0, 2]]);
        const orig = buildOriginalOutlineMap([bowtie]);
        const res = validateMap({areas: [bowtie], docking_stations: []}, orig);
        expect(res.ok).toBe(true);
        expect(res.errors).toHaveLength(1);
        expect(res.errors[0].grandfathered).toBe(true);
    });

    it('does not grandfather an invalid polygon once its outline is edited', () => {
        const original = area('b', [[0, 0], [2, 2], [2, 0], [0, 2]]);
        const orig = buildOriginalOutlineMap([original]);
        const edited = area('b', [[0, 0], [3, 3], [3, 0], [0, 3]]);
        const res = validateMap({areas: [edited], docking_stations: []}, orig);
        expect(res.ok).toBe(false);
        expect(res.errors[0].grandfathered).toBe(false);
    });
});
