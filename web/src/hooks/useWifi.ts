import {useEffect, useState} from "react";
import {WifiStatus} from "../types/ros.ts";
import {useWS} from "./useWS.ts";

export const useWifi = () => {
    const [wifi, setWifi] = useState<WifiStatus>({});
    const stream = useWS<string>(
        () => { console.log({message: "WiFi Stream closed"}); },
        () => { console.log({message: "WiFi Stream connected"}); },
        (e) => { setWifi(prev => ({...prev, ...JSON.parse(e)})); },
    );
    useEffect(() => {
        stream.start("/api/openmower/subscribe/wifi");
        return () => { stream.stop(); };
    }, []);
    return wifi;
};
