import './mapEditor.css';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Button, ConfigProvider, theme} from 'antd';
import {SettingOutlined} from '@ant-design/icons';
import {AreaList} from '../components/mapEditor/AreaList';
import {Canvas} from '../components/mapEditor/Canvas';
import {MapboxLiveView} from '../components/mapEditor/MapboxLiveView';
import {PropertiesPanel} from '../components/mapEditor/PropertiesPanel';
import {MapEditorControls, ViewMode} from '../components/mapEditor/TopBar';
import {useKeybindings} from '../components/mapEditor/useKeybindings';
import {useUnsavedGuard} from '../components/mapEditor/useUnsavedGuard';
import {ParametersPanel} from '../components/map/ParametersPanel';
import {SensorLogProvider} from '../components/map/SensorLogContext';
import {LiveControlsPanel} from '../components/map/LiveControlsPanel';
import {PageChrome} from '../components/PageChrome';

const MOBILE_MQ = '(max-width: 1023px)';

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
    );
    useEffect(() => {
        const mql = window.matchMedia(MOBILE_MQ);
        const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);
    return isMobile;
}

export default function MapEditorPage() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [canvasSize, setCanvasSize] = useState({width: 0, height: 0});
    const [mode, setMode] = useState<ViewMode>('live');
    const isMobile = useIsMobile();
    const [rightOpen, setRightOpen] = useState(false);

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const cr = entries[0].contentRect;
            setCanvasSize({width: cr.width, height: cr.height});
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useKeybindings(canvasSize);
    useUnsavedGuard();

    // Map editing is not usable on phones — always run in live view when mobile.
    useEffect(() => {
        if (isMobile && mode !== 'live') setMode('live');
    }, [isMobile, mode]);

    const isLive = mode === 'live';
    const rightDrawerOpen = isMobile && rightOpen;

    const controls = isMobile
        ? (
            <Button
                size="small"
                icon={<SettingOutlined/>}
                onClick={() => setRightOpen(v => !v)}
                aria-label="Toggle controls"
            />
        )
        : (
            <MapEditorControls canvasSize={canvasSize} mode={mode} onModeChange={setMode}/>
        );

    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {colorPrimary: '#0ea5e9', colorBgContainer: '#1e293b', colorBorder: '#334155'},
            }}
        >
            <SensorLogProvider>
                <PageChrome title="Map">{controls}</PageChrome>
                <div
                    className="map-editor-root flex flex-col bg-slate-950 text-slate-100 relative"
                    style={{margin: '-10px -24px 0', height: 'calc(100% + 10px)', width: 'calc(100% + 48px)'}}
                >
                    <div className="flex flex-1 min-h-0 relative overflow-hidden">
                        {!isLive && (
                            <div className="map-editor-drawer map-editor-drawer-left">
                                <AreaList/>
                            </div>
                        )}
                        <div ref={containerRef} className="flex-1 min-w-0 flex relative">
                            {isLive ? <MapboxLiveView/> : <Canvas/>}
                        </div>
                        <div className={`map-editor-drawer map-editor-drawer-right ${rightDrawerOpen ? 'is-open' : ''}`}>
                            {isMobile && rightDrawerOpen && (
                                <button
                                    type="button"
                                    className="drawer-close-btn"
                                    aria-label="Close"
                                    onClick={() => setRightOpen(false)}
                                >×</button>
                            )}
                            {isLive ? <LiveControlsPanel/> : <PropertiesPanel/>}
                        </div>
                        {rightDrawerOpen && (
                            <div className="map-editor-backdrop" onClick={() => setRightOpen(false)}/>
                        )}
                    </div>
                    <ParametersPanel initiallyOpen={false}/>
                </div>
            </SensorLogProvider>
        </ConfigProvider>
    );
}
