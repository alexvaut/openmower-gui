import {Button, Dropdown, MenuProps, Modal, Select, Segmented, Switch, Tooltip, message} from 'antd';
import {useRef, useState} from 'react';
import {
    CloudDownloadOutlined,
    CloudUploadOutlined,
    DotChartOutlined,
    DownloadOutlined,
    DownOutlined,
    ExpandOutlined,
    MinusOutlined,
    PlusOutlined,
    RedoOutlined,
    UndoOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {useShallow} from 'zustand/react/shallow';
import {loadMapFromMower, saveMapToMower} from './api';
import {loadFromFile, mapToJsonBlob, parseMapJson, serializeMap, triggerDownload} from './io';
import type {Snap} from './types';
import {buildOriginalOutlineMap, validateMap} from './validity';
import {useMapEditorStore} from './useMapEditorStore';

export type ViewMode = 'edit' | 'live';

// Desktop map-editor controls. Rendered into the shared AppHeader's controls
// slot — so it intentionally has no header shell of its own (no fixed height,
// no background). The header container handles chrome; this component only
// supplies the page-specific buttons.
export function MapEditorControls({
    canvasSize,
    mode,
    onModeChange,
}: {
    canvasSize: {width: number; height: number};
    mode: ViewMode;
    onModeChange: (m: ViewMode) => void;
}) {
    const {
        filename, raw, map, dirty, snap, showPaths,
        loadParsed, markSaved, undo, redo, zoomBy, fit, setSnap, setShowPaths, canUndo, canRedo,
    } = useMapEditorStore(useShallow(s => ({
        filename: s.filename, raw: s.raw, map: s.map, dirty: s.dirty, snap: s.snap, showPaths: s.showPaths,
        loadParsed: s.loadParsed, markSaved: s.markSaved,
        undo: s.undo, redo: s.redo, zoomBy: s.zoomBy, fit: s.fit, setSnap: s.setSnap, setShowPaths: s.setShowPaths,
        canUndo: s.history.past.length > 0,
        canRedo: s.history.future.length > 0,
    })));

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [savingToMower, setSavingToMower] = useState(false);
    const [loadingFromMower, setLoadingFromMower] = useState(false);

    const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const parsed = await loadFromFile(file);
            loadParsed(parsed, file.name);
        } catch (err) {
            console.error(err);
            Modal.error({title: 'Load failed', content: err instanceof Error ? err.message : String(err)});
        } finally {
            e.target.value = '';
        }
    };

    // Validates the editor map. Returns true if safe to save, false if blocking
    // errors were surfaced to the user.
    const validateForSave = (): boolean => {
        if (!raw) return false;
        const orig = buildOriginalOutlineMap(raw.areas);
        const validity = validateMap(map, orig);
        if (!validity.ok) {
            const blocking = validity.errors.filter(e => !e.grandfathered);
            Modal.error({
                title: 'Cannot save — invalid polygons',
                content: `${blocking.length} edited polygon(s) are invalid:\n` +
                    blocking.slice(0, 5).map(e => `• ${e.areaId.slice(0, 8)}… — ${e.reason}`).join('\n'),
            });
            return false;
        }
        return true;
    };

    const handleSaveToFile = () => {
        if (!raw) return;
        if (!validateForSave()) return;
        const blob = mapToJsonBlob({raw, map});
        triggerDownload(blob, filename);
        markSaved();
    };

    const handleSaveToMower = () => {
        if (!raw) return;
        if (!validateForSave()) return;
        Modal.confirm({
            title: 'Save to mower?',
            content: 'This will overwrite the map currently on the robot. Make sure the mower is idle before saving.',
            okText: 'Save to mower',
            okButtonProps: {danger: true},
            onOk: async () => {
                setSavingToMower(true);
                try {
                    const json = JSON.stringify(serializeMap({raw, map}));
                    await saveMapToMower(json);
                    markSaved();
                    message.success('Map saved to mower');
                } catch (err) {
                    Modal.error({title: 'Save to mower failed', content: err instanceof Error ? err.message : String(err)});
                } finally {
                    setSavingToMower(false);
                }
            },
        });
    };

    const doLoadFromMower = async () => {
        setLoadingFromMower(true);
        try {
            const text = await loadMapFromMower();
            const parsed = parseMapJson(text);
            loadParsed(parsed, 'mower-map.json');
            message.success('Loaded map from mower');
        } catch (err) {
            Modal.error({title: 'Load from mower failed', content: err instanceof Error ? err.message : String(err)});
        } finally {
            setLoadingFromMower(false);
        }
    };

    const handleLoadFromMower = () => {
        if (dirty) {
            Modal.confirm({
                title: 'Discard unsaved changes?',
                content: 'You have unsaved edits. Loading from the mower will discard them.',
                okText: 'Discard and load',
                okButtonProps: {danger: true},
                onOk: doLoadFromMower,
            });
            return;
        }
        doLoadFromMower();
    };

    const loadMenu: MenuProps = {
        items: [
            {key: 'mower', label: 'Load from mower', icon: <CloudDownloadOutlined/>, onClick: handleLoadFromMower},
            {key: 'file', label: 'Load from file…', icon: <UploadOutlined/>, onClick: () => fileInputRef.current?.click()},
        ],
    };

    const saveMenu: MenuProps = {
        items: [
            {key: 'mower', label: 'Save to mower', icon: <CloudUploadOutlined/>, onClick: handleSaveToMower, disabled: !raw},
            {key: 'file', label: 'Save to file…', icon: <DownloadOutlined/>, onClick: handleSaveToFile, disabled: !raw},
        ],
    };

    const isEdit = mode === 'edit';
    return (
        <>
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
                    <Dropdown menu={loadMenu} trigger={['click']}>
                        <Button size="small" icon={<UploadOutlined/>} loading={loadingFromMower}>
                            Load <DownOutlined/>
                        </Button>
                    </Dropdown>
                    <Dropdown menu={saveMenu} trigger={['click']} disabled={!raw}>
                        <Button size="small" type="primary" icon={<DownloadOutlined/>} disabled={!raw} loading={savingToMower}>
                            Save{dirty ? ' ●' : ''} <DownOutlined/>
                        </Button>
                    </Dropdown>
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
                    <Tooltip title="Show robot paths (mowing path, planned coverage, active nav plan)">
                        <span className="inline-flex items-center gap-1 ml-2">
                            <DotChartOutlined style={{color: showPaths ? '#0ea5e9' : '#64748b'}}/>
                            <Switch size="small" checked={showPaths} onChange={setShowPaths}/>
                        </span>
                    </Tooltip>
                    <div className="text-xs text-slate-400 ml-2 truncate">{filename}{dirty ? ' — modified' : ''}</div>
                </>
            )}
            {!isEdit && (
                <span className="text-xs text-slate-500 whitespace-nowrap">Satellite + live telemetry (read-only)</span>
            )}
        </>
    );
}
