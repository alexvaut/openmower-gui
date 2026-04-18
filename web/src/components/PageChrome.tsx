import {createContext, ReactNode, useContext, useEffect, useMemo, useState} from 'react';

type ChromeState = {title: string; controls: ReactNode | null};

const Ctx = createContext<{
    chrome: ChromeState;
    setChrome: (c: ChromeState) => void;
}>({chrome: {title: '', controls: null}, setChrome: () => {}});

export function PageChromeProvider({children}: {children: ReactNode}) {
    const [chrome, setChrome] = useState<ChromeState>({title: '', controls: null});
    const value = useMemo(() => ({chrome, setChrome}), [chrome]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePageChromeValue() {
    return useContext(Ctx).chrome;
}

export function PageChrome({title, children}: {title: string; children?: ReactNode}) {
    const {setChrome} = useContext(Ctx);
    useEffect(() => {
        setChrome({title, controls: children ?? null});
    }, [title, children, setChrome]);
    useEffect(() => () => setChrome({title: '', controls: null}), [setChrome]);
    return null;
}
