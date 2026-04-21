import {ReconfigureParams, useReconfigureParams} from "./useReconfigureParams.ts";

export type StallBreakerParams = ReconfigureParams & {
    enabled?: boolean;
    pulse_duty?: number;
};

export const useStallBreakerParams = () =>
    useReconfigureParams<StallBreakerParams>("stallBreakerParams");
