import {useApi} from "./useApi.ts";

export const useMowerAction = () => {
    const guiApi = useApi()
    return (command: string, args: Record<string, any> = {}) => async () => {
        try {
            const res = await guiApi.openmower.callCreate(command, args)
            if (res.error) {
                throw new Error(res.error.error)
            }
        } catch (e: any) {
            throw new Error(e.message)
        }
    };
};
