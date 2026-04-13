import {useStatus} from "../../hooks/useStatus.ts";
import {useSettings} from "../../hooks/useSettings.ts";
import {ESCStatus} from "../../types/ros.ts";
import {MOTOR_TEMP, tempFillClass, tempTone} from "./style.ts";

const settingFloat = (settings: Record<string, any>, key: string, fallback: number): number => {
    const raw = settings[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = parseFloat(String(raw));
    return Number.isFinite(n) ? n : fallback;
};

const MotorRow = ({
    name,
    esc,
    hotThreshold,
    isMow,
}: {
    name: string;
    esc: ESCStatus | undefined;
    hotThreshold: number;
    isMow?: boolean;
}) => {
    const temp = esc?.TemperatureMotor;
    const current = esc?.Current;
    const rpm = esc?.Rpm;
    const tone = tempTone(temp);
    const widthPct = temp === undefined ? 0 : Math.max(0, Math.min(100, (temp / hotThreshold) * 100));
    const highlight = isMow ? 'bg-sky-500/5 border-l-2 border-sky-500 px-2.5 py-1.5 rounded' : 'py-1.5';
    return (
        <div className={`grid items-center gap-3 text-sm ${highlight}`} style={{gridTemplateColumns: '64px 1fr auto auto'}}>
            <span className="font-semibold text-slate-100">{name}</span>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className={`h-full rounded-full ${tempFillClass(tone)}`} style={{width: `${widthPct}%`}}/>
            </div>
            <span className="font-mono text-xs text-slate-300 whitespace-nowrap">
                {temp !== undefined ? `${temp.toFixed(0)}°C` : '—'}
            </span>
            <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
                {current !== undefined ? `${current.toFixed(1)}A` : '—'}
                {isMow && rpm !== undefined ? ` · ${rpm} RPM` : ''}
            </span>
        </div>
    );
};

export const MotorHealthCard = () => {
    const status = useStatus();
    const {settings} = useSettings();
    const hot = settingFloat(settings, 'OM_MOWING_MOTOR_TEMP_HIGH', MOTOR_TEMP.hot);
    const cool = settingFloat(settings, 'OM_MOWING_MOTOR_TEMP_LOW', MOTOR_TEMP.cool);
    return (
        <div className="flex-1 min-w-[280px] rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="px-5 py-2.5 border-b border-slate-800 text-sm font-semibold text-slate-200">Motor Health</div>
            <div className="p-5">
                <div className="flex flex-col gap-2">
                    <MotorRow name="Left" esc={status.LeftEscStatus} hotThreshold={hot}/>
                    <MotorRow name="Right" esc={status.RightEscStatus} hotThreshold={hot}/>
                    <MotorRow name="Mow" esc={status.MowEscStatus} hotThreshold={hot} isMow/>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-500">
                    <span>Hot: <strong className="text-slate-200">{hot}°C</strong></span>
                    <span>Cool: <strong className="text-slate-200">{cool}°C</strong></span>
                </div>
            </div>
        </div>
    );
};
