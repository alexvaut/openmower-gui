import {useMemo, useState} from 'react';
import {Button, Input} from 'antd';
import {useShallow} from 'zustand/react/shallow';
import {AREA_STYLE, DOCK_COLOR} from './style';
import type {AreaType} from './types';
import {useMapEditorStore} from './useMapEditorStore';

const TYPE_LABEL: Record<AreaType, string> = {
    mow: 'Mow',
    obstacle: 'Obstacle',
    nav: 'Nav',
};

export function AreaList() {
    const {
        areas, docks, selection, loaded,
        select, startDrawArea, startDrawDock,
    } = useMapEditorStore(useShallow(s => ({
        areas: s.map.areas,
        docks: s.map.docking_stations,
        selection: s.selection,
        loaded: s.loaded,
        select: s.select,
        startDrawArea: s.startDrawArea,
        startDrawDock: s.startDrawDock,
    })));
    const [filter, setFilter] = useState('');

    const counts = useMemo(() => {
        const c = {mow: 0, obstacle: 0, nav: 0};
        for (const a of areas) c[a.properties.type]++;
        return c;
    }, [areas]);

    const filtered = useMemo(() => {
        const f = filter.trim().toLowerCase();
        if (!f) return areas;
        return areas.filter(a => a.id.toLowerCase().includes(f) || a.properties.type.includes(f));
    }, [areas, filter]);

    return (
        <div className="w-64 shrink-0 h-full flex flex-col bg-slate-900 border-r border-slate-800 text-slate-200">
            <div className="p-2 flex flex-col gap-1 border-b border-slate-800">
                <div className="text-xs uppercase text-slate-400 mb-1">Create</div>
                <div className="grid grid-cols-2 gap-1">
                    <Button size="small" disabled={!loaded} onClick={() => startDrawArea('mow')}
                            style={{borderColor: AREA_STYLE.mow.stroke, color: AREA_STYLE.mow.stroke}}>
                        + Mow
                    </Button>
                    <Button size="small" disabled={!loaded} onClick={() => startDrawArea('obstacle')}
                            style={{borderColor: AREA_STYLE.obstacle.stroke, color: AREA_STYLE.obstacle.stroke}}>
                        + Obstacle
                    </Button>
                    <Button size="small" disabled={!loaded} onClick={() => startDrawArea('nav')}
                            style={{borderColor: AREA_STYLE.nav.stroke, color: AREA_STYLE.nav.stroke}}>
                        + Nav
                    </Button>
                    <Button size="small" disabled={!loaded} onClick={startDrawDock}
                            style={{borderColor: DOCK_COLOR, color: DOCK_COLOR}}>
                        + Dock
                    </Button>
                </div>
            </div>
            <div className="p-2 border-b border-slate-800">
                <Input
                    size="small"
                    placeholder="Filter by id/type"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    allowClear
                />
                <div className="mt-1 text-[11px] text-slate-400 flex gap-3">
                    <span style={{color: AREA_STYLE.mow.stroke}}>mow {counts.mow}</span>
                    <span style={{color: AREA_STYLE.obstacle.stroke}}>obs {counts.obstacle}</span>
                    <span style={{color: AREA_STYLE.nav.stroke}}>nav {counts.nav}</span>
                    <span style={{color: DOCK_COLOR}}>dock {docks.length}</span>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {filtered.map(a => {
                    const isSel = selection?.kind === 'area' && selection.id === a.id;
                    return (
                        <div
                            key={a.id}
                            onClick={() => select({kind: 'area', id: a.id})}
                            className={`px-2 py-1.5 border-b border-slate-800 cursor-pointer text-xs hover:bg-slate-800 ${isSel ? 'bg-slate-800' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className="inline-block w-2 h-2 rounded-full"
                                    style={{background: AREA_STYLE[a.properties.type].stroke}}
                                />
                                <span className="font-medium">{TYPE_LABEL[a.properties.type]}</span>
                                <span className="text-slate-500 font-mono ml-auto">{a.id.slice(0, 6)}…</span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400 pl-4">{a.outline.length} pts</div>
                        </div>
                    );
                })}
                {docks.map(d => {
                    const isSel = selection?.kind === 'dock' && selection.id === d.id;
                    return (
                        <div
                            key={d.id}
                            onClick={() => select({kind: 'dock', id: d.id})}
                            className={`px-2 py-1.5 border-b border-slate-800 cursor-pointer text-xs hover:bg-slate-800 ${isSel ? 'bg-slate-800' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full" style={{background: DOCK_COLOR}}/>
                                <span className="font-medium">Dock</span>
                                <span className="text-slate-500 font-mono ml-auto">{d.id.slice(0, 6)}…</span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400 pl-4">{d.properties.name || '—'}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
