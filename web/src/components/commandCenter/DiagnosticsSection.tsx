import {useState} from "react";
import {useStatus} from "../../hooks/useStatus.ts";
import {useImu} from "../../hooks/useImu.ts";
import {useGPS} from "../../hooks/useGPS.ts";
import {useWheelTicks} from "../../hooks/useWheelTicks.ts";
import {AbsolutePoseFlags as Flags, ESCStatus} from "../../types/ros.ts";

const Row = ({label, value, color}: {label: string; value: string | number | undefined; color?: string}) => (
    <tr>
        <td className="text-xs text-slate-500 py-1 align-top w-2/5">{label}</td>
        <td className={`text-right font-mono text-xs py-1 ${color ?? 'text-slate-100'}`}>
            {value === undefined || value === '' ? '—' : value}
        </td>
    </tr>
);

const SubCard = ({title, children}: {title: string; children: React.ReactNode}) => (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
        <div className="px-4 py-2 border-b border-slate-800 text-xs font-semibold text-slate-300">{title}</div>
        <div className="p-4">
            <table className="w-full">
                <tbody>{children}</tbody>
            </table>
        </div>
    </div>
);

const EscCard = ({title, esc}: {title: string; esc: ESCStatus | undefined}) => (
    <SubCard title={title}>
        <Row label="Status" value={esc?.Status}/>
        <Row label="Current" value={esc?.Current !== undefined ? `${esc.Current.toFixed(2)} A` : undefined}/>
        <Row label="Tacho" value={esc?.Tacho}/>
        <Row label="RPM" value={esc?.Rpm}/>
        <Row label="Motor Temp" value={esc?.TemperatureMotor !== undefined ? `${esc.TemperatureMotor.toFixed(1)} °C` : undefined}/>
        <Row label="PCB Temp" value={esc?.TemperaturePcb !== undefined ? `${esc.TemperaturePcb.toFixed(1)} °C` : undefined}/>
    </SubCard>
);

const ImuCard = () => {
    const imu = useImu();
    const fmt = (v: number | undefined) => v === undefined ? '—' : v.toFixed(3);
    const Group = ({title, x, y, z}: {title: string; x?: number; y?: number; z?: number}) => {
        const axes: [string, number | undefined][] = [['X', x], ['Y', y], ['Z', z]];
        return (
            <>
                <tr><td colSpan={2} className="pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500">{title}</td></tr>
                <tr>
                    <td colSpan={2}>
                        <div className="grid grid-cols-3 gap-2">
                            {axes.map(([l, v]) => (
                                <div key={l} className="flex flex-col gap-0.5">
                                    <span className="text-[11px] text-slate-500">{l}</span>
                                    <span className="font-mono text-xs text-slate-100">{fmt(v)}</span>
                                </div>
                            ))}
                        </div>
                    </td>
                </tr>
            </>
        );
    };
    return (
        <SubCard title="IMU">
            <Group title="Angular Velocity (rad/s)" x={imu.AngularVelocity?.X} y={imu.AngularVelocity?.Y} z={imu.AngularVelocity?.Z}/>
            <Group title="Linear Acceleration (m/s²)" x={imu.LinearAcceleration?.X} y={imu.LinearAcceleration?.Y} z={imu.LinearAcceleration?.Z}/>
            <Group title="Orientation (quat)" x={imu.Orientation?.X} y={imu.Orientation?.Y} z={imu.Orientation?.Z}/>
        </SubCard>
    );
};

const WheelTicksCard = () => {
    const t = useWheelTicks();
    const dir = (v: number | undefined) => v === undefined ? undefined : v === 0 ? 'FWD' : 'REV';
    return (
        <SubCard title="Wheel Ticks">
            <Row label="Rear Left" value={t.WheelTicksRl}/>
            <Row label="Rear Left Direction" value={dir(t.WheelDirectionRl)}/>
            <Row label="Rear Right" value={t.WheelTicksRr}/>
            <Row label="Rear Right Direction" value={dir(t.WheelDirectionRr)}/>
        </SubCard>
    );
};

const GpsRawCard = () => {
    const gps = useGPS();
    const flags = gps.Flags ?? 0;
    let fixType = '\u2013';
    let fixColor = 'text-slate-400';
    if ((flags & Flags.FIXED) !== 0) { fixType = 'FIX'; fixColor = 'text-emerald-400'; }
    else if ((flags & Flags.FLOAT) !== 0) { fixType = 'FLOAT'; fixColor = 'text-amber-400'; }

    const pos = gps.Pose?.Pose?.Position;
    const ori = gps.Pose?.Pose?.Orientation;
    const fmt9 = (v: number | undefined) => v === undefined ? undefined : v.toFixed(9);
    const fmt2 = (v: number | undefined) => v === undefined ? undefined : v.toFixed(2);
    const fmt3 = (v: number | undefined) => v === undefined ? undefined : v.toFixed(3);
    const dr = (flags & Flags.DEAD_RECKONING) !== 0;
    return (
        <SubCard title="GPS (raw)">
            <Row label="Position X" value={fmt9(pos?.X)}/>
            <Row label="Position Y" value={fmt9(pos?.Y)}/>
            <Row label="Altitude (Z)" value={fmt2(pos?.Z)}/>
            <Row label="Orientation Z" value={fmt2(ori?.Z)}/>
            <Row label="Accuracy" value={gps.PositionAccuracy !== undefined ? `${fmt3(gps.PositionAccuracy)} m` : undefined}/>
            <Row label="Fix Type" value={fixType} color={fixColor}/>
            <Row label="RTK" value={(flags & Flags.RTK) !== 0 ? 'Yes' : 'No'}/>
            <Row label="Dead Reckoning" value={dr ? 'Yes' : 'No'} color={dr ? 'text-red-400' : undefined}/>
        </SubCard>
    );
};

export const DiagnosticsSection = () => {
    const [open, setOpen] = useState(false);
    const status = useStatus();
    return (
        <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full text-left px-5 py-3.5 flex items-center justify-between text-sm font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800/60 border-0 cursor-pointer transition ${open ? 'border-b border-slate-800' : ''}`}
            >
                <span>Diagnostics &amp; raw sensors</span>
                <span className={`text-xs text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {open ? (
                <div className="p-5 bg-slate-950/60">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        <EscCard title="Left Wheel ESC" esc={status.LeftEscStatus}/>
                        <EscCard title="Right Wheel ESC" esc={status.RightEscStatus}/>
                        <EscCard title="Mow ESC" esc={status.MowEscStatus}/>
                        <ImuCard/>
                        <WheelTicksCard/>
                        <GpsRawCard/>
                    </div>
                </div>
            ) : null}
        </div>
    );
};
