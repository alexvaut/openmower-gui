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

export type MowerLogicParams = {
    manual_pause_mowing?: boolean;
    automatic_mode?: number;
    rain_mode?: number;
    [key: string]: boolean | number | string | undefined;
};

const flatten = (raw: RawConfig): MowerLogicParams => {
    const out: MowerLogicParams = {};
    (raw.Bools ?? []).forEach(p => { if (p.Name !== undefined) out[p.Name] = p.Value; });
    (raw.Ints ?? []).forEach(p => { if (p.Name !== undefined) out[p.Name] = p.Value; });
    (raw.Doubles ?? []).forEach(p => { if (p.Name !== undefined) out[p.Name] = p.Value; });
    (raw.Strs ?? []).forEach(p => { if (p.Name !== undefined) out[p.Name] = p.Value; });
    return out;
};

export const useMowerLogicParams = () => {
    const [params, setParams] = useState<MowerLogicParams>({});
    const stream = useWS<string>(
        () => console.log("mowerLogicParams stream closed"),
        () => console.log("mowerLogicParams stream connected"),
        (e) => {
            try {
                setParams(flatten(JSON.parse(e) as RawConfig));
            } catch {
                // ignore malformed frame
            }
        }
    );
    useEffect(() => {
        stream.start("/api/openmower/subscribe/mowerLogicParams");
        return () => stream.stop();
    }, []);
    return params;
};
