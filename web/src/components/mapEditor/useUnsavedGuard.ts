import {useEffect} from 'react';
import {useMapEditorStore} from './useMapEditorStore';

export function useUnsavedGuard() {
    useEffect(() => {
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (useMapEditorStore.getState().dirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, []);
}
