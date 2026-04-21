import {useEffect, useState} from "react";
import {useWS} from "./useWS.ts";

type NamedBool = { Name?: string; Value?: boolean };
type NamedInt = { Name?: string; Value?: number };
type NamedDouble = { Name?: string; Value?: number };
type NamedStr = { Name?: string; Value?: string };

type RawConfig = {
    Bools?: NamedBool[];
    Ints?: NamedInt[];
    Doubles?: NamedDouble[];
    Strs?: NamedStr[];
};

export type ReconfigureParams = {
    [key: string]: boolean | number | string | undefined;
};

const flatten = (raw: RawConfig): ReconfigureParams => {
    const out: ReconfigureParams = {};
    (raw.Bools ?? []).forEach(p => { if (p.Name !== undefined) out[p.Name] = p.Value; });
    (raw.Ints ?? []).forEach(p => { if (p.Name !== undefined) out[p.Name] = p.Value; });
    (raw.Doubles ?? []).forEach(p => { if (p.Name !== undefined) out[p.Name] = p.Value; });
    (raw.Strs ?? []).forEach(p => { if (p.Name !== undefined) out[p.Name] = p.Value; });
    return out;
};

export const useReconfigureParams = <T extends ReconfigureParams = ReconfigureParams>(topic: string): T => {
    const [params, setParams] = useState<T>({} as T);
    const stream = useWS<string>(
        () => console.log(`${topic} stream closed`),
        () => console.log(`${topic} stream connected`),
        (e) => {
            try {
                setParams(flatten(JSON.parse(e) as RawConfig) as T);
            } catch {
                // ignore malformed frame
            }
        }
    );
    useEffect(() => {
        stream.start(`/api/openmower/subscribe/${topic}`);
        return () => stream.stop();
    }, []);
    return params;
};
