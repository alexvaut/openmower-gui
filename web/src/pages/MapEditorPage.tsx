import './mapEditor.css';
import {useLayoutEffect, useRef, useState} from 'react';
import {ConfigProvider, theme} from 'antd';
import {AreaList} from '../components/mapEditor/AreaList';
import {Canvas} from '../components/mapEditor/Canvas';
import {PropertiesPanel} from '../components/mapEditor/PropertiesPanel';
import {TopBar} from '../components/mapEditor/TopBar';
import {useKeybindings} from '../components/mapEditor/useKeybindings';
import {useUnsavedGuard} from '../components/mapEditor/useUnsavedGuard';

export default function MapEditorPage() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [canvasSize, setCanvasSize] = useState({width: 0, height: 0});

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

    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {colorPrimary: '#0ea5e9', colorBgContainer: '#1e293b', colorBorder: '#334155'},
            }}
        >
            <div
                className="map-editor-root flex flex-col bg-slate-950 text-slate-100"
                style={{margin: '-10px -24px 0', height: 'calc(100% + 10px)', width: 'calc(100% + 48px)'}}
            >
                <TopBar canvasSize={canvasSize}/>
                <div className="flex flex-1 min-h-0">
                    <AreaList/>
                    <div ref={containerRef} className="flex-1 min-w-0 flex relative">
                        <Canvas/>
                    </div>
                    <PropertiesPanel/>
                </div>
            </div>
        </ConfigProvider>
    );
}
