import './mapEditor.css';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Button, ConfigProvider, theme, Tooltip} from 'antd';
import {CloseOutlined, ControlOutlined, SettingOutlined} from '@ant-design/icons';
import {Joystick} from 'react-joystick-component';
import {IJoystickUpdateEvent} from 'react-joystick-component/build/lib/Joystick';
import {useWS} from '../hooks/useWS';
import {Twist} from '../types/ros';
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
const MAX_DRIVE_SPEED = 1.0; // m/s — full-stick forward/back
// Higher than linear so in-place rotation clears the diff-drive wheel deadband:
// with wheel_base ~0.3m, angular=1 rad/s is only ±0.15 m/s per wheel, below the
// ESC's start-up threshold, so the robot won't spin without any linear command.
const MAX_DRIVE_ANGULAR = 2.5; // rad/s — full-stick left/right

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
    const [driveMode, setDriveMode] = useState(false);
    const [currentSpeed, setCurrentSpeed] = useState(0);

    const joyStream = useWS<string>(() => {}, () => {}, () => {});

    useEffect(() => {
        if (driveMode && mode === 'live') {
            joyStream.start('/api/openmower/publish/override');
        } else {
            joyStream.stop();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [driveMode, mode]);

    useEffect(() => () => joyStream.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleJoyMove = (event: IJoystickUpdateEvent) => {
        const y = event.y ?? 0;
        const x = event.x ?? 0;
        const msg: Twist = {
            Linear: {X: y * MAX_DRIVE_SPEED, Y: 0, Z: 0},
            Angular: {Z: -x * MAX_DRIVE_ANGULAR, X: 0, Y: 0},
        };
        joyStream.sendJsonMessage(msg);
        setCurrentSpeed(Math.abs(y * MAX_DRIVE_SPEED));
    };

    const handleJoyStop = () => {
        joyStream.sendJsonMessage({Linear: {X: 0, Y: 0, Z: 0}, Angular: {Z: 0, X: 0, Y: 0}});
        setCurrentSpeed(0);
    };

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
                            {isLive && (
                                <div style={{position: 'absolute', bottom: 24, right: 24, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12}}>
                                    {driveMode && (
                                        <div style={{
                                            background: 'rgba(15, 23, 42, 0.88)',
                                            backdropFilter: 'blur(10px)',
                                            borderRadius: 16,
                                            padding: '14px 18px',
                                            border: '1px solid rgba(14, 165, 233, 0.35)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 12,
                                        }}>
                                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                                                <span style={{color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em'}}>Drive</span>
                                                <span style={{color: '#0ea5e9', fontSize: 10, fontWeight: 500}}>OVERRIDE</span>
                                            </div>
                                            <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, width: 160}}>
                                                <span style={{color: '#e2e8f0', fontSize: 22, fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, monospace', minWidth: 54, textAlign: 'right'}}>
                                                    {currentSpeed.toFixed(2)}
                                                </span>
                                                <span style={{color: '#64748b', fontSize: 11, fontWeight: 500}}>m/s</span>
                                            </div>
                                            <Joystick
                                                size={130}
                                                baseColor="rgba(30, 41, 59, 0.9)"
                                                stickColor="#0ea5e9"
                                                move={handleJoyMove}
                                                stop={handleJoyStop}
                                            />
                                        </div>
                                    )}
                                    <Tooltip title={driveMode ? 'Close drive controls' : 'Drive robot'} placement="left">
                                        <Button
                                            type={driveMode ? 'primary' : 'default'}
                                            icon={driveMode ? <CloseOutlined/> : <ControlOutlined/>}
                                            shape="circle"
                                            size="large"
                                            style={{
                                                width: 48,
                                                height: 48,
                                                fontSize: 18,
                                                background: driveMode ? '#0ea5e9' : 'rgba(15, 23, 42, 0.85)',
                                                borderColor: driveMode ? '#0ea5e9' : 'rgba(14, 165, 233, 0.4)',
                                                backdropFilter: 'blur(8px)',
                                                boxShadow: driveMode ? '0 0 16px rgba(14,165,233,0.4)' : 'none',
                                            }}
                                            onClick={() => setDriveMode(v => !v)}
                                        />
                                    </Tooltip>
                                </div>
                            )}
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
