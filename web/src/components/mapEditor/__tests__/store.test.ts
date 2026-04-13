import {beforeEach, describe, expect, it} from 'vitest';
import {parseMapJson} from '../io';
import type {MapDoc} from '../types';
import {useMapEditorStore} from '../useMapEditorStore';

const TINY: MapDoc = {
    areas: [{
        id: 'a1',
        properties: {type: 'mow'},
        outline: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}],
    }],
    docking_stations: [],
};

function reset() {
    useMapEditorStore.setState({
        map: {areas: [], docking_stations: []},
        raw: null,
        loaded: false,
        filename: 'map.json',
        selection: null,
        mode: 'edit',
        drawing: null,
        view: {cx: 0, cy: 0, zoom: 30},
        hover: {edge: null, cursor: null},
        drag: null,
        spaceHeld: false,
        snap: 0,
        lastPoint: null,
        history: {past: [], future: []},
        dirty: false,
    });
}

function loadTiny() {
    const s = useMapEditorStore.getState();
    s.loadParsed({map: TINY, raw: {areas: TINY.areas, docking_stations: []}}, 'tiny.json');
}

describe('useMapEditorStore', () => {
    beforeEach(reset);

    it('loadParsed resets history + dirty', () => {
        loadTiny();
        const s = useMapEditorStore.getState();
        expect(s.map.areas).toHaveLength(1);
        expect(s.history.past).toHaveLength(0);
        expect(s.dirty).toBe(false);
    });

    it('commit sets dirty and records history', () => {
        loadTiny();
        useMapEditorStore.getState().setAreaType('a1', 'nav');
        const s = useMapEditorStore.getState();
        expect(s.map.areas[0].properties.type).toBe('nav');
        expect(s.history.past).toHaveLength(1);
        expect(s.dirty).toBe(true);
    });

    it('undo after commit restores previous state', () => {
        loadTiny();
        useMapEditorStore.getState().setAreaType('a1', 'nav');
        useMapEditorStore.getState().undo();
        const s = useMapEditorStore.getState();
        expect(s.map.areas[0].properties.type).toBe('mow');
        expect(s.history.future).toHaveLength(1);
    });

    it('redo reapplies an undone change', () => {
        loadTiny();
        useMapEditorStore.getState().setAreaType('a1', 'nav');
        useMapEditorStore.getState().undo();
        useMapEditorStore.getState().redo();
        const s = useMapEditorStore.getState();
        expect(s.map.areas[0].properties.type).toBe('nav');
        expect(s.history.past).toHaveLength(1);
        expect(s.history.future).toHaveLength(0);
    });

    it('markSaved clears dirty', () => {
        loadTiny();
        useMapEditorStore.getState().setAreaType('a1', 'nav');
        useMapEditorStore.getState().markSaved();
        expect(useMapEditorStore.getState().dirty).toBe(false);
    });

    it('deleteArea clears selection when that area was selected', () => {
        loadTiny();
        useMapEditorStore.getState().select({kind: 'area', id: 'a1'});
        useMapEditorStore.getState().deleteArea('a1');
        const s = useMapEditorStore.getState();
        expect(s.selection).toBeNull();
        expect(s.map.areas).toHaveLength(0);
    });

    it('refuses to delete a point that would drop below 3', () => {
        useMapEditorStore.getState().loadParsed({
            map: {
                areas: [{
                    id: 'tri',
                    properties: {type: 'mow'},
                    outline: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}],
                }],
                docking_stations: [],
            },
            raw: {areas: [], docking_stations: []},
        }, 'x.json');
        useMapEditorStore.getState().deletePoint('tri', 0);
        expect(useMapEditorStore.getState().map.areas[0].outline).toHaveLength(3);
    });

    it('mutate (drag) does not push history', () => {
        loadTiny();
        useMapEditorStore.getState().beginMutation();
        for (let i = 0; i < 5; i++) {
            useMapEditorStore.getState().updateDragPoint('a1', 0, {x: i, y: i});
        }
        const s = useMapEditorStore.getState();
        expect(s.history.past).toHaveLength(1);
        expect(s.map.areas[0].outline[0]).toEqual({x: 4, y: 4});
    });

    it('getSerialized returns null before load', () => {
        expect(useMapEditorStore.getState().getSerialized()).toBeNull();
    });

    it('getSerialized round-trips via io', () => {
        const raw = {
            areas: [{id: 'a1', properties: {type: 'mow'}, outline: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}]}],
            docking_stations: [],
        };
        const parsed = parseMapJson(JSON.stringify(raw));
        useMapEditorStore.getState().loadParsed(parsed, 't.json');
        const out = useMapEditorStore.getState().getSerialized();
        expect(out).toEqual(raw);
    });

    it('caps history at 50', () => {
        loadTiny();
        for (let i = 0; i < 60; i++) {
            useMapEditorStore.getState().setAreaType('a1', i % 2 === 0 ? 'mow' : 'nav');
        }
        expect(useMapEditorStore.getState().history.past.length).toBeLessThanOrEqual(50);
    });
});
