import {useState} from 'react';
import {Button, Select, Slider, Tooltip} from 'antd';
import {
    PauseOutlined, CaretRightOutlined, PoweroffOutlined,
    BackwardOutlined, ForwardOutlined,
} from '@ant-design/icons';
import {useHighLevelStatus} from '../../hooks/useHighLevelStatus';
import {useMowerLogicParams} from '../../hooks/useMowerLogicParams';
import {useMowerAction} from '../../hooks/useMowerAction';
import {useApi} from '../../hooks/useApi';
import {
    ColorProfile, ColorProfileLabels, SensorType, SensorTypeLabels,
    TimeRange, TimeRangePresets, colorProfileGradient,
} from '../../types/sensorlog';
import {useSharedSensorLog} from './SensorLogContext';

// The right-panel Live controls. Same visual language as the State page's
// Vitals cards (slate-900 sections, uppercase 11px headings). Mirrors the
// commands that used to sit above the map in the old /map chrome.

const SectionHeading = ({children}: {children: string}) => (
    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">{children}</div>
);

const Section = ({title, children}: {title: string; children: React.ReactNode}) => (
    <div className="mb-4">
        <SectionHeading>{title}</SectionHeading>
        <div className="flex flex-col gap-2">{children}</div>
    </div>
);

const SliderRow = ({label, value, min, max, step, onChange}: {
    label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) => (
    <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 w-14 shrink-0">{label}</span>
        <Slider className="flex-1" min={min} max={max} step={step} value={value} onChange={onChange}/>
        <span className="text-xs font-mono text-slate-400 w-10 text-right">{value}</span>
    </div>
);

const ActionsSection = () => {
    const {highLevelStatus} = useHighLevelStatus();
    const params = useMowerLogicParams();
    const mowerAction = useMowerAction();
    const api = useApi();
    const stateName = highLevelStatus.StateName;
    const isIdle = stateName === 'IDLE';
    const isEmergency = !!highLevelStatus.Emergency;
    const manualPause = !!params.manual_pause_mowing;
    const [skipN, setSkipN] = useState(10);

    const sendAction = async (action: string) => {
        const res = await api.openmower.actionCreate(action);
        if (res.error) throw new Error(res.error.error);
    };

    const pauseOrContinue = async () => {
        if (manualPause) {
            await mowerAction('mower_logic', {Config: {Bools: [{Name: 'manual_pause_mowing', Value: false}]}})();
            await mowerAction('high_level_control', {Command: 1})();
        } else {
            await mowerAction('mower_logic', {Config: {Bools: [{Name: 'manual_pause_mowing', Value: true}]}})();
        }
    };

    return (
        <Section title="Mower">
            {isIdle ? (
                <Button block type="primary" size="small"
                        onClick={mowerAction('high_level_control', {Command: 1})}>Start</Button>
            ) : (
                <Button block type="primary" size="small"
                        onClick={mowerAction('high_level_control', {Command: 2})}>Home</Button>
            )}
            {isEmergency ? (
                <Button block danger size="small"
                        onClick={mowerAction('emergency', {Emergency: 0})}>Emergency Off</Button>
            ) : (
                <Button block danger size="small"
                        onClick={mowerAction('emergency', {Emergency: 1})}>Emergency On</Button>
            )}
            <Button block size="small"
                    icon={manualPause ? <CaretRightOutlined/> : <PauseOutlined/>}
                    onClick={pauseOrContinue}>
                {manualPause ? 'Continue' : 'Pause'}
            </Button>

            <div className="flex items-center gap-2 mt-1">
                <Slider className="flex-1" min={10} max={1000} step={10} value={skipN} onChange={setSkipN}/>
                <span className="text-xs font-mono text-slate-400 w-10 text-right">{skipN}</span>
            </div>
            <Button block size="small" onClick={() => sendAction(`mower_logic:mowing/skip_points/${skipN}`)}>
                Skip {skipN} Points
            </Button>
            <Button block size="small" onClick={() => sendAction('mower_logic:mowing/skip_path')}>
                Skip Path
            </Button>
            <Button block size="small" onClick={() => sendAction('mower_logic:mowing/skip_area')}>
                Skip Area
            </Button>
            <div className="flex gap-1">
                <Tooltip title="Blade reverse">
                    <Button className="flex-1" size="small" icon={<BackwardOutlined/>}
                            onClick={mowerAction('mow_enabled', {MowEnabled: 1, MowDirection: 1})}/>
                </Tooltip>
                <Tooltip title="Blade forward">
                    <Button className="flex-1" size="small" icon={<ForwardOutlined/>}
                            onClick={mowerAction('mow_enabled', {MowEnabled: 1, MowDirection: 0})}/>
                </Tooltip>
                <Tooltip title="Blade off">
                    <Button className="flex-1" danger size="small" icon={<PoweroffOutlined/>}
                            onClick={mowerAction('mow_enabled', {MowEnabled: 0, MowDirection: 0})}/>
                </Tooltip>
            </div>
        </Section>
    );
};

const SensorSection = () => {
    const sensorLog = useSharedSensorLog();
    return (
        <Section title="Sensor Data">
            <Button
                block
                size="small"
                type={sensorLog.visible ? 'primary' : 'default'}
                loading={sensorLog.loading}
                onClick={() => sensorLog.setVisible(!sensorLog.visible)}
            >
                {sensorLog.visible ? 'Hide overlay' : 'Show overlay'}
            </Button>
            <Select
                size="small"
                value={sensorLog.sensorType}
                onChange={(v: SensorType) => sensorLog.setSensorType(v)}
                options={(Object.keys(SensorTypeLabels) as SensorType[]).map(k => ({label: SensorTypeLabels[k], value: k}))}
                style={{width: '100%'}}
            />
            <Select
                size="small"
                value={sensorLog.timeRange}
                onChange={(v: TimeRange) => sensorLog.setTimeRange(v)}
                options={(Object.keys(TimeRangePresets) as TimeRange[])
                    // 'graph' is only meaningful when a zoom-driven custom range exists;
                    // it's not user-pickable otherwise.
                    .filter(k => k !== 'graph' || !!sensorLog.customRange)
                    .map(k => {
                        if (k === 'graph' && sensorLog.customRange) {
                            const fmt = (ts: number) => {
                                const d = new Date(ts * 1000);
                                const pad = (n: number) => n.toString().padStart(2, '0');
                                return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                            };
                            return {label: `Graph · ${fmt(sensorLog.customRange.from)} → ${fmt(sensorLog.customRange.to)}`, value: k};
                        }
                        return {label: TimeRangePresets[k].label, value: k};
                    })}
                style={{width: '100%'}}
            />
            <Select
                size="small"
                value={sensorLog.colorProfile}
                onChange={(v: ColorProfile) => sensorLog.setColorProfile(v)}
                options={(Object.keys(ColorProfileLabels) as ColorProfile[]).map(k => ({label: ColorProfileLabels[k], value: k}))}
                style={{width: '100%'}}
            />
            <div className="flex flex-col gap-1 mt-1">
                <SliderRow label="Size" value={sensorLog.pointSize} min={1} max={20} step={1} onChange={sensorLog.setPointSize}/>
                <SliderRow label="Blur" value={sensorLog.pointBlur} min={0} max={2} step={0.1} onChange={sensorLog.setPointBlur}/>
                <SliderRow label="Opacity" value={sensorLog.opacity} min={0.1} max={1} step={0.1} onChange={sensorLog.setOpacity}/>
            </div>
            {sensorLog.visible && sensorLog.data && sensorLog.data.count > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                        {SensorTypeLabels[sensorLog.sensorType]} · {sensorLog.data.count} pts
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-slate-400">{sensorLog.data.min.toFixed(1)}</span>
                        <div className="flex-1 h-2.5 rounded" style={{background: colorProfileGradient(sensorLog.colorProfile)}}/>
                        <span className="text-slate-400">{sensorLog.data.max.toFixed(1)}</span>
                    </div>
                </div>
            )}
        </Section>
    );
};

export function LiveControlsPanel() {
    return (
        <div className="w-72 shrink-0 h-full bg-slate-900 border-l border-slate-800 overflow-y-auto">
            <div className="p-3">
                <ActionsSection/>
                <SensorSection/>
            </div>
        </div>
    );
}

export default LiveControlsPanel;
