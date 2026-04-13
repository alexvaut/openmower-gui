import {Alert, Button, InputNumber, Popconfirm, Radio, Slider, Space} from 'antd';
import {useMemo} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {fitToBounds} from './coords';
import {polygonArea, polygonBounds, rdp} from './geometry';
import {AREA_STYLE} from './style';
import type {AreaType, Point} from './types';
import {useMapEditorStore} from './useMapEditorStore';
import {buildOriginalOutlineMap, validateArea, validateMap} from './validity';

const SIMPLIFY_EPS = 0.05;

function AreaPanel({areaId}: {areaId: string}) {
    const {area, originalOutline, setAreaType, reverseWinding, simplifyArea, duplicateArea, deleteArea} = useMapEditorStore(
        useShallow(s => ({
            area: s.map.areas.find(a => a.id === areaId),
            originalOutline: s.raw?.areas.find(a => a.id === areaId)?.outline as Point[] | undefined,
            setAreaType: s.setAreaType,
            reverseWinding: s.reverseWinding,
            simplifyArea: s.simplifyArea,
            duplicateArea: s.duplicateArea,
            deleteArea: s.deleteArea,
        })),
    );
    const issue = useMemo(() => (area ? validateArea(area) : null), [area]);
    const grandfathered = useMemo(() => {
        if (!issue || !area || !originalOutline) return false;
        if (area.outline.length !== originalOutline.length) return false;
        for (let i = 0; i < area.outline.length; i++) {
            if (area.outline[i].x !== originalOutline[i].x) return false;
            if (area.outline[i].y !== originalOutline[i].y) return false;
        }
        return true;
    }, [issue, area, originalOutline]);
    const simplifiedCount = useMemo(() => (area ? rdp(area.outline, SIMPLIFY_EPS).length : 0), [area]);
    if (!area) return null;
    const stroke = AREA_STYLE[area.properties.type].stroke;
    const bounds = polygonBounds(area.outline);
    const areaM2 = Math.abs(polygonArea(area.outline));
    const winding = polygonArea(area.outline) > 0 ? 'CCW' : 'CW';
    return (
        <div className="flex flex-col gap-3 text-slate-200 text-sm">
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Area</div>
                <div className="font-mono text-[11px] text-slate-500 break-all">{area.id}</div>
            </div>
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Type</div>
                <Radio.Group
                    size="small"
                    value={area.properties.type}
                    onChange={e => setAreaType(area.id, e.target.value as AreaType)}
                >
                    <Radio.Button value="mow">Mow</Radio.Button>
                    <Radio.Button value="obstacle">Obstacle</Radio.Button>
                    <Radio.Button value="nav">Nav</Radio.Button>
                </Radio.Group>
            </div>
            {issue && (
                <Alert
                    type={grandfathered ? 'warning' : 'error'}
                    showIcon
                    message={grandfathered ? `Original is ${issue} (save not blocked)` : `Invalid: ${issue}`}
                />
            )}
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Geometry</div>
                <div className="text-xs text-slate-300 font-mono">
                    {area.outline.length} points • {areaM2.toFixed(2)} m² • {winding}
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    x {bounds.minX.toFixed(2)} → {bounds.maxX.toFixed(2)}<br/>
                    y {bounds.minY.toFixed(2)} → {bounds.maxY.toFixed(2)}
                </div>
            </div>
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Tools</div>
                <Space direction="vertical" style={{width: '100%'}} size={4}>
                    <Button
                        size="small"
                        disabled={area.outline.length <= 4 || simplifiedCount >= area.outline.length}
                        onClick={() => simplifyArea(area.id, SIMPLIFY_EPS)}
                        block
                    >
                        Simplify ({area.outline.length} → {simplifiedCount})
                    </Button>
                    <Button size="small" onClick={() => reverseWinding(area.id)} block>
                        Reverse winding
                    </Button>
                    <Button size="small" onClick={() => duplicateArea(area.id)} block style={{borderColor: stroke}}>
                        Duplicate
                    </Button>
                </Space>
            </div>
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Danger zone</div>
                <Popconfirm title="Delete this polygon?" onConfirm={() => deleteArea(area.id)} okText="Delete" okButtonProps={{danger: true}}>
                    <Button size="small" danger block>Delete polygon</Button>
                </Popconfirm>
            </div>
        </div>
    );
}

function DockPanel({dockId}: {dockId: string}) {
    const {dock, setDockName, setDockPosition, setDockHeading, deleteDock} = useMapEditorStore(
        useShallow(s => ({
            dock: s.map.docking_stations.find(d => d.id === dockId),
            setDockName: s.setDockName,
            setDockPosition: s.setDockPosition,
            setDockHeading: s.setDockHeading,
            deleteDock: s.deleteDock,
        })),
    );
    if (!dock) return null;
    const headingDeg = (dock.heading * 180) / Math.PI;
    return (
        <div className="flex flex-col gap-3 text-slate-200 text-sm">
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Docking station</div>
                <div className="font-mono text-[11px] text-slate-500 break-all">{dock.id}</div>
            </div>
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Name</div>
                <input
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
                    value={dock.properties.name}
                    onChange={e => setDockName(dock.id, e.target.value)}
                />
            </div>
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Position</div>
                <div className="flex gap-2">
                    <InputNumber size="small" value={dock.position.x} step={0.01} style={{width: '50%'}}
                                 onChange={v => typeof v === 'number' && setDockPosition(dock.id, {x: v, y: dock.position.y})}
                                 addonBefore="x"/>
                    <InputNumber size="small" value={dock.position.y} step={0.01} style={{width: '50%'}}
                                 onChange={v => typeof v === 'number' && setDockPosition(dock.id, {x: dock.position.x, y: v})}
                                 addonBefore="y"/>
                </div>
            </div>
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Heading</div>
                <div className="flex gap-2 items-center">
                    <Slider
                        min={-180}
                        max={180}
                        value={headingDeg}
                        onChange={v => setDockHeading(dock.id, (v * Math.PI) / 180)}
                        style={{flex: 1}}
                    />
                    <InputNumber
                        size="small"
                        value={Number(headingDeg.toFixed(1))}
                        min={-180}
                        max={180}
                        onChange={v => typeof v === 'number' && setDockHeading(dock.id, (v * Math.PI) / 180)}
                        style={{width: 80}}
                        addonAfter="°"
                    />
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Drag the outer dot on the map to rotate.</div>
            </div>
            <div>
                <div className="text-xs uppercase text-slate-400 mb-1">Danger zone</div>
                <Popconfirm title="Delete this dock?" onConfirm={() => deleteDock(dock.id)} okText="Delete" okButtonProps={{danger: true}}>
                    <Button size="small" danger block>Delete dock</Button>
                </Popconfirm>
            </div>
        </div>
    );
}

