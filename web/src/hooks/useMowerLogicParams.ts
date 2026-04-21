import {ReconfigureParams, useReconfigureParams} from "./useReconfigureParams.ts";

export type MowerLogicParams = ReconfigureParams & {
    manual_pause_mowing?: boolean;
    automatic_mode?: number;
    rain_mode?: number;
};

export const useMowerLogicParams = () =>
    useReconfigureParams<MowerLogicParams>("mowerLogicParams");
