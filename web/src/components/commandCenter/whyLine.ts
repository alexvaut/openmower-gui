import {Tone} from "./style.ts";

export type WhyLineInput = {
    stateName?: string;
    emergency?: boolean;
    manualPause?: boolean;
    rainDetected?: boolean;
    rainMode?: number;
    batteryPercent?: number;
    isCharging?: boolean;
    motorTempC?: number;
    motorHotThreshold: number;
    automaticMode?: number;
};

export type WhyLineOutput = {
    tone: Tone;
    prefix?: string;
    message: string;
};

export const computeWhyLine = (i: WhyLineInput): WhyLineOutput => {
    if (i.emergency) {
        return {
            tone: 'red',
            prefix: 'EMERGENCY ACTIVE',
            message: '— Check /ll/emergency reason before resetting.',
        };
    }
    if (i.manualPause && i.rainDetected && i.rainMode === 3) {
        return {
            tone: 'amber',
            prefix: 'Blocked:',
            message: 'Rain detected & rain mode is Pause → manual_pause was set to ON (sticky).',
        };
    }
    if (i.manualPause) {
        return {
            tone: 'amber',
            prefix: 'Blocked:',
            message: "Manual pause is ON — mower won't auto-start. Toggle it off or press Start.",
        };
    }
    if (i.stateName === 'MOWING') {
        return {tone: 'emerald', message: 'All systems nominal — mowing.'};
    }
    if (i.stateName === 'DOCKING') {
        return {tone: 'sky', message: 'Returning to dock.'};
    }
    if (i.stateName === 'UNDOCKING') {
        return {tone: 'sky', message: 'Undocking.'};
    }
    if (i.stateName === 'AREA_RECORDING') {
        return {tone: 'sky', message: 'Recording area — use the More menu for recording actions.'};
    }
    if ((i.batteryPercent ?? 1) < 1 && i.isCharging) {
        return {
            tone: 'sky',
            prefix: 'Charging',
            message: '— will auto-start mowing when battery is full.',
        };
    }
    if ((i.batteryPercent ?? 1) < 1 && !i.isCharging) {
        const pct = Math.round((i.batteryPercent ?? 0) * 100);
        return {tone: 'amber', message: `Battery not full (${pct}%) and not charging.`};
    }
    if (i.motorTempC !== undefined && i.motorTempC >= i.motorHotThreshold) {
        return {
            tone: 'amber',
            message: `Motor cooling down (${i.motorTempC.toFixed(0)}°C, need < ${i.motorHotThreshold}°C).`,
        };
    }
    if (i.rainDetected && (i.rainMode ?? 0) > 0) {
        return {tone: 'amber', message: 'Rain detected — mower docked/waiting.'};
    }
    if (i.automaticMode === 0) {
        return {tone: 'emerald', message: 'Ready — auto mode is off, press Start to mow.'};
    }
    return {tone: 'emerald', message: 'Ready — waiting for auto-start.'};
};