function DrawingPanel() {
    const {mode, drawing, finishDrawArea, cancelDraw} = useMapEditorStore(
        useShallow(s => ({mode: s.mode, drawing: s.drawing, finishDrawArea: s.finishDrawArea, cancelDraw: s.cancelDraw})),
    );
    if (mode === 'draw-area' && drawing) {
        return (
            <div className="flex flex-col gap-3 text-slate-200 text-sm">
                <div className="text-xs uppercase text-slate-400">Drawing {drawing.type}</div>
                <div className="text-sm">{drawing.points.length} points
                    {drawing.points.length < 3 && <span className="text-amber-400"> (need at least 3)</span>}
                </div>
                <Space direction="vertical" size={4}>
                    <Button size="small" type="primary" disabled={drawing.points.length < 3} onClick={() => finishDrawArea()} block>
                        Finish (Enter)
                    </Button>
                    <Button size="small" onClick={cancelDraw} block>Cancel (Esc)</Button>
                </Space>
            </div>
        );
    }
    if (mode === 'draw-dock') {
        return (
            <div className="flex flex-col gap-3 text-slate-200 text-sm">
                <div className="text-xs uppercase text-slate-400">Placing dock</div>
                <div className="text-sm">Click on the canvas to place.</div>
                <Button size="small" onClick={cancelDraw} block>Cancel (Esc)</Button>
            </div>
        );
    }
    return null;
}

function ValidityBanner() {
    const {map, raw, select, setView} = useMapEditorStore(useShallow(s => ({
        map: s.map,
        raw: s.raw,
        select: s.select,
        setView: s.setView,
    })));
    const orig = useMemo(() => raw ? buildOriginalOutlineMap(raw.areas) : undefined, [raw]);
    const result = useMemo(() => validateMap(map, orig), [map, orig]);
    if (result.errors.length === 0) return null;
    const blocking = result.errors.filter(e => !e.grandfathered);
    const grandfathered = result.errors.length - blocking.length;

    const focus = (areaId: string) => {
        const area = map.areas.find(a => a.id === areaId);
        if (!area) return;
        select({kind: 'area', id: areaId});
        const b = polygonBounds(area.outline);
        const view = fitToBounds(b, 600, 400, 20);
        setView({cx: view.cx, cy: view.cy, zoom: Math.min(view.zoom, 80)});
    };

    return (
        <Alert
            type={blocking.length > 0 ? 'error' : 'warning'}
            showIcon
            style={{marginBottom: 12}}
            message={blocking.length > 0
                ? `${blocking.length} edited polygon${blocking.length === 1 ? '' : 's'} invalid — save blocked`
                : `${grandfathered} original polygon${grandfathered === 1 ? '' : 's'} invalid (save allowed)`}
            description={
                <ul className="text-xs m-0 pl-4 list-disc">
                    {result.errors.slice(0, 8).map(e => (
                        <li key={e.areaId}>
                            <a
                                className="font-mono underline decoration-dotted cursor-pointer"
                                onClick={() => focus(e.areaId)}
                            >
                                {e.areaId.slice(0, 8)}…
                            </a>
                            <span> — {e.reason}</span>
                            {e.grandfathered && <span className="text-slate-400"> (original)</span>}
                        </li>
                    ))}
                    {result.errors.length > 8 && <li>…and {result.errors.length - 8} more</li>}
                </ul>
            }
        />
    );
}

function EmptyHint() {
    return (
        <div className="text-slate-400 text-sm leading-relaxed">
            <div className="text-xs uppercase text-slate-500 mb-2">Select something</div>
            <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>Click a polygon or dock to select it.</li>
                <li>Click a handle to drag a point.</li>
                <li>Click on the ghost dot (on the edge of a selected polygon) to insert a point.</li>
                <li>Alt+click a point handle to delete it (when &gt; 3 points remain).</li>
                <li>Middle-click or Space+drag to pan.</li>
                <li>Mouse wheel to zoom.</li>
            </ul>
        </div>
    );
}

export function PropertiesPanel() {
    const {selection, mode} = useMapEditorStore(useShallow(s => ({selection: s.selection, mode: s.mode})));
    return (
        <div className="w-72 shrink-0 h-full bg-slate-900 border-l border-slate-800 overflow-y-auto">
            <div className="p-3">
                <ValidityBanner/>
                {mode !== 'edit' && <DrawingPanel/>}
                {mode === 'edit' && selection?.kind === 'area' && <AreaPanel areaId={selection.id}/>}
                {mode === 'edit' && selection?.kind === 'dock' && <DockPanel dockId={selection.id}/>}
                {mode === 'edit' && !selection && <EmptyHint/>}
            </div>
        </div>
    );
}
