import {Button, Segmented, Select, Tooltip} from 'antd';
import {useRef} from 'react';
import {
    DownloadOutlined,
    ExpandOutlined,
    MinusOutlined,
    PlusOutlined,
    RedoOutlined,
    UndoOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {useShallow} from 'zustand/react/shallow';
import {loadFromFile, mapToJsonBlob, triggerDownload} from './io';
import type {Snap} from './types';
import {buildOriginalOutlineMap, validateMap} from './validity';
import {useMapEditorStore} from './useMapEditorStore';

export type ViewMode = 'edit' | 'live';

export function TopBar({
    canvasSize,
    mode,
    onModeChange,
}: {
    canvasSize: {width: number; height: number};
    mode: ViewMode;
    onModeChange: (m: ViewMode) => void;
}) {
    const {
        filename, raw, map, dirty, snap,
        loadParsed, markSaved, undo, redo, zoomBy, fit, setSnap, canUndo, canRedo,
    } = useMapEditorStore(useShallow(s => ({
        filename: s.filename, raw: s.raw, map: s.map, dirty: s.dirty, snap: s.snap,
        loadParsed: s.loadParsed, markSaved: s.markSaved,
        undo: s.undo, redo: s.redo, zoomBy: s.zoomBy, fit: s.fit, setSnap: s.setSnap,
        canUndo: s.history.past.length > 0,
        canRedo: s.history.future.length > 0,
    })));

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const parsed = await loadFromFile(file);
            loadParsed(parsed, file.name);
        } catch (err) {
            console.error(err);
            alert(`Failed to load: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            e.target.value = '';
        }
    };

    const handleSave = () => {
        if (!raw) return;
        const orig = buildOriginalOutlineMap(raw.areas);
        const validity = validateMap(map, orig);
        if (!validity.ok) {
            const blocking = validity.errors.filter(e => !e.grandfathered);
            alert(`Cannot save — ${blocking.length} edited polygon(s) are invalid:\n` +
                blocking.slice(0, 5).map(e => `• ${e.areaId.slice(0, 8)}… — ${e.reason}`).join('\n'));
            return;
        }
        const blob = mapToJsonBlob({raw, map});
        triggerDownload(blob, filename);
        markSaved();
    };

    const isEdit = mode === 'edit';
    return (
        <div className="h-12 shrink-0 flex items-center px-3 gap-2 bg-slate-900 border-b border-slate-800 text-slate-100">
            <div className="text-sm font-semibold mr-2">Map</div>
            <Segmented
                size="small"
                value={mode}
                onChange={v => onModeChange(v as ViewMode)}
                options={[
                    {label: 'Edit', value: 'edit'},
                    {label: 'Live', value: 'live'},
                ]}
            />
            <div className="w-px h-6 bg-slate-700 mx-1"/>
            {isEdit && (
                <>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        style={{display: 'none'}}
                        onChange={handleFilePick}
                    />
                    <Button size="small" icon={<UploadOutlined/>} onClick={() => fileInputRef.current?.click()}>
                        Load
                    </Button>
                    <Button
                        size="small"
                        type="primary"
                        icon={<DownloadOutlined/>}
                        disabled={!raw}
                        onClick={handleSave}
                    >
                        Save{dirty ? ' ●' : ''}
                    </Button>
                    <div className="w-px h-6 bg-slate-700 mx-1"/>
                    <Tooltip title="Undo (Ctrl+Z)">
                        <Button size="small" icon={<UndoOutlined/>} disabled={!canUndo} onClick={undo}/>
                    </Tooltip>
                    <Tooltip title="Redo (Ctrl+Shift+Z)">
                        <Button size="small" icon={<RedoOutlined/>} disabled={!canRedo} onClick={redo}/>
                    </Tooltip>
                    <div className="w-px h-6 bg-slate-700 mx-1"/>
                    <Tooltip title="Fit to view (F)">
                        <Button size="small" icon={<ExpandOutlined/>} onClick={() => fit(canvasSize.width, canvasSize.height)}/>
                    </Tooltip>
                    <Tooltip title="Zoom in (+)">
                        <Button size="small" icon={<PlusOutlined/>} onClick={() => zoomBy(1.2)}/>
                    </Tooltip>
                    <Tooltip title="Zoom out (−)">
                        <Button size="small" icon={<MinusOutlined/>} onClick={() => zoomBy(1 / 1.2)}/>
                    </Tooltip>
                    <div className="w-px h-6 bg-slate-700 mx-1"/>
                    <Tooltip title="Snap to grid">
                        <Select
                            size="small"
                            value={snap}
                            onChange={v => setSnap(v as Snap)}
                            style={{width: 100}}
                            options={[
                                {label: 'No snap', value: 0},
                                {label: 'Snap 0.1 m', value: 0.1},
                                {label: 'Snap 0.5 m', value: 0.5},
                                {label: 'Snap 1 m', value: 1},
                            ]}
                        />
                    </Tooltip>
                </>
            )}
            {!isEdit && (
                <span className="text-xs text-slate-500">Satellite + live telemetry (read-only)</span>
            )}
            <div className="flex-1"/>
            <div className="text-xs text-slate-400">{filename}{isEdit && dirty ? ' — modified' : ''}</div>
        </div>
    );
}
