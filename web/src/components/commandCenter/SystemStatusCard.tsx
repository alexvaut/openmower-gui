import {useStatus} from "../../hooks/useStatus.ts";

type DotTone = 'green' | 'red' | 'gray';

const Dot = ({tone}: {tone: DotTone}) => {
    const cls = tone === 'green'
        ? 'bg-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.15)]'
        : tone === 'red'
            ? 'bg-red-400 shadow-[0_0_0_2px_rgba(239,68,68,0.15)]'
            : 'bg-slate-500 shadow-[0_0_0_2px_rgba(100,116,139,0.15)]';
    return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cls}`}/>;
};

const Item = ({tone, label}: {tone: DotTone; label: string}) => (
    <div className="flex items-center gap-2 text-sm text-slate-200">
        <Dot tone={tone}/>
        <span>{label}</span>
    </div>
);

// Power rails toggle on/off based on what the mower currently needs (GPS is off
// while docked, ESCs sleep when idle, etc.). A `false` reading is not a fault —
// only "present/powered" (green) or "not reporting" (gray). We never render red
// here because we have no real fault signal.
const powerTone = (v: boolean | undefined): DotTone => (v ? 'green' : 'gray');

export const SystemStatusCard = () => {
    const status = useStatus();
    const mowerOn = status.MowerStatus !== undefined ? status.MowerStatus === 255 : undefined;
    return (
        <div className="flex-1 min-w-[280px] rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="px-5 py-2.5 border-b border-slate-800 text-sm font-semibold text-slate-200">System Status</div>
            <div className="p-5">
                <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                    <Item tone={powerTone(status.RaspberryPiPower)} label="Raspberry Pi"/>
                    <Item tone={powerTone(status.GpsPower)} label="GPS Power"/>
                    <Item tone={powerTone(status.EscPower)} label="ESC Power"/>
                    <Item tone={powerTone(mowerOn)} label="Mower Board"/>
                    <Item tone={powerTone(status.UiBoardAvailable)} label="UI Board"/>
                    <Item tone={status.RainDetected === undefined ? 'gray' : status.RainDetected ? 'red' : 'green'} label="Rain Sensor"/>
                </div>
            </div>
        </div>
    );
};
