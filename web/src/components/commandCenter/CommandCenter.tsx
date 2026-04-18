import {useHighLevelStatus} from "../../hooks/useHighLevelStatus.ts";
import {useStatus} from "../../hooks/useStatus.ts";
import {useSettings} from "../../hooks/useSettings.ts";
import {useMowerLogicParams} from "../../hooks/useMowerLogicParams.ts";
import {useMowerAction} from "../../hooks/useMowerAction.ts";
import {StateBanner} from "./StateBanner.tsx";
import {WhyLine} from "./WhyLine.tsx";
import {ReadinessList} from "./ReadinessList.tsx";
import {ContextActions} from "./ContextActions.tsx";
import {SettingsColumn} from "./SettingsColumn.tsx";
import {computeWhyLine} from "./whyLine.ts";
import {AUTO_MODE_LABELS, MOTOR_TEMP, RAIN_MODE_LABELS, Tone} from "./style.ts";

const MOWING_STATES = new Set(['MOWING', 'DOCKING', 'UNDOCKING', 'AREA_RECORDING']);

const settingFloat = (settings: Record<string, any>, key: string, fallback: number): number => {
    const raw = settings[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = parseFloat(String(raw));
    return Number.isFinite(n) ? n : fallback;
};

export const CommandCenter = () => {
    const {highLevelStatus} = useHighLevelStatus();
    const status = useStatus();
    const {settings} = useSettings();
    const params = useMowerLogicParams();
    const mowerAction = useMowerAction();

    const stateName = highLevelStatus.StateName;
    const emergency = !!highLevelStatus.Emergency || !!status.Emergency;
    const manualPause = !!params.manual_pause_mowing;
    const rainDetected = !!status.RainDetected;
    const rainMode = params.rain_mode;
    const automaticMode = params.automatic_mode;
    const batteryPercent = highLevelStatus.BatteryPercent;
    const gpsPercent = highLevelStatus.GpsQualityPercent;
    const isCharging = !!highLevelStatus.IsCharging;
    const isDocked = (status.VCharge ?? 0) > 5.0;

    const motorHot = settingFloat(settings, 'OM_MOWING_MOTOR_TEMP_HIGH', MOTOR_TEMP.hot);
    const motorCool = settingFloat(settings, 'OM_MOWING_MOTOR_TEMP_LOW', MOTOR_TEMP.cool);
    const motorTemp = status.MowEscStatus?.TemperatureMotor;
    const motorToneValue: Tone = motorTemp === undefined
        ? 'slate'
        : motorTemp < motorCool
            ? 'emerald'
            : motorTemp < motorHot
                ? 'amber'
                : 'red';

    const why = computeWhyLine({
        stateName,
        emergency,
        manualPause,
        rainDetected,
        rainMode,
        batteryPercent,
        isCharging,
        motorTempC: motorTemp,
        motorHotThreshold: motorHot,
        automaticMode,
    });

    const tags: string[] = [];
    if (stateName === 'MOWING') {
        if (highLevelStatus.CurrentArea !== undefined) tags.push(`Area ${highLevelStatus.CurrentArea}`);
        if (highLevelStatus.CurrentPath !== undefined) tags.push(`Path ${highLevelStatus.CurrentPath}`);
    } else {
        if (isDocked) tags.push('Docked');
        if (isCharging) tags.push('Charging');
    }

    // Banner metric tint: never red — low battery isn't a fault, just not full.
    const batteryTone: Tone = batteryPercent === undefined
        ? 'slate'
        : batteryPercent >= 0.95
            ? 'emerald'
            : 'amber';
    // Readiness row icon tone: ✓ when full, amber dot otherwise. Never a red cross —
    // low battery isn't a fault; the mower charges itself.
    const batteryRowTone: Tone = batteryPercent === undefined
        ? 'slate'
        : batteryPercent >= 0.95
            ? 'emerald'
            : 'amber';

    const gpsDisabledForDock = isDocked && (gpsPercent ?? 0) === 0 && !MOWING_STATES.has(stateName ?? '');
    const gpsTone: Tone = gpsDisabledForDock
        ? 'slate'
        : gpsPercent === undefined
            ? 'slate'
            : gpsPercent >= 0.9
                ? 'emerald'
                : gpsPercent >= 0.5
                    ? 'amber'
                    : 'red';

    const vBatt = status.VBattery;

    const setAutomaticMode = (v: number) => mowerAction("mower_logic", {
        Config: {Ints: [{Name: "automatic_mode", Value: v}]},
    })();
    const setRainMode = (v: number) => mowerAction("mower_logic", {
        Config: {Ints: [{Name: "rain_mode", Value: v}]},
    })();
    const setManualPauseParam = (v: boolean) => mowerAction("mower_logic", {
        Config: {Bools: [{Name: "manual_pause_mowing", Value: v}]},
    })();
    const setEmergency = (on: boolean) => mowerAction("emergency", {Emergency: on ? 1 : 0})();

    const rainRow = (() => {
        if (rainMode === 0 || rainMode === undefined) {
            return {
                kind: 'status' as const,
                label: 'Rain',
                value: rainDetected ? 'Yes' : 'No',
                tone: 'slate' as Tone,
                dimmed: true,
            };
        }
        if (rainDetected) {
            return {kind: 'status' as const, label: 'Rain', value: 'Yes', tone: 'red' as Tone};
        }
        return {kind: 'status' as const, label: 'Rain', value: 'No', tone: 'emerald' as Tone};
    })();

    const rows: any[] = [
        {
            kind: 'toggle' as const,
            label: 'Emergency',
            value: emergency ? 'ACTIVE' : 'OFF',
            on: emergency,
            danger: true,
            onChange: setEmergency,
        },
        {
            kind: 'toggle' as const,
            label: 'Manual Pause',
            value: manualPause ? 'ON' : 'OFF',
            on: manualPause,
            danger: true,
            onChange: setManualPauseParam,
        },
        {
            kind: 'status' as const,
            label: 'Battery',
            value: `${Math.round((batteryPercent ?? 0) * 100)}%${vBatt !== undefined ? ` \u00B7 ${vBatt.toFixed(1)}V` : ''}`,
            tone: batteryRowTone,
            hint: isCharging && (batteryPercent ?? 0) < 1 ? 'need 100%' : undefined,
        },
        {
            kind: 'status' as const,
            label: 'Motor Temp',
            value: motorTemp !== undefined ? `${motorTemp.toFixed(0)}°C` : '—',
            tone: motorToneValue,
        },
        rainRow,
        {
            kind: 'status' as const,
            label: 'GPS',
            value: `${Math.round((gpsPercent ?? 0) * 100)}%`,
            tone: gpsTone,
            hint: gpsDisabledForDock ? 'disabled' : undefined,
        },
        {kind: 'divider' as const},
        {
            kind: 'segmented' as const,
            label: 'Auto Mode',
            options: AUTO_MODE_LABELS,
            value: automaticMode ?? 0,
            onChange: setAutomaticMode,
            disabled: emergency,
        },
        {
            kind: 'segmented' as const,
            label: 'Rain Mode',
            options: RAIN_MODE_LABELS,
            value: rainMode ?? 0,
            warnIndex: 3,
            onChange: setRainMode,
            disabled: emergency,
        },
    ];

    return (
        <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden shadow">
            <StateBanner
                tone={why.tone}
                stateName={emergency ? 'EMERGENCY' : stateName}
                tags={tags}
                batteryPercent={batteryPercent}
                gpsPercent={gpsPercent}
                batteryTone={batteryTone}
                gpsTone={gpsTone}
            />
            <WhyLine why={why}/>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                <div className="p-5">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-3">
                        {emergency ? 'Status' : stateName === 'MOWING' ? 'Safety' : 'Readiness'}
                    </div>
                    <ReadinessList rows={rows}/>
                </div>
                <div className="p-5">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-3">
                        {emergency ? 'Recovery' : 'Actions'}
                    </div>
                    <ContextActions stateName={stateName} emergency={emergency} manualPause={manualPause}/>
                </div>
                <div className="p-5">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-3">
                        Settings
                    </div>
                    <SettingsColumn/>
                </div>
            </div>
        </div>
    );
};
